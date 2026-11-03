import json
from datetime import date
from decimal import Decimal
from pathlib import Path
import tempfile
import unittest

import growth_observed_bridge as bridge
import refresh_growth as growth
import refresh_crm_ssot as ssot


class BridgeTests(unittest.TestCase):
    def test_catalog_validation_never_extends_coverage(self):
        payload = {'start': '2026-09-01', 'end': '2026-10-29', 'rows': [
            {'account_id': 'account', 'campaign_id': '10', 'ad_group_id': '20'}]}
        self.assertIs(bridge.validate_catalog(payload, 'ad_group_id', date(2026, 10, 29)), payload)
        with self.assertRaisesRegex(ssot.RefreshError, 'before_target'):
            bridge.validate_catalog(payload, 'ad_group_id', date(2026, 11, 2))
        self.assertEqual(payload['end'], '2026-10-29')

    def test_catalog_rejects_unsafe_ids_and_ambiguous_parents(self):
        payload = {'start': '2026-09-01', 'end': '2026-10-29', 'rows': [
            {'account_id': 'account', 'campaign_id': '10', 'ad_group_id': 20.0}]}
        with self.assertRaisesRegex(ssot.RefreshError, 'invalid_ids'):
            bridge.validate_catalog(payload, 'ad_group_id')
        payload['rows'] = [{'account_id': 'account', 'campaign_id': campaign, 'ad_group_id': '20'} for campaign in ('10', '11')]
        with self.assertRaisesRegex(ssot.RefreshError, 'ambiguous'):
            bridge.validate_catalog(payload, 'ad_group_id')

    def setUp(self):
        self.order = dict(source_order_id='1', data='2026-10-01', canal='Google ADS',
                          campaign_id='10', term='', content='20', total_amount=Decimal('100'))
        self.item = dict(source_order_id='1', order_sk='o1', order_item_sk='i1', sku='sku',
                         paid_date_brt='2026-10-01', total_amount=Decimal('100'), is_valid_order=True,
                         line_gross_amount=Decimal('100'), line_discount_amount=Decimal('0'))
        self.catalogs = {'Google ADS': {'20': ('10', 'account')}, 'Meta ADS': {'30': ('11', 'meta')}}
        self.campaigns = {('Google ADS', '10'): 'Google', ('Meta ADS', '11'): 'Meta'}
        self.products = {'sku': {'product_id': 'canonical_rs8', 'produto': 'RS8'}}
        self.window = {'start': '2026-09-01', 'end': '2026-10-29'}

    def build(self, orders=None, items=None):
        return bridge.build(orders or [self.order], items if items is not None else [self.item],
                            self.products, self.catalogs, self.campaigns, self.window)

    def test_google_content_is_group_not_creative(self):
        views = self.build()
        self.assertEqual(views['ad_group']['rows'][0]['ad_group_id'], '20')
        self.assertNotIn('ad', views)
        self.assertEqual(views['ad_group']['rows'][0]['receita'], '100')
        self.assertIsNone(views['ad_group']['rows'][0]['sessoes'])

    def test_campaign_channel_matches_official_classification(self):
        self.assertEqual(bridge.campaign_channel('Google Ads'), 'Google ADS')
        self.assertEqual(bridge.campaign_channel(' Meta Ads 2 '), 'Meta ADS')
        self.assertEqual(bridge.campaign_channel('E-mail'), 'E-mail')

    def test_reject_conflict_and_unknown_campaign(self):
        conflict = dict(self.order, campaign_id='99')
        self.assertEqual(self.build([conflict])['ad_group']['rows'], [])
        self.campaigns[('Google ADS', '99')] = 'Other'
        self.assertEqual(self.build([conflict])['ad_group']['rows'], [])
        self.assertEqual(len(self.build([conflict])['campaign_product']['rows']), 1)

    def test_meta_parent_derivation_without_name_join(self):
        order = dict(self.order, canal='Meta ADS', term='30', campaign_id='nome nao usado', content='unknown')
        self.assertEqual(bridge.resolve(order, self.catalogs, self.campaigns), ('11', '30'))
        self.assertIsNone(bridge.resolve(dict(order, campaign_id='999'), self.catalogs, self.campaigns))

    def test_ambiguous_parent_or_account_is_not_accepted(self):
        rows = [dict(adset_id='30', campaign_id='11', account_id='a'),
                dict(adset_id='30', campaign_id='11', account_id='b')]
        self.assertEqual(bridge.group_index(rows, 'adset_id'), {})
        self.assertEqual(bridge.group_index(rows[:1] * 2, 'adset_id'), {'30': ('11', 'a')})

    def test_deduplicate_same_product_lines_and_keep_money_null(self):
        result = self.build(items=[self.item, dict(self.item, order_item_sk='i2')])
        row = result['campaign_product']['rows'][0]
        self.assertEqual(row['pedidos'], 1)
        self.assertEqual(row['product_id'], 'canonical_rs8')
        self.assertIsNone(row['receita'])
        self.assertIsNone(row['sessoes'])
        self.assertNotIn('source_order_id', json.dumps(result))

    def test_gifts_null_discount_and_unmapped_are_separate(self):
        items = [dict(self.item, line_discount_amount=Decimal('100')),
                 dict(self.item, order_item_sk='i2', line_discount_amount=None),
                 dict(self.item, order_item_sk='i3', sku='unmapped')]
        view = self.build(items=items)['campaign_product']
        self.assertEqual(view['rows'], [])
        self.assertEqual(view['coverage'][0]['giftItems'], 1)
        self.assertEqual(view['coverage'][0]['unknownPriceItems'], 1)
        self.assertEqual(view['coverage'][0]['unmappedProductItems'], 1)

    def test_identity_date_amount_and_validity_fail_closed(self):
        for change in [dict(total_amount=Decimal('101')), dict(paid_date_brt='2026-09-30'),
                       dict(is_valid_order=False), dict(order_item_sk=None)]:
            self.assertEqual(self.build(items=[dict(self.item, **change)])['campaign_product']['rows'], [])
        self.assertEqual(self.build(items=[self.item, self.item])['campaign_product']['rows'], [])
        with self.assertRaises(ssot.RefreshError):
            self.build([self.order, self.order])
        with self.assertRaises(ssot.RefreshError):
            self.build([dict(self.order, data='2026-08-01')])

    def test_distinct_products_are_explicitly_nonadditive(self):
        self.products['sku2'] = {'product_id': 'canonical_rs7', 'produto': 'RS7'}
        views = self.build(items=[self.item, dict(self.item, order_item_sk='i2', sku='sku2')])
        self.assertEqual(len(views['campaign_product']['rows']), 2)
        self.assertEqual(views['campaign_product']['coverage'][0]['campaignProductOrders'], 1)
        self.assertTrue(all(row['productOrdersNonAdditive'] for row in views['campaign_product']['rows']))

    def test_failure_never_restores_legacy_utm_as_creative_or_group(self):
        class Reader:
            jobs = []
            def __init__(self, end): pass
            def read(self, key): raise ssot.RefreshError('growth_query_timeout')
            def close(self): pass
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'snapshot.json'
            path.write_text(json.dumps({'data': [dict(view=key, rows=[dict(data='2026-10-01')])
                for key in growth.LABELS]}))
            growth.run(date(2026, 10, 29), dict(source='ssot', rows=[], extracted_at='now'),
                       output=path, reader_factory=Reader, seed=lambda old: old)
            views = {row['view']: row for row in json.loads(path.read_text())['data']}
            self.assertEqual(views['ad']['rows'], [])
            self.assertEqual(views['ad_group']['rows'], [])
            self.assertEqual(views['campaign_product']['rows'], [])

    def test_expired_catalog_does_not_claim_new_day_coverage(self):
        built = self.build()
        class Reader:
            jobs = []
            def __init__(self, end): pass
            def read(self, key):
                return built[key] if key in bridge.KEYS else dict(view=key, rows=[
                    dict(data='2026-10-30', pedidos=1, sessoes=None, receita=None)])
            def close(self): pass
        with tempfile.TemporaryDirectory() as folder:
            result = growth.run(date(2026, 10, 30), dict(source='ssot', rows=[], extracted_at='now'),
                output=Path(folder)/'snapshot.json', reader_factory=Reader, seed=lambda old: old)
            observed = [v for v in result['views'] if v['id'] in bridge.KEYS]
            self.assertTrue(all(v['status'] == 'stale' for v in observed))
            self.assertTrue(all(v['coveredThrough'] == '2026-10-29' for v in observed))

    def test_no_events_on_last_day_does_not_reduce_validated_window(self):
        built = self.build()
        for view in built.values():
            for row in view['rows']:
                row['data'] = '2026-10-28'
        class Reader:
            jobs = []
            def __init__(self, end): pass
            def read(self, key):
                return built[key] if key in bridge.KEYS else dict(view=key, rows=[
                    dict(data='2026-10-29', pedidos=1, sessoes=None, receita=None)])
            def close(self): pass
        commercial = dict(source='ssot', rows=[], extracted_at='now')
        with tempfile.TemporaryDirectory() as folder:
            from unittest.mock import patch
            with patch('refresh_growth.channel_view', return_value=dict(view='channel', rows=[dict(data='2026-10-29')])):
                result = growth.run(date(2026, 10, 29), commercial,
                    output=Path(folder)/'snapshot.json', reader_factory=Reader, seed=lambda old: old)
        self.assertEqual(result['status'], 'current')
        self.assertEqual(result['coveredThrough'], '2026-10-29')
        self.assertEqual(result['latestDate'], '2026-10-28')


if __name__ == '__main__':
    unittest.main()
