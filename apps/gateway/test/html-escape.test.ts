import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeHtml } from '../src/htmlEscape.js';

describe('escapeHtml', () => {
  it('escapes script tags so admin list cannot inject HTML', () => {
    const evil = `<img src=x onerror="alert(1)">店铺"A"`;
    const out = escapeHtml(evil);
    assert.equal(out.includes('<img'), false);
    assert.equal(out.includes('onerror'), true); // 文本仍在，但标签已失效
    assert.equal(out.includes('<'), false);
    assert.equal(out.includes('"'), false);
    assert.equal(
      out,
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;店铺&quot;A&quot;',
    );
  });
});
