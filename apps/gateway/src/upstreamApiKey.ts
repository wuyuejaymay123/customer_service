/**
 * 上游 API Key 僅來自環境變數（ADR-0014）。
 */

export function getUpstreamApiKey(): string | null {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  return key || null;
}

export function hasUpstreamApiKey(): boolean {
  return Boolean(getUpstreamApiKey());
}

/** 缺 key → 拋錯，呼叫方應在預扣前攔截 */
export function requireUpstreamApiKey(): string {
  const key = getUpstreamApiKey();
  if (!key) {
    throw new Error('UPSTREAM_API_KEY_MISSING');
  }
  return key;
}

export function maskUpstreamApiKey(key: string | null | undefined): string {
  const k = (key || '').trim();
  if (!k) return '';
  if (k.length <= 8) return '****';
  return `${k.slice(0, 3)}****${k.slice(-4)}`;
}
