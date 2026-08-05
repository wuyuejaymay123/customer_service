import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertUpstreamUsagePolicy,
  buildUpstreamChatBody,
  UPSTREAM_MAX_TOKENS,
} from '../src/upstreamChatBody.js';

describe('upstreamChatBody billing safety', () => {
  it('defaults to non-stream with ADR-0013 hardening fields', () => {
    const body = buildUpstreamChatBody({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
      tenantId: 't-1',
    });
    assert.equal(body.stream, false);
    assert.equal(body.stream_options, undefined);
    assert.equal(body.max_tokens, UPSTREAM_MAX_TOKENS);
    assert.equal(UPSTREAM_MAX_TOKENS, 1024);
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal(body.user, 'tenant:t-1');
    assertUpstreamUsagePolicy(body);
  });

  it('stream requires include_usage and keeps hardening fields', () => {
    const body = buildUpstreamChatBody({
      model: 'deepseek-chat',
      messages: [],
      tenantId: 't-2',
      stream: true,
    });
    assert.equal(body.stream, true);
    assert.deepEqual(body.stream_options, { include_usage: true });
    assert.equal(body.max_tokens, 1024);
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal(body.user, 'tenant:t-2');
    assertUpstreamUsagePolicy(body);
  });

  it('rejects stream without include_usage', () => {
    assert.throws(
      () => assertUpstreamUsagePolicy({ stream: true }),
      /UPSTREAM_STREAM_USAGE_REQUIRED/,
    );
  });
});
