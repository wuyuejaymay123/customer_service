import { query } from './db.js';

export const TENANT_VOICE_MAX_CHARS = 2000;

/** 買家側／人設露餡詞；TenantVoice 保存時拒絕 */
const BANNED_VOICE_PATTERNS: RegExp[] = [
  /转人工/,
  /轉人工/,
  /转接/,
  /轉接/,
  /人工客服/,
  /找客服/,
  /机器人/,
  /機器人/,
  /\bAI\b/i,
  /AI客服/,
  /智能客服/,
  /系统繁忙/,
  /系統繁忙/,
  /消息有点多/,
  /消息有點多/,
  /稍后再回/,
  /稍後再回/,
];

export const DEFAULT_PLATFORM_HARD_RULES = `你是中国电商平台（拼多多/淘宝等）的店铺客服，用真人客服日常说话的方式回复买家。

## 说话风格
- 口语、自然、好懂；多用：亲、不好意思、抱歉、给您添麻烦了、这边帮您看看、麻烦您、稍等。
- 一般两三句话，复杂问题再分点；不要输出 Markdown 加粗符号（不要用 **）。

## 商品与库存（最重要）
- 只能介绍【本店在售商品目录】和【本商品说明】里出现的商品；目录没有的品牌、型号、规格一律当没有。
- 严禁编造或联想本店没有的商品。
- 买家问「还有别的吗」：若目录只有已提到的款，就如实说目前主要就这些，可问需求帮选；不要用常见品牌凑数。
- 店铺定位只是经营方向，不是可售清单，不能据此列举具体商品。

## 办事原则
- 优先按本店政策与商品说明回答；不要编造价格、库存、活动或售后政策。
- 信息不够时礼貌追问；拿不准就说「稍等，我这边帮您确认一下」。

## 绝对禁止（买家侧）
- 禁止说：转人工、转接、人工客服、找客服、系统、机器人、AI、智能客服。
- 不要问「要不要转人工／帮您转接」。`;

export const HARD_RULES_TAIL_REMINDER =
  '【硬性提醒】仅可依据本店商品目录与已提供政策回答；禁止编造商品；禁止对买家提及转人工／转接／机器人／AI。';

export function findBannedVoiceTerm(text: string): string | null {
  for (const re of BANNED_VOICE_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

export function validateTenantVoice(raw: string): {
  ok: true;
  content: string;
} | {
  ok: false;
  message: string;
} {
  const content = raw ?? '';
  if (content.length > TENANT_VOICE_MAX_CHARS) {
    return {
      ok: false,
      message: `商户补充规则不能超过 ${TENANT_VOICE_MAX_CHARS} 字`,
    };
  }
  const banned = findBannedVoiceTerm(content);
  if (banned) {
    return {
      ok: false,
      message: `内容包含不允许的词「${banned}」，请删除后保存`,
    };
  }
  return { ok: true, content };
}

export async function getPlatformHardRules(): Promise<string> {
  const r = await query<{ content: string }>(
    `SELECT content FROM platform_hard_rules WHERE id = 1`,
  );
  const c = (r.rows[0]?.content || '').trim();
  return c || DEFAULT_PLATFORM_HARD_RULES;
}

export async function setPlatformHardRules(content: string): Promise<string> {
  const text = (content || '').trim() || DEFAULT_PLATFORM_HARD_RULES;
  await query(
    `INSERT INTO platform_hard_rules (id, content, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
    [text],
  );
  return text;
}

export async function getTenantVoice(tenantId: string): Promise<string> {
  const r = await query<{ tenant_voice: string }>(
    `SELECT tenant_voice FROM tenants WHERE id = $1`,
    [tenantId],
  );
  return (r.rows[0]?.tenant_voice || '').trim();
}

export async function setTenantVoice(
  tenantId: string,
  raw: string,
): Promise<{ ok: true; content: string } | { ok: false; message: string }> {
  const v = validateTenantVoice(raw);
  if (!v.ok) return v;
  await query(`UPDATE tenants SET tenant_voice = $2 WHERE id = $1`, [
    tenantId,
    v.content,
  ]);
  return { ok: true, content: v.content };
}

/** 若 HardRules 仍空，從啟用中的 ModelSKU.platform_prompt 遷移一次 */
export async function ensureHardRulesSeeded(): Promise<void> {
  const cur = await query<{ content: string }>(
    `SELECT content FROM platform_hard_rules WHERE id = 1`,
  );
  if ((cur.rows[0]?.content || '').trim()) return;

  const sku = await query<{ platform_prompt: string }>(
    `SELECT platform_prompt FROM model_skus WHERE active = true
     ORDER BY created_at DESC LIMIT 1`,
  );
  const fromSku = (sku.rows[0]?.platform_prompt || '').trim();
  await setPlatformHardRules(fromSku || DEFAULT_PLATFORM_HARD_RULES);
}
