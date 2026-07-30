export type GatewayAuthRecord = {
  gatewayUrl: string;
  username: string;
  password?: string;
  token?: string;
};

/** 落盘用：永不写入明文密码 */
export function toPersistedGatewayAuth(
  auth: GatewayAuthRecord,
): Omit<GatewayAuthRecord, 'password'> {
  return {
    gatewayUrl: auth.gatewayUrl,
    username: auth.username,
    ...(auth.token ? { token: auth.token } : {}),
  };
}

/** 是否具备可继续调用网关的会话（仅 token，不靠明文密码） */
export function hasUsableGatewaySession(
  auth: GatewayAuthRecord | null | undefined,
): boolean {
  return Boolean(auth?.token && auth.gatewayUrl && auth.username);
}
