import { estimateCredits } from './billing.js';

/**
 * 调上游前的预冻结额度：completion 按偏高估算，避免「先打 AI、再发现扣不起」。
 * 冻结失败则根本不会调上游。
 */
export function chatReserveAmount(opts: {
  promptTokensEst: number;
  promptRate: number;
  completionRate: number;
  discount: number;
  /** 预估写出上限（token）；默认偏保守 */
  completionTokensEst?: number;
}) {
  const completionEst = opts.completionTokensEst ?? 4000;
  return estimateCredits(
    opts.promptTokensEst,
    completionEst,
    opts.promptRate,
    opts.completionRate,
    opts.discount,
  );
}
