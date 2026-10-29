const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const local = (name) => JSON.parse(fs.readFileSync(path.join(root, ".local", name), "utf8"));
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const valid = (value) => {
  const text = String(value || "").trim();
  return text && !["(not set)", "(not provided)"].includes(text) ? text : null;
};
const paid = (value) => /^(Paid|Cross-network$|Display$)/i.test(String(value || ""));
const key = (parts) => parts.map((value) => value || "(sem dado)").join("|");
const add = (map, identity, row) => {
  if (!map.has(identity)) map.set(identity, { ...row, sessoes: 0, pedidos: 0, receita: 0, visualizacoes_item: 0, itens_comprados: 0, receita_item: 0 });
  const item = map.get(identity);
  item.sessoes += num(row.sessoes);
  item.pedidos += num(row.pedidos);
  item.receita += num(row.receita);
  item.visualizacoes_item += num(row.visualizacoes_item);
  item.itens_comprados += num(row.itens_comprados);
  item.receita_item += num(row.receita_item);
};

const nameMaps = { campaign: new Map(), group: new Map(), ad: new Map() };
function collectNames(rows) {
  rows.forEach((row) => {
    const campaignId = valid(row.campaign_id);
    const groupId = valid(row.ad_group_id || row.adset_id);
    const adId = valid(row.ad_id);
    if (campaignId && row.campaign) nameMaps.campaign.set(campaignId, row.campaign);
    if (groupId && (row.ad_group_name || row.adset_name)) nameMaps.group.set(groupId, row.ad_group_name || row.adset_name);
    if (adId && row.ad_name) nameMaps.ad.set(adId, row.ad_name);
  });
}
collectNames(local("gads_ads.json").data || []);
collectNames(local("meta_ads_monthly.json").data || []);
const campaignName = (id) => id ? nameMaps.campaign.get(id) || id : null;
const groupName = (id) => id ? nameMaps.group.get(id) || id : null;
const adName = (id) => id ? nameMaps.ad.get(id) || id : null;

const mediaMaps = { campaign: new Map(), ad_group: new Map(), ad: new Map() };
const media = local("ga4_media.json").data || [];
media.filter((row) => paid(row.session_default_channel_group)).forEach((row) => {
  const channel = String(row.session_default_channel_group);
  const campaignId = valid(row.session_google_ads_campaign_id) || valid(row.session_campaign_id);
  const groupId = valid(row.session_google_ads_ad_group_id);
  const adId = valid(row.session_google_ads_creative_id);
  const base = { canal: channel, campanha_id: campaignId, campanha: campaignName(campaignId), grupo_anuncio_id: groupId, grupo_anuncio: groupName(groupId), anuncio_id: adId, anuncio: adName(adId), sessoes: num(row.sessions), pedidos: num(row.ecommerce_purchases), receita: num(row.purchase_revenue) };
  if (campaignId) add(mediaMaps.campaign, key([channel, campaignId]), { ...base, view: "campaign" });
  if (campaignId && groupId) add(mediaMaps.ad_group, key([channel, campaignId, groupId]), { ...base, view: "ad_group" });
  if (campaignId && groupId && adId) add(mediaMaps.ad, key([channel, campaignId, groupId, adId]), { ...base, view: "ad" });
});

const productMaps = { channel_product: new Map(), campaign_product: new Map(), ad_group_product: new Map(), ad_product: new Map() };
const productFiles = ["ga4_products_q4_2025.json", "ga4_products_q1_2026.json", "ga4_products_q2_2026.json", "ga4_products_q3_2026_07.json", "ga4_products_q3_2026_08.json", "ga4_products_q3_2026_09.json"];
productFiles.flatMap((name) => local(name).data || []).filter((row) => paid(row.session_default_channel_group)).forEach((row) => {
  const channel = String(row.session_default_channel_group);
  const campaignId = valid(row.session_campaign_id);
  const groupId = valid(row.session_google_ads_ad_group_id);
  const adId = valid(row.session_google_ads_creative_id);
  const productId = valid(row.item_id);
  if (!productId) return;
  const base = { canal: channel, campanha_id: campaignId, campanha: campaignName(campaignId), grupo_anuncio_id: groupId, grupo_anuncio: groupName(groupId), anuncio_id: adId, anuncio: adName(adId), produto_id: productId, produto: row.item_name || productId, visualizacoes_item: num(row.items_viewed), itens_comprados: num(row.items_purchased), receita_item: num(row.item_revenue) };
  add(productMaps.channel_product, key([channel, productId]), { ...base, view: "channel_product" });
  if (campaignId) add(productMaps.campaign_product, key([channel, campaignId, productId]), { ...base, view: "campaign_product" });
  if (campaignId && groupId) add(productMaps.ad_group_product, key([channel, campaignId, groupId, productId]), { ...base, view: "ad_group_product" });
  if (campaignId && groupId && adId) add(productMaps.ad_product, key([channel, campaignId, groupId, adId, productId]), { ...base, view: "ad_product" });
});

const cleanMedia = (map) => [...map.values()].map((row) => ({ ...row, metric: "GA4 compras / sessoes", source_status: "Alternativa GA4", window_grain: "2025-10-01 a 2026-09-30" }));
const cleanProduct = (map) => [...map.values()].map((row) => ({ ...row, metric: "GA4 itens comprados / visualizacoes de item", source_status: "Alternativa GA4 produto", window_grain: "2025-10-01 a 2026-09-30" }));
const DIMENSION_FIELDS = ["canal", "campanha_id", "campanha", "grupo_anuncio_id", "grupo_anuncio", "anuncio_id", "anuncio", "produto_id", "produto"];
function compact(rows) {
  const dictionaries = Object.fromEntries(DIMENSION_FIELDS.map((field) => [field, []]));
  const indexes = Object.fromEntries(DIMENSION_FIELDS.map((field) => [field, new Map()]));
  const encoded = rows.map((row) => {
    const dims = DIMENSION_FIELDS.map((field) => {
      const value = row[field] || null;
      if (!value) return -1;
      if (!indexes[field].has(value)) { indexes[field].set(value, dictionaries[field].length); dictionaries[field].push(value); }
      return indexes[field].get(value);
    });
    return [...dims, num(row.sessoes), num(row.pedidos), num(row.receita), num(row.visualizacoes_item), num(row.itens_comprados), num(row.receita_item)];
  });
  return { encoding: "dimensions-v1", fields: DIMENSION_FIELDS, metrics: ["sessoes", "pedidos", "receita", "visualizacoes_item", "itens_comprados", "receita_item"], dictionaries, rows: encoded };
}
const payload = {
  kind: "ga4_growth_alternative_v1",
  source: [".local/ga4_media.json", ".local/ga4_products_q4_2025.json", ".local/ga4_products_q1_2026.json", ".local/ga4_products_q2_2026.json", ".local/ga4_products_q3_2026_07.json", ".local/ga4_products_q3_2026_08.json", ".local/ga4_products_q3_2026_09.json"],
  window: { start: "2025-10-01", end: "2026-09-30" },
  methodology: { media_rate: "SUM(ecommerce_purchases) / SUM(sessions)", product_rate: "SUM(items_purchased) / SUM(items_viewed)", attribution: "GA4 exported dimensions; no SSOT substitution", comparison: "not available in this snapshot", channel_rule: "GA4 paid channel groups only" },
  views: {
    campaign: compact(cleanMedia(mediaMaps.campaign)),
    ad_group: compact(cleanMedia(mediaMaps.ad_group)),
    ad: compact(cleanMedia(mediaMaps.ad)),
    channel_product: compact(cleanProduct(productMaps.channel_product)),
    campaign_product: compact(cleanProduct(productMaps.campaign_product)),
    ad_group_product: compact(cleanProduct(productMaps.ad_group_product)),
    ad_product: compact(cleanProduct(productMaps.ad_product))
  }
};
const output = path.join(root, "data", "ga4-growth-alternative.json");
fs.writeFileSync(output, JSON.stringify(payload));
console.log(JSON.stringify({ output, views: Object.fromEntries(Object.entries(payload.views).map(([name, view]) => [name, view.rows.length])) }));
