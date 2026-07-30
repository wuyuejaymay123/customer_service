import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasUsableGatewaySession,
  toPersistedGatewayAuth,
} from '../main/backend/services/gatewayAuthPersist';

describe('toPersistedGatewayAuth', () => {
  it('persisted gateway auth must not include password', () => {
    const persisted = toPersistedGatewayAuth({
      gatewayUrl: 'http://127.0.0.1:8787',
      username: 'shop_admin',
      password: 'super-secret',
      token: 'jwt-token-abc',
    });
    assert.equal(persisted.gatewayUrl, 'http://127.0.0.1:8787');
    assert.equal(persisted.username, 'shop_admin');
    assert.equal(persisted.token, 'jwt-token-abc');
    assert.equal('password' in persisted, false);
    assert.equal(
      JSON.stringify(persisted).includes('super-secret'),
      false,
    );
  });
});

describe('hasUsableGatewaySession', () => {
  it('requires token plus gateway url and username', () => {
    assert.equal(hasUsableGatewaySession(null), false);
    assert.equal(
      hasUsableGatewaySession({
        gatewayUrl: 'http://127.0.0.1:8787',
        username: 'a',
        password: 'x',
      }),
      false,
    );
    assert.equal(
      hasUsableGatewaySession({
        gatewayUrl: 'http://127.0.0.1:8787',
        username: 'a',
        token: 'tok',
      }),
      true,
    );
  });
});
