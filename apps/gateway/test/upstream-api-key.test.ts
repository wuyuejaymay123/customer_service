import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import {
  getUpstreamApiKey,
  hasUpstreamApiKey,
  maskUpstreamApiKey,
  requireUpstreamApiKey,
} from '../src/upstreamApiKey.js';

describe('upstreamApiKey env credential', () => {
  const prev = process.env.DEEPSEEK_API_KEY;

  after(() => {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  });

  it('reads trimmed env key', () => {
    process.env.DEEPSEEK_API_KEY = '  sk-test-abcdef  ';
    assert.equal(getUpstreamApiKey(), 'sk-test-abcdef');
    assert.equal(hasUpstreamApiKey(), true);
    assert.equal(requireUpstreamApiKey(), 'sk-test-abcdef');
  });

  it('hard-fails when missing', () => {
    delete process.env.DEEPSEEK_API_KEY;
    assert.equal(getUpstreamApiKey(), null);
    assert.equal(hasUpstreamApiKey(), false);
    assert.throws(() => requireUpstreamApiKey(), /UPSTREAM_API_KEY_MISSING/);
  });

  it('masks for admin display', () => {
    assert.equal(maskUpstreamApiKey('sk-secret-key-123456'), 'sk-****3456');
    assert.equal(maskUpstreamApiKey(''), '');
  });
});
