export type AuthLike = {
  gatewayUrl: string;
  username: string;
  password?: string;
  token?: string;
};

function canRelogin(auth: AuthLike): boolean {
  return Boolean(auth.password && auth.username && auth.gatewayUrl);
}

/** 公开行为：带 Bearer 打网关；401 且本地仍有密码时才重登再试一次 */
export async function requestWithAuthRetry(opts: {
  auth: AuthLike;
  request: (token: string) => Promise<Response>;
  relogin: (auth: AuthLike) => Promise<AuthLike>;
  signal?: AbortSignal;
}): Promise<{ auth: AuthLike; response: Response }> {
  if (opts.signal?.aborted) {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    throw err;
  }
  let auth = opts.auth;
  if (!auth.token) {
    if (!canRelogin(auth)) {
      return {
        auth,
        response: new Response(
          JSON.stringify({ message: '请重新登录网关' }),
          { status: 401 },
        ),
      };
    }
    auth = await opts.relogin(auth);
  }
  let response = await opts.request(auth.token!);
  if (response.status === 401) {
    if (opts.signal?.aborted) {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      throw err;
    }
    if (!canRelogin(auth)) {
      return { auth, response };
    }
    auth = await opts.relogin(auth);
    response = await opts.request(auth.token!);
  }
  return { auth, response };
}
