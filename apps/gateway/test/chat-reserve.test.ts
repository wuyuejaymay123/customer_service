import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chatReserveAmount } from '../src/chatReserve.js';

describe('chatReserveAmount', () => {
  it('reserves enough for a high completion ceiling so short wallets fail before AI', () => {
    // 与现价目一致：1 / 2 Credit per 1K；无折扣
    const amount = chatReserveAmount({
      promptTokensEst: 1000,
      promptRate: 1,
      completionRate: 2,
      discount: 1,
    });
    // 1K prompt → 1；默认 4K completion → 8；合计 9
    assert.equal(amount, 9);
  });
});
