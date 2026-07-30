import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tenantChatSuccessData } from '../src/tenantChatResponse.js';

describe('tenant chat success payload', () => {
  it('exposes only content and creditCharged to the tenant', () => {
    const data = tenantChatSuccessData({
      content: '您好，已为您查询',
      creditCharged: 1.25,
    });
    assert.equal(data.content, '您好，已为您查询');
    assert.equal(data.creditCharged, 1.25);
    assert.deepEqual(Object.keys(data).sort(), [
      'content',
      'creditCharged',
    ]);
  });
});
