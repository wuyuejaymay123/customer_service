/**
 * 閘道→上游 chat/completions 請求體（ADR-0012／ADR-0013）。
 * 默認強制非流式；若開啟流式必須帶 include_usage。
 * 客服路徑關閉 thinking、硬頂 max_tokens、帶租戶級 user。
 */

/** 客服回覆輸出硬頂（ADR-0013） */
export const UPSTREAM_MAX_TOKENS = 1024;

export function buildUpstreamChatBody(opts: {
  model: string;
  messages: unknown[];
  /** 租戶 ID；寫入上游 `user` 欄位供風控對帳 */
  tenantId: string;
  /** 僅測試／顯式開啟時為 true；生產路徑應保持 false */
  stream?: boolean;
}): Record<string, unknown> {
  const stream = Boolean(opts.stream);
  const common = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: UPSTREAM_MAX_TOKENS,
    thinking: { type: 'disabled' as const },
    user: `tenant:${opts.tenantId}`,
  };
  if (stream) {
    return {
      ...common,
      stream: true,
      stream_options: { include_usage: true },
    };
  }
  return {
    ...common,
    stream: false,
  };
}

/** 流式卻未要求 usage → 配置錯誤，不得當成功結算 */
export function assertUpstreamUsagePolicy(body: {
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
}) {
  if (body.stream && !body.stream_options?.include_usage) {
    throw new Error('UPSTREAM_STREAM_USAGE_REQUIRED');
  }
}
