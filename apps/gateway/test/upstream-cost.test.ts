import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEEPSEEK_DEFAULT_RATES,
  computeUpstreamCostCny,
  creditToCny,
  marginCny,
  resolveUpstreamTier,
} from '../src/upstreamCost.js';

describe('upstreamCost', () => {
  it('resolves flash vs pro from model id', () => {
    assert.equal(resolveUpstreamTier('deepseek-v4-flash'), 'flash');
    assert.equal(resolveUpstreamTier('deepseek-v4-pro'), 'pro');
    assert.equal(resolveUpstreamTier('deepseek-chat'), 'flash');
  });

  it('computes Flash cost with cache hit/miss split', () => {
    // 9000 hit + 1000 miss + 500 out @ flash
    const cost = computeUpstreamCostCny(
      {
        promptTokens: 10000,
        completionTokens: 500,
        promptCacheHitTokens: 9000,
        promptCacheMissTokens: 1000,
      },
      DEEPSEEK_DEFAULT_RATES.flash,
    );
    // 9000/1e6*0.02 + 1000/1e6*1 + 500/1e6*2 = 0.00018 + 0.001 + 0.001 = 0.00218
    assert.equal(cost, 0.00218);
  });

  it('treats missing cache fields as full miss', () => {
    const cost = computeUpstreamCostCny(
      { promptTokens: 2000, completionTokens: 500 },
      DEEPSEEK_DEFAULT_RATES.flash,
    );
    // 2000/1e6*1 + 500/1e6*2 = 0.002 + 0.001 = 0.003
    assert.equal(cost, 0.003);
  });

  it('maps credit revenue and margin at 100 credit per CNY', () => {
    const revenue = creditToCny(3, 100);
    assert.equal(revenue, 0.03);
    assert.equal(marginCny(0.03, 0.003), 0.027);
  });
});
