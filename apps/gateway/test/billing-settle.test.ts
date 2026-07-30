import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  releaseExpiredReserves,
  reserveCredits,
  settleReserve,
} from '../src/billing.js';
import { query } from '../src/db.js';
import {
  createTestTenant,
  deleteTestTenant,
  walletSnapshot,
} from './helpers.js';

describe('Wallet settle / reserve', () => {
  it('settles full actual Credit when usage exceeds the Reserve hold', async () => {
    const { tenantId, operatorId } = await createTestTenant('settle');
    try {
      const reserveId = await reserveCredits({
        tenantId,
        operatorId,
        amount: 1,
      });
      const charged = await settleReserve({
        reserveId,
        tenantId,
        operatorId,
        actualCredit: 5,
        usage: {
          model: 'test',
          promptTokens: 1000,
          completionTokens: 2000,
          success: true,
        },
      });
      assert.equal(charged, 5);
      const w = await walletSnapshot(tenantId);
      assert.equal(w.balance, 995);
      assert.equal(w.reserved, 0);
    } finally {
      await deleteTestTenant(tenantId);
    }
  });

  it('charges all remaining available Credit when actual exceeds wallet (no free upstream)', async () => {
    const { tenantId, operatorId } = await createTestTenant('shortfall');
    try {
      await query(
        `UPDATE wallets SET balance = 10, reserved = 0 WHERE tenant_id = $1`,
        [tenantId],
      );
      const reserveId = await reserveCredits({
        tenantId,
        operatorId,
        amount: 8,
      });
      const charged = await settleReserve({
        reserveId,
        tenantId,
        operatorId,
        actualCredit: 20,
        usage: {
          model: 'test',
          promptTokens: 10000,
          completionTokens: 5000,
          success: true,
        },
      });
      assert.equal(charged, 10);
      const w = await walletSnapshot(tenantId);
      assert.equal(w.balance, 0);
      assert.equal(w.reserved, 0);
    } finally {
      await deleteTestTenant(tenantId);
    }
  });

  it('releases expired held Reserves so available Credit returns', async () => {
    const { tenantId, operatorId } = await createTestTenant('expire');
    try {
      const reserveId = await reserveCredits({
        tenantId,
        operatorId,
        amount: 40,
      });
      await query(
        `UPDATE reserves SET created_at = now() - interval '20 minutes' WHERE id = $1`,
        [reserveId],
      );
      const before = await walletSnapshot(tenantId);
      assert.equal(before.available, 960);
      const n = await releaseExpiredReserves(15 * 60 * 1000);
      assert.ok(n >= 1);
      const after = await walletSnapshot(tenantId);
      assert.equal(after.reserved, 0);
      assert.equal(after.available, 1000);
    } finally {
      await deleteTestTenant(tenantId);
    }
  });
});
