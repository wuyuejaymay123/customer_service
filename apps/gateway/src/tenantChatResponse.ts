/** Tenant 可见的 chat 成功载荷；不含上游成本、token、模型。 */
export function tenantChatSuccessData(opts: {
  content: string;
  creditCharged: number;
}) {
  return {
    content: opts.content,
    creditCharged: opts.creditCharged,
  };
}
