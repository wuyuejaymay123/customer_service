import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TENANT_VOICE_MAX_CHARS,
  validateTenantVoice,
} from '../src/promptLayers.js';

describe('TenantVoice validation', () => {
  it('accepts empty voice', () => {
    const r = validateTenantVoice('');
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.content, '');
  });

  it('accepts normal tone text', () => {
    const r = validateTenantVoice('称呼用亲，回复尽量简短。');
    assert.equal(r.ok, true);
  });

  it('rejects banned transfer wording', () => {
    const r = validateTenantVoice('解决不了就转人工');
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, /转人工/);
  });

  it('rejects overlong content', () => {
    const r = validateTenantVoice('啊'.repeat(TENANT_VOICE_MAX_CHARS + 1));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, /不能超过/);
  });
});
