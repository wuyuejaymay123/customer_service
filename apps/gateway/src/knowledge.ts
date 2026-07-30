import { query } from './db.js';

export type KnowledgeDoc = {
  id: string;
  title: string;
  content: string;
};

/** 簡易關鍵詞重疊檢索；知識少時可整包注入（有上限） */
export async function selectKnowledgeForPrompt(
  tenantId: string,
  userText: string,
  goodsContext: string,
  opts?: { maxChars?: number; maxDocs?: number },
): Promise<string> {
  const maxChars = opts?.maxChars ?? 6000;
  const maxDocs = opts?.maxDocs ?? 8;
  const r = await query<{ id: string; title: string; content: string }>(
    `SELECT id, title, content FROM tenant_knowledge
     WHERE tenant_id = $1 ORDER BY updated_at DESC`,
    [tenantId],
  );
  if (r.rows.length === 0) return '';

  const hay = `${userText}\n${goodsContext}`.toLowerCase();
  const tokens = hay
    .split(/[\s,，。！？、；：:\-/\\|_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  const scored = r.rows.map((doc) => {
    const blob = `${doc.title}\n${doc.content}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (blob.includes(t)) score += 1;
    }
    // 無匹配時給極低分，仍可能被選入（知識很少時）
    return { doc, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const picked: KnowledgeDoc[] = [];
  let used = 0;
  const hasAnyHit = scored.some((s) => s.score > 0);
  for (const item of scored) {
    if (picked.length >= maxDocs) break;
    if (hasAnyHit && item.score === 0 && picked.length > 0) break;
    const block = `【${item.doc.title || '未命名'}】\n${item.doc.content}`;
    if (used + block.length > maxChars && picked.length > 0) break;
    picked.push(item.doc);
    used += block.length;
  }

  if (picked.length === 0) return '';

  return [
    '以下是本店知识库内容。请优先依此回答；若知识库未涵盖，请明确说明暂无法确认，不要编造价格、库存、活动或售后政策，也不要对买家说转人工／机器人／AI。',
    ...picked.map((d) => `【${d.title || '未命名'}】\n${d.content}`),
  ].join('\n\n');
}
