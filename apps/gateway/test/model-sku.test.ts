import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { query } from '../src/db.js';

const BASE = process.env.GATEWAY_URL || 'http://127.0.0.1:8787';

async function adminToken() {
  const resp = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const json = (await resp.json()) as {
    success: boolean;
    data?: { token: string };
  };
  assert.equal(resp.ok, true);
  assert.ok(json.data?.token);
  return json.data!.token;
}

describe('ModelSKU admin API', () => {
  it('lists configured ModelSKU with masked apiKey after save', async () => {
    const token = await adminToken();
    const name = `sku_${Date.now()}`;
    const save = await fetch(`${BASE}/admin/model-skus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-secret-key-123456',
        model: 'deepseek-chat',
        platformPrompt: 'test prompt',
      }),
    });
    assert.equal(save.status, 200);

    const list = await fetch(`${BASE}/admin/model-skus`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(list.status, 200);
    const json = (await list.json()) as {
      success: boolean;
      data: Array<{
        name: string;
        apiKeyMasked: string;
        apiKey?: string;
        model: string;
      }>;
    };
    const row = json.data.find((s) => s.name === name);
    assert.ok(row);
    assert.equal(row!.model, 'deepseek-chat');
    assert.ok(row!.apiKeyMasked.includes('3456') || row!.apiKeyMasked.includes('****'));
    assert.equal(row!.apiKey, undefined);
  });

  it('keeps existing apiKey when PlatformAdmin saves with empty key', async () => {
    const token = await adminToken();
    const name = `sku_keep_${Date.now()}`;
    await fetch(`${BASE}/admin/model-skus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-keep-me-abcdef',
        model: 'deepseek-chat',
      }),
    });

    const empty = await fetch(`${BASE}/admin/model-skus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
        model: 'deepseek-chat',
      }),
    });
    assert.equal(empty.status, 200);

    const db = await query<{ api_key: string }>(
      `SELECT api_key FROM model_skus WHERE name = $1`,
      [name],
    );
    assert.equal(db.rows[0].api_key, 'sk-keep-me-abcdef');
  });
});
