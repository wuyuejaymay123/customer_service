/** DeepSeek 官方人民幣價目（元／百万 tokens）；可被 PriceBook 覆寫。 */

export type UpstreamUsageTokens = {
  promptTokens: number;
  completionTokens: number;
  promptCacheHitTokens?: number | null;
  promptCacheMissTokens?: number | null;
};

export type UpstreamRatesCnyPerMillion = {
  inputHit: number;
  inputMiss: number;
  output: number;
};

export const DEEPSEEK_DEFAULT_RATES: Record<
  'flash' | 'pro',
  UpstreamRatesCnyPerMillion
> = {
  flash: { inputHit: 0.02, inputMiss: 1, output: 2 },
  pro: { inputHit: 0.025, inputMiss: 3, output: 6 },
};

export function resolveUpstreamTier(model: string): 'flash' | 'pro' {
  const m = (model || '').toLowerCase();
  if (m.includes('pro')) return 'pro';
  return 'flash';
}

/**
 * 上游真實成本（人民幣）。
 * 缺 cache 分項時，整段 prompt 按未命中計（偏保守）。
 */
export function computeUpstreamCostCny(
  usage: UpstreamUsageTokens,
  rates: UpstreamRatesCnyPerMillion,
): number {
  const prompt = Math.max(0, Number(usage.promptTokens) || 0);
  const completion = Math.max(0, Number(usage.completionTokens) || 0);
  let hit = usage.promptCacheHitTokens;
  let miss = usage.promptCacheMissTokens;
  if (hit == null || miss == null || Number.isNaN(Number(hit)) || Number.isNaN(Number(miss))) {
    hit = 0;
    miss = prompt;
  } else {
    hit = Math.max(0, Number(hit));
    miss = Math.max(0, Number(miss));
  }
  const cost =
    (hit / 1_000_000) * rates.inputHit +
    (miss / 1_000_000) * rates.inputMiss +
    (completion / 1_000_000) * rates.output;
  return Number(cost.toFixed(6));
}

/** Credit → 人民幣營收（按 PriceBook cny_to_credit） */
export function creditToCny(credit: number, cnyToCredit: number): number {
  if (!cnyToCredit) return 0;
  return Number((credit / cnyToCredit).toFixed(6));
}

export function marginCny(revenueCny: number, costUpstreamCny: number): number {
  return Number((revenueCny - costUpstreamCny).toFixed(6));
}
