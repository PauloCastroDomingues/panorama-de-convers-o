"""Observed SSOT joins. Media catalogs identify entities, never supply KPIs."""
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
import json
import os
from pathlib import Path

import refresh_crm_ssot as ssot

CONTRACT = 'ssot_observed_ids_v1'
KEYS = ('ad_group', 'campaign_product', 'ad_group_product')
REASON = ('Cobertura parcial por IDs conferidos; sem sessoes neste grao. '
          'Produtos: somente itens com valor positivo apos desconto conhecido; '
          'brindes e descontos ausentes separados. Receita de produto nao liberada. '
          'Pedidos por produto nao sao aditivos entre produtos.')

ORDERS_SQL = """SELECT data, source_order_id, total_amount,
 TRIM(COALESCE(utm_campaign,'')) campaign_id,
 TRIM(COALESCE(utm_term,'')) term, TRIM(COALESCE(utm_content,'')) content,
 `reise-ssot.mart_growth_us.fn_canal_pedido`(
 LOWER(TRIM(COALESCE(last_source_description,utm_source,last_source,''))),
 LOWER(TRIM(COALESCE(utm_source,''))),
 LOWER(TRIM(COALESCE(utm_medium,'')))) canal
 FROM `reise-ssot.mart_growth_us.shopify_order_utm_resolved_v`
 WHERE data BETWEEN @start AND @end"""

ITEMS_SQL = """SELECT o.source_order_id, o.order_sk, o.paid_date_brt,
 o.total_amount, o.is_valid_order, i.order_item_sk, i.sku,
 i.line_gross_amount, i.line_discount_amount
 FROM `reise-ssot.mart_shared.fct_order` o
 LEFT JOIN `reise-ssot.mart_shared.fct_order_item` i USING(order_sk)
 WHERE o.source_system='shopify' AND o.source_order_id IN UNNEST(@ids)"""


def text_id(value):
    return str(value).strip() if value is not None else ''


def campaign_channel(value):
    folded = text_id(value).lower()
    if folded in ('meta ads', 'meta ads 1', 'meta ads 2'):
        return 'Meta ADS'
    return 'Google ADS' if folded == 'google ads' else text_id(value)


def group_index(rows, field):
    candidates = defaultdict(set)
    for row in rows:
        group, campaign, account = (text_id(row.get(k)) for k in (field, 'campaign_id', 'account_id'))
        if group:
            candidates[group].add((campaign, account))
    return {key: next(iter(values)) for key, values in candidates.items()
            if len(values) == 1 and all(next(iter(values)))}


def validate_catalog(payload, field, target=None):
    try:
        start, end = (date.fromisoformat(payload[key]) for key in ('start', 'end'))
    except (ValueError, TypeError, KeyError):
        raise ssot.RefreshError('growth_identity_catalog_invalid_window') from None
    rows = payload.get('rows')
    if start > end or not isinstance(rows, list) or not rows:
        raise ssot.RefreshError('growth_identity_catalog_invalid_window')
    for row in rows:
        if not isinstance(row, dict) or any(not isinstance(row.get(key), str) or not row[key].strip()
                                            for key in ('account_id', 'campaign_id', field)):
            raise ssot.RefreshError('growth_identity_catalog_invalid_ids')
    if not group_index(rows, field):
        raise ssot.RefreshError('growth_identity_catalog_ambiguous')
    if target is not None and not start <= target <= end:
        raise ssot.RefreshError('growth_identity_catalog_before_target')
    return payload


def resolve(order, catalogs, campaigns):
    channel, campaign = order['canal'], text_id(order['campaign_id'])
    group = text_id(order['content'] if channel == 'Google ADS' else order['term'])
    parent = catalogs.get(channel, {}).get(group)
    # A numeric, conflicting UTM is evidence against a link, not a fallback.
    if parent and ((channel == 'Google ADS' and campaign == parent[0]) or
                   (channel == 'Meta ADS' and (not campaign.isdigit() or campaign == parent[0]))):
        campaign = parent[0]
    else:
        group = ''
    if (channel, campaign) not in campaigns:
        return None
    return campaign, group


def equal(left, right):
    return left is not None and right is not None and abs(Decimal(left) - Decimal(right)) < Decimal('.01')


def build(orders, items, products, catalogs, campaigns, window):
    identities = [text_id(row['source_order_id']) for row in orders]
    if not all(identities) or len(set(identities)) != len(identities):
        raise ssot.RefreshError('growth_duplicate_order_identity')
    by_order = defaultdict(list)
    for item in items:
        by_order[text_id(item['source_order_id'])].append(item)
    buckets = {key: {} for key in KEYS}
    audit = defaultdict(lambda: defaultdict(int))

    def add(key, order, campaign, group='', product=None):
        day = ssot.iso_date(order['data'])
        product_id = product['product_id'] if product else ''
        identity = (day, order['canal'], campaign, group, product_id)
        if identity not in buckets[key]:
            buckets[key][identity] = {'data': day, 'canal': order['canal'],
                'campaign_id': campaign, 'campanha': campaigns[(order['canal'], campaign)],
                'ad_group_id': group, 'grupo_anuncio': group,
                'product_id': product_id, 'produto': product['produto'] if product else '',
                'pedidos': 0, 'sessoes': None, 'receita': None if product else Decimal(0),
                'is_estimado': False, 'identityValidated': True,
                'partialLinkage': True, 'productOrdersNonAdditive': bool(product),
                'metodo_rateio': 'Sem rateio; IDs conferidos', '_orders': set()}
        row = buckets[key][identity]
        oid = text_id(order['source_order_id'])
        if oid not in row['_orders']:
            row['_orders'].add(oid)
            row['pedidos'] += 1
            if not product:
                row['receita'] = (row['receita'] + Decimal(order['total_amount'])
                                  if row['receita'] is not None and order['total_amount'] is not None else None)

    for order in orders:
        if order['canal'] not in ('Meta ADS', 'Google ADS'):
            continue
        day = ssot.iso_date(order['data'])
        if not window['start'] <= day <= window['end']:
            raise ssot.RefreshError('growth_bridge_outside_window')
        check = audit[(day, order['canal'])]
        check['sourceOrders'] += 1
        link = resolve(order, catalogs, campaigns)
        if not link:
            check['unmatchedCampaignOrders'] += 1
            continue
        campaign, group = link
        check['campaignOrders'] += 1
        if group:
            check['groupOrders'] += 1
            add('ad_group', order, campaign, group)
        else:
            check['unmatchedGroupOrders'] += 1
        lines = by_order.get(text_id(order['source_order_id']), [])
        item_ids = [text_id(item['order_item_sk']) for item in lines]
        if (not lines or not all(item_ids) or len(item_ids) != len(set(item_ids))
                or len({text_id(item['order_sk']) for item in lines}) != 1
                or any(item['is_valid_order'] is not True
                       or ssot.iso_date(item['paid_date_brt']) != day
                       or not equal(item['total_amount'], order['total_amount']) for item in lines)):
            check['invalidItemBridgeOrders'] += 1
            continue
        matched_products = {}
        for item in lines:
            gross, discount = item['line_gross_amount'], item['line_discount_amount']
            if gross is None or discount is None:
                check['unknownPriceItems'] += 1
                continue
            net = Decimal(gross) - Decimal(discount)
            if net <= 0:
                check['giftItems' if net == 0 else 'invalidPriceItems'] += 1
                continue
            product = products.get(text_id(item['sku']))
            if not product:
                check['unmappedProductItems'] += 1
                continue
            matched_products[product['product_id']] = product
        if matched_products:
            check['campaignProductOrders'] += 1
            if group:
                check['groupProductOrders'] += 1
        for product in matched_products.values():
            add('campaign_product', order, campaign, product=product)
            if group:
                add('ad_group_product', order, campaign, group, product)

    coverage = [dict(data=day, canal=channel, **counts) for (day, channel), counts in sorted(audit.items())]
    views = {}
    for key, values in buckets.items():
        rows = []
        for _, value in sorted(values.items()):
            value.pop('_orders')
            value['receita'] = ssot.revenue(value['receita'])
            rows.append(value)
        views[key] = {'view': key, 'rows': rows, 'contract': CONTRACT,
            'source': 'SSOT: shopify_order_utm_resolved_v + fct_order + fct_order_item; catalogos de IDs conferidos',
            'generatedAt': datetime.now(ssot.TIMEZONE).isoformat(),
            'validatedWindow': window, 'coverage': coverage, 'reason': REASON,
            'conversionAvailable': False, 'partialLinkage': True}
    return views


def collect(reader):
    catalogs = {}
    starts, ends = [], []
    for channel, filename, field in (
            ('Meta ADS', 'meta', 'adset_id'), ('Google ADS', 'google', 'ad_group_id')):
        directory = Path(os.environ.get('PANORAMA_GROWTH_CATALOG_DIR', ssot.ROOT / '.local'))
        path = directory / f'growth-bridge-{filename}-catalog.json'
        if not path.exists():
            raise ssot.RefreshError('growth_identity_catalog_missing')
        payload = validate_catalog(json.loads(path.read_text(encoding='utf-8')), field)
        starts.append(date.fromisoformat(payload['start']))
        ends.append(date.fromisoformat(payload['end']))
        catalogs[channel] = group_index(payload['rows'], field)
    start, end = max(starts), min(*ends, reader.end)
    if start > end:
        raise ssot.RefreshError('growth_identity_catalog_outside_window')
    window = {'start': start.isoformat(), 'end': end.isoformat()}
    bq = reader.bq
    args = [bq.ScalarQueryParameter('start', 'DATE', start), bq.ScalarQueryParameter('end', 'DATE', end)]
    orders = reader.query(ORDERS_SQL, 'US', args, 'observed_orders')
    campaign_rows = reader.query('''SELECT DISTINCT CAST(campanha_id AS STRING) campaign_id,
        canal, campanha FROM `reise-ssot.mart_growth_us.aquisicao_por_campanha_daily`
        WHERE data BETWEEN @start AND @end''', 'US', args, 'identity_campaigns')
    campaigns = {}
    for row in campaign_rows:
        channel = campaign_channel(row['canal'])
        campaigns[(channel, text_id(row['campaign_id']))] = row['campanha'] or row['campaign_id']
    ids = [text_id(row['source_order_id']) for row in orders if row['canal'] in catalogs]
    items = reader.query(ITEMS_SQL, 'southamerica-east1', [bq.ArrayQueryParameter('ids', 'STRING', ids)], 'observed_items') if ids else []
    skus = sorted({text_id(item['sku']) for item in items if item['sku']})
    product_rows = reader.query('''SELECT sku, COUNT(DISTINCT product_key) candidates,
        ANY_VALUE(product_key) product_id, MIN(product_display_name) produto
        FROM `reise-ssot.mart_growth_us.shopify_product_catalog_canonical_v`
        WHERE sku IN UNNEST(@skus) GROUP BY sku''', 'US',
        [bq.ArrayQueryParameter('skus', 'STRING', skus)], 'identity_products') if skus else []
    products = {row['sku']: row for row in product_rows
                if row['candidates'] == 1 and row['product_id']}
    return build(orders, items, products, catalogs, campaigns, window)
