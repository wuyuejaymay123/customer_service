import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requestWithAuthRetry } from '../main/backend/services/gatewayAuthRetry';

describe('requestWithAuthRetry', () => {
  it('re-logs in once when assert-active returns 401 and password is available', async () => {
    let calls = 0;
    let reloginCount = 0;
    const { response, auth } = await requestWithAuthRetry({
      auth: {
        gatewayUrl: 'http://127.0.0.1:8787',
        username: 'shop_admin',
        password: 'temp-pass',
        token: 'expired',
      },
      relogin: async (a) => {
        reloginCount += 1;
        return { ...a, token: 'fresh-token' };
      },
      request: async (token) => {
        calls += 1;
        if (token === 'expired') {
          return new Response(JSON.stringify({ message: '登录已失效' }), {
            status: 401,
          });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      },
    });
    assert.equal(response.status, 200);
    assert.equal(auth.token, 'fresh-token');
    assert.equal(reloginCount, 1);
    assert.equal(calls, 2);
  });

  it('does not silent-relogin with empty password when token is 401', async () => {
    let reloginCount = 0;
    const { response } = await requestWithAuthRetry({
      auth: {
        gatewayUrl: 'http://127.0.0.1:8787',
        username: 'shop_admin',
        token: 'expired',
      },
      relogin: async (a) => {
        reloginCount += 1;
        return { ...a, token: 'should-not-happen' };
      },
      request: async () =>
        new Response(JSON.stringify({ message: '登录已失效' }), {
          status: 401,
        }),
    });
    assert.equal(response.status, 401);
    assert.equal(reloginCount, 0);
  });
});
