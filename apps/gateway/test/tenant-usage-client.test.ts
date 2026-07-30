import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { releaseReserve, reserveCredits, settleReserve } from '../src/billing.js';
import { listTenantUsageForClient } from '../src/tenantUsageClient.js';
import { createTestTenant, deleteTestTenant } from './helpers.js';

describe('Tenant client usage list', () => {
  it('lists only successful UsageRecords with Credit charged', async () => {
    const { tenantId, operatorId } = await createTestTenant('usage_ok');
    try {
      const okReserve = await reserveCredits({
        tenantId,
        operatorId,
        amount: 2,
      });
      await settleReserve({
        reserveId: okReserve,
        tenantId,
        operatorId,
        actualCredit: 3,
        usage: {
          model: 'secret-model-name',
          promptTokens: 100,
          completionTokens: 50,
          success: true,
        },
      });

      const failReserve = await reserveCredits({
        tenantId,
        operatorId,
        amount: 1,
      });
      await releaseReserve({
        reserveId: failReserve,
        tenantId,
        operatorId,
        errorMessage: 'upstream failed',
      });

      const zeroReserve = await reserveCredits({
        tenantId,
        operatorId,
        amount: 1,
      });
      await settleReserve({
        reserveId: zeroReserve,
        tenantId,
        operatorId,
        actualCredit: 0,
        usage: {
          model: 'secret-model-name',
          promptTokens: 10,
          completionTokens: 0,
          success: true,
        },
      });

      const rows = await listTenantUsageForClient(tenantId);
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].credit_charged), 3);
    } finally {
      await deleteTestTenant(tenantId);
    }
  });

  it('omits model and token fields from client rows', async () => {
    const { tenantId, operatorId } = await createTestTenant('usage_hide');
    try {
      const reserveId = await reserveCredits({
        tenantId,
        operatorId,
        amount: 1,
      });
      await settleReserve({
        reserveId,
        tenantId,
        operatorId,
        actualCredit: 2,
        usage: {
          model: 'deepseek-secret',
          promptTokens: 999,
          completionTokens: 888,
          success: true,
        },
      });

      const rows = await listTenantUsageForClient(tenantId);
      assert.equal(rows.length, 1);
      assert.deepEqual(Object.keys(rows[0]).sort(), [
        'created_at',
        'credit_charged',
        'id',
      ]);
      assert.equal(Number(rows[0].credit_charged), 2);
    } finally {
      await deleteTestTenant(tenantId);
    }
  });
});
