import { query } from './db.js';

export type ShopChannel = 'pinduoduo' | 'qianniu';

export type ShopRow = {
  id: string;
  tenant_id: string;
  display_name: string;
  channel: ShopChannel;
  external_keys: string[];
  positioning: string;
  logistics: string;
  after_sales: string;
  forbidden: string;
  transfer_rules: string;
  created_at: Date;
  updated_at: Date;
};

function asKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  return [];
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

export async function listShops(tenantId: string): Promise<ShopRow[]> {
  const r = await query<ShopRow>(
    `SELECT id, tenant_id, display_name, channel, external_keys,
            positioning, logistics, after_sales, forbidden, transfer_rules,
            created_at, updated_at
     FROM shops WHERE tenant_id = $1 ORDER BY created_at ASC`,
    [tenantId],
  );
  return r.rows.map((row) => ({
    ...row,
    external_keys: asKeys(row.external_keys),
  }));
}

export async function getShop(
  tenantId: string,
  shopId: string,
): Promise<ShopRow | null> {
  const r = await query<ShopRow>(
    `SELECT id, tenant_id, display_name, channel, external_keys,
            positioning, logistics, after_sales, forbidden, transfer_rules,
            created_at, updated_at
     FROM shops WHERE id = $1 AND tenant_id = $2`,
    [shopId, tenantId],
  );
  if (!r.rows[0]) return null;
  return {
    ...r.rows[0],
    external_keys: asKeys(r.rows[0].external_keys),
  };
}

/** 用渠道＋任一 external_key／顯示名對上 Shop；對不上回 null（保守） */
export async function resolveShop(opts: {
  tenantId: string;
  channel?: string | null;
  hints: string[];
}): Promise<ShopRow | null> {
  const shops = await listShops(opts.tenantId);
  const hints = opts.hints
    .map(normalizeKey)
    .filter((h) => h.length > 0);
  if (hints.length === 0) return null;

  const channel = opts.channel?.trim() || null;
  const candidates = channel
    ? shops.filter((s) => s.channel === channel)
    : shops;

  for (const shop of candidates) {
    const keys = [
      shop.display_name,
      ...shop.external_keys,
    ].map(normalizeKey);
    if (hints.some((h) => keys.includes(h))) {
      return shop;
    }
  }
  // 包含匹配（氣泡名含店名）；鍵過短易誤命中，至少 2 字且取最長鍵優先
  let best: (typeof candidates)[0] | null = null;
  let bestLen = 0;
  for (const shop of candidates) {
    const keys = [shop.display_name, ...shop.external_keys].map(normalizeKey);
    for (const k of keys) {
      if (k.length < 2) continue;
      if (hints.some((h) => h.includes(k) || (h.length >= 2 && k.includes(h)))) {
        if (k.length > bestLen) {
          best = shop;
          bestLen = k.length;
        }
      }
    }
  }
  return best;
}

export type MergedShopPolicy = {
  logistics: string;
  after_sales: string;
  forbidden: string;
  transfer_rules: string;
  positioning: string;
  display_name: string;
};

/** TenantPolicy 為底，ShopProfile 非空欄位覆寫 */
export async function mergeShopPolicy(
  tenantId: string,
  shop: ShopRow,
): Promise<MergedShopPolicy> {
  const r = await query<{
    logistics: string;
    after_sales: string;
    forbidden: string;
    transfer_rules: string;
  }>(
    `SELECT logistics, after_sales, forbidden, transfer_rules
     FROM tenant_policies WHERE tenant_id = $1`,
    [tenantId],
  );
  const base = r.rows[0] || {
    logistics: '',
    after_sales: '',
    forbidden: '',
    transfer_rules: '',
  };
  const pick = (shopVal: string, baseVal: string) =>
    shopVal.trim() ? shopVal : baseVal;
  return {
    display_name: shop.display_name,
    positioning: shop.positioning || '',
    logistics: pick(shop.logistics, base.logistics),
    after_sales: pick(shop.after_sales, base.after_sales),
    forbidden: pick(shop.forbidden, base.forbidden),
    transfer_rules: pick(shop.transfer_rules, base.transfer_rules),
  };
}

export function formatPolicyBlock(policy: MergedShopPolicy): string {
  const lines = [
    `你正在服務的店鋪：${policy.display_name}`,
    policy.positioning && `店鋪定位：${policy.positioning}`,
    policy.logistics && `物流／發貨：${policy.logistics}`,
    policy.after_sales && `售後政策：${policy.after_sales}`,
    policy.forbidden && `禁答／不可承諾：${policy.forbidden}`,
    policy.transfer_rules &&
      `需同事跟進情形（僅內部，禁止對買家說轉人工／轉接／找客服）：${policy.transfer_rules}`,
  ].filter(Boolean);
  if (lines.length <= 1) return lines[0] || '';
  return ['【本店政策】', ...lines].join('\n');
}

export type GoodsNoteRow = {
  id: string;
  shop_id: string;
  goods_id: string | null;
  title_aliases: string[];
  selling_points: string;
  specs_notes: string;
  objections: string;
};

/** GoodsMatchKey：先 goods_id，再標題別名；未命中回 null */
export async function matchGoodsNote(opts: {
  shopId: string;
  goodsId?: string | null;
  goodsTitle?: string | null;
}): Promise<GoodsNoteRow | null> {
  const r = await query<{
    id: string;
    shop_id: string;
    goods_id: string | null;
    title_aliases: unknown;
    selling_points: string;
    specs_notes: string;
    objections: string;
  }>(
    `SELECT id, shop_id, goods_id, title_aliases, selling_points, specs_notes, objections
     FROM shop_goods_notes WHERE shop_id = $1`,
    [opts.shopId],
  );
  const rows: GoodsNoteRow[] = r.rows.map((row) => ({
    ...row,
    title_aliases: asKeys(row.title_aliases),
  }));

  const gid = opts.goodsId?.trim();
  if (gid) {
    const byId = rows.find((n) => n.goods_id && n.goods_id === gid);
    if (byId) return byId;
  }

  const title = normalizeKey(opts.goodsTitle || '');
  if (!title) return null;
  let best: GoodsNoteRow | null = null;
  let bestLen = 0;
  for (const note of rows) {
    const aliases = note.title_aliases.map(normalizeKey);
    for (const a of aliases) {
      if (a.length < 2) continue;
      if (title.includes(a) || (title.length >= 2 && a.includes(title))) {
        if (a.length > bestLen) {
          best = note;
          bestLen = a.length;
        }
      }
    }
  }
  return best;
}

export function formatGoodsNoteBlock(note: GoodsNoteRow): string {
  const lines = [
    note.selling_points && `賣點：${note.selling_points}`,
    note.specs_notes && `規格說明：${note.specs_notes}`,
    note.objections && `常見異議：${note.objections}`,
  ].filter(Boolean);
  if (lines.length === 0) return '';
  return ['【本商品說明】', ...lines].join('\n');
}

/** 本店商品目錄（名稱／ID），供「有什麼商品」類問題；不含完整賣點以免串款 */
export function formatGoodsCatalogBlock(notes: GoodsNoteRow[]): string {
  if (!notes.length) return '';
  const lines = notes.map((n, i) => {
    const name =
      (n.title_aliases && n.title_aliases[0]) ||
      (n.goods_id ? `商品${n.goods_id}` : `商品${i + 1}`);
    const idPart = n.goods_id ? `（ID:${n.goods_id}）` : '';
    return `- ${name}${idPart}`;
  });
  return [
    '【本店在售商品目錄｜唯一可售清單】',
    '以下為本店目前可介紹的全部商品。目錄外的品牌／型號／規格一律視為沒有，禁止編造或聯想補充。',
    '買家問「還有別的嗎」：若目錄僅有已提及款，就實說目前主要就這些，可追問需求；不要用常見品牌湊數。',
    '詳細賣點僅在命中單一【本商品說明】時使用。',
    ...lines,
  ].join('\n');
}

export async function listGoodsNotes(shopId: string): Promise<GoodsNoteRow[]> {
  const r = await query<{
    id: string;
    shop_id: string;
    goods_id: string | null;
    title_aliases: unknown;
    selling_points: string;
    specs_notes: string;
    objections: string;
  }>(
    `SELECT id, shop_id, goods_id, title_aliases, selling_points, specs_notes, objections
     FROM shop_goods_notes WHERE shop_id = $1 ORDER BY updated_at DESC`,
    [shopId],
  );
  return r.rows.map((row) => ({
    ...row,
    title_aliases: asKeys(row.title_aliases),
  }));
}
