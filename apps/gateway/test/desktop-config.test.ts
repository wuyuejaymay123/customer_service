import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDesktopConfig,
  parseDesktopConfigPayload,
  putDesktopConfig,
} from '../src/desktopConfig.js';
import { createTestTenant, deleteTestTenant } from './helpers.js';

describe('desktopConfig payload parse', () => {
  it('accepts keyword bundle items', () => {
    const r = parseDesktopConfigPayload('keywords', {
      schemaVersion: 1,
      items: [
        {
          id: 'a1',
          keyword: '包邮',
          reply: '默认包邮',
          mode: 'keyword',
          shopId: null,
        },
      ],
    });
    assert.equal(r.ok, true);
  });

  it('rejects shop roster cookies via strict schema', () => {
    const r = parseDesktopConfigPayload('shopRoster', {
      items: [
        {
          id: 's1',
          displayName: '店A',
          channel: 'pinduoduo',
          cookies: 'secret',
        },
      ],
    });
    assert.equal(r.ok, false);
  });
});

describe('desktopConfig optimistic lock', () => {
  it('creates at version 1, bumps version, and rejects stale baseVersion', async () => {
    let tenantId: string;
    try {
      ({ tenantId } = await createTestTenant('deskcfg'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/ECONNREFUSED|connect/i.test(msg)) {
        console.log('skip: Postgres not available');
        return;
      }
      throw e;
    }
    try {
      const empty = await getDesktopConfig(tenantId, 'keywords');
      assert.equal(empty.configVersion, 0);
      assert.deepEqual((empty.payload as { items: unknown[] }).items, []);

      const first = await putDesktopConfig(tenantId, 'keywords', 0, {
        schemaVersion: 1,
        items: [
          {
            id: 'k1',
            keyword: '运费',
            reply: '包邮',
            mode: 'keyword',
          },
        ],
      });
      assert.equal(first.ok, true);
      if (!first.ok) return;
      assert.equal(first.data.configVersion, 1);

      const stale = await putDesktopConfig(tenantId, 'keywords', 0, {
        schemaVersion: 1,
        items: [],
      });
      assert.equal(stale.ok, false);
      if (stale.ok) return;
      assert.equal(stale.conflict, true);
      assert.equal(stale.data.configVersion, 1);

      const second = await putDesktopConfig(tenantId, 'keywords', 1, {
        schemaVersion: 1,
        items: [
          {
            id: 'k1',
            keyword: '运费',
            reply: '偏远除外',
            mode: 'keyword',
          },
        ],
      });
      assert.equal(second.ok, true);
      if (!second.ok) return;
      assert.equal(second.data.configVersion, 2);
      const items = (second.data.payload as { items: { reply: string }[] })
        .items;
      assert.equal(items[0].reply, '偏远除外');
    } finally {
      await deleteTestTenant(tenantId);
    }
  });
});
