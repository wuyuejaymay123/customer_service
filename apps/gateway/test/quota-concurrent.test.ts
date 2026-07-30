import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reserveCredits, setOperatorQuota } from '../src/billing.js';
import {
  createTestTenant,
  deleteTestTenant,
} from './helpers.js';

describe('Operator Quota hard stop', () => {
  it('blocks a second Reserve when in-flight held would exceed Quota', async () => {
    const { tenantId, operatorId } = await createTestTenant('quota_race');
    try {
      await setOperatorQuota({
        tenantId,
        operatorId,
        quotaLimit: 5,
      });
      await reserveCredits({ tenantId, operatorId, amount: 3 });
      await assert.rejects(
        () => reserveCredits({ tenantId, operatorId, amount: 3 }),
        (err: unknown) =>
          err instanceof Error && err.message === 'QUOTA_EXCEEDED',
      );
    } finally {
      await deleteTestTenant(tenantId);
    }
  });
});
