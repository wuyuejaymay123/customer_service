/**
 * 拼多多客服页店名甄别：页面上常出现「主账号」／「客服平台」等，不能当店名。
 */

const ROLE_OR_NOISE = new Set([
  '主账号',
  '子账号',
  '主帳號',
  '子帳號',
  '主帐号',
  '子帐号',
  '管理员',
  '管理員',
  '超级管理员',
  '超級管理員',
  '客服',
  '店长',
  '店長',
  '店主',
  '拼多多',
  '拼多多商家',
  '拼多多商家后台',
  '拼多多客服',
  '拼多多客服平台',
  '客服平台',
  '商家后台',
  '商家中心',
  '客服工作台',
  '未命名店铺',
]);

const MALL_NAME_KEYS =
  /^(mallName|mall_name|shopName|shop_name|storeName|store_name|mallname)$/i;

/** 我们自己写的标签前缀，绝不能再当店名叠上去 */
const OUR_TAB_PREFIX = /^拼多多\s*·\s*/;

/** 剥掉「拼多多 ·」重复前缀，以及占位符 */
export function unwrapBrowserTabTitle(text: string): string {
  let t = (text || '').trim();
  while (OUR_TAB_PREFIX.test(t)) {
    t = t.replace(OUR_TAB_PREFIX, '').trim();
  }
  if (/^待扫码\s*#?\d*$/i.test(t) || /^#\d+$/.test(t)) {
    return '';
  }
  return t;
}

/** 规范化候选：去标签前缀、去「店主」等后缀 */
export function normalizePddShopNameCandidate(
  text: string | null | undefined,
): string {
  let t = unwrapBrowserTabTitle(text || '');
  t = t.replace(/(店主|主账号|子账号|主帳號|子帳號|管理员|管理員)$/u, '').trim();
  return t;
}

/** 明显不是店铺名的文案（角色／平台标题／过短／过长） */
export function isPddShopNameNoise(text: string | null | undefined): boolean {
  const t = normalizePddShopNameCandidate(text);
  if (!t) return true;
  if (t.length < 2 || t.length >= 40) return true;
  if (ROLE_OR_NOISE.has(t)) return true;
  if (/^(主|子)[帐帳][号號]$/.test(t)) return true;
  if (/^(超级)?管理[员員]$/.test(t)) return true;
  if (/^#\d+$/.test(t)) return true;
  // 页面默认标题／平台名，不是店名
  if (/客服平台|商家后台|商家中心|工作台|客服系统/.test(t)) return true;
  if (/^拼多多/.test(t)) return true;
  return false;
}

/** 从 document.title 拆出可能的店名（忽略我们自己写的标签与平台默认标题） */
export function candidatesFromDocumentTitle(title: string): string[] {
  const raw = (title || '').trim();
  if (!raw) return [];
  if (OUR_TAB_PREFIX.test(raw)) {
    const inner = normalizePddShopNameCandidate(raw);
    return inner && !isPddShopNameNoise(inner) ? [inner] : [];
  }
  const out: string[] = [];
  const m = raw.match(
    /^(.+?)\s*[-—_|｜·]\s*(拼多多|商家后台|商家中心|商家|客服|客服平台).*$/,
  );
  if (m?.[1]) {
    const left = normalizePddShopNameCandidate(m[1]);
    if (left && !isPddShopNameNoise(left)) out.push(left);
  }
  const whole = normalizePddShopNameCandidate(raw);
  if (whole && !isPddShopNameNoise(whole)) out.push(whole);
  return out;
}

/** 从任意 JSON 结构里挖 mallName / shopName 一类字段 */
export function extractMallNamesFromUnknown(
  value: unknown,
  depth = 0,
  acc: string[] = [],
): string[] {
  if (depth > 6 || value == null) return acc;
  if (typeof value === 'string') {
    if (
      (value.startsWith('{') || value.startsWith('[')) &&
      value.length < 20000
    ) {
      try {
        return extractMallNamesFromUnknown(JSON.parse(value), depth + 1, acc);
      } catch {
        return acc;
      }
    }
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      extractMallNamesFromUnknown(item, depth + 1, acc);
    }
    return acc;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (MALL_NAME_KEYS.test(k) && typeof v === 'string') {
        acc.push(v);
      } else {
        extractMallNamesFromUnknown(v, depth + 1, acc);
      }
    }
  }
  return acc;
}

/**
 * 按候选顺序取第一个可用店名（调用方应把商城名选择器排在前面）。
 */
export function pickPinduoduoShopName(
  candidates: Array<string | null | undefined>,
): string | null {
  for (const raw of candidates) {
    const t = normalizePddShopNameCandidate(raw);
    if (!isPddShopNameNoise(t)) return t;
  }
  return null;
}

/** Chrome 标签栏文案：优先店名，否则实例号（绝不叠前缀） */
export function browserTabTitleForShop(opts: {
  shopName?: string | null;
  instanceId: number | string;
  pending?: boolean;
}): string {
  const name = normalizePddShopNameCandidate(opts.shopName);
  if (name && !isPddShopNameNoise(name)) {
    return `拼多多 · ${name}`;
  }
  if (opts.pending) {
    return `拼多多 · 待扫码 #${opts.instanceId}`;
  }
  return `拼多多 · #${opts.instanceId}`;
}
