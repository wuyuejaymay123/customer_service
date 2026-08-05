import { z } from 'zod';
import { pool, query } from './db.js';

export type DesktopConfigKind = 'settings' | 'keywords' | 'shopRoster';

export type DesktopConfigBundle = {
  configVersion: number;
  updatedAt: string | null;
  payload: unknown;
};

type KindMeta = {
  table: string;
  defaultPayload: Record<string, unknown>;
};

const KIND_META: Record<DesktopConfigKind, KindMeta> = {
  settings: {
    table: 'tenant_desktop_settings',
    defaultPayload: {
      schemaVersion: 1,
      general: {},
      voice: '',
    },
  },
  keywords: {
    table: 'tenant_keywords_bundle',
    defaultPayload: {
      schemaVersion: 1,
      items: [],
    },
  },
  shopRoster: {
    table: 'tenant_shop_roster',
    defaultPayload: {
      schemaVersion: 1,
      items: [],
    },
  },
};

/** 與 tenant_voice 同級量級，避免誤塞長文 */
const TENANT_VOICE_LIKE_MAX = 10000;

const keywordItemSchema = z.object({
  id: z.string().min(1).max(64),
  keyword: z.string().min(1).max(2000),
  reply: z.string().max(20000),
  mode: z.string().min(1).max(55),
  platformId: z.string().max(255).nullable().optional(),
  shopId: z.string().max(64).nullable().optional(),
  fuzzy: z.boolean().optional(),
  hasRegular: z.boolean().optional(),
});

const shopRosterItemSchema = z
  .object({
    id: z.string().min(1).max(64),
    displayName: z.string().min(1).max(200),
    channel: z.enum(['pinduoduo', 'qianniu']),
    gatewayShopId: z.string().uuid().nullable().optional(),
    externalKeys: z.array(z.string().max(200)).max(50).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

const settingsPayloadSchema = z
  .object({
    schemaVersion: z.number().int().positive().optional(),
    general: z.record(z.unknown()).optional(),
    voice: z.string().max(TENANT_VOICE_LIKE_MAX).optional(),
  })
  .passthrough();

const keywordsPayloadSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  items: z.array(keywordItemSchema).max(5000),
});

const shopRosterPayloadSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  items: z.array(shopRosterItemSchema).max(500),
});

const FORBIDDEN_ROSTER_KEYS = new Set([
  'cookies',
  'cookie',
  'storageState',
  'localStorage',
  'sessionStorage',
  'userDataDir',
  'browserPath',
  'profilePath',
]);

function rowToBundle(
  row: { config_version: string | number; updated_at: Date | string; payload: unknown } | undefined,
  kind: DesktopConfigKind,
): DesktopConfigBundle {
  if (!row) {
    return {
      configVersion: 0,
      updatedAt: null,
      payload: structuredClone(KIND_META[kind].defaultPayload),
    };
  }
  const updatedAt =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : row.updated_at
        ? String(row.updated_at)
        : null;
  return {
    configVersion: Number(row.config_version),
    updatedAt,
    payload: row.payload ?? structuredClone(KIND_META[kind].defaultPayload),
  };
}

export function parseDesktopConfigPayload(
  kind: DesktopConfigKind,
  payload: unknown,
): { ok: true; payload: unknown } | { ok: false; message: string } {
  if (kind === 'settings') {
    const r = settingsPayloadSchema.safeParse(payload);
    if (!r.success) {
      return { ok: false, message: '参数有误，请检查填写内容' };
    }
    return { ok: true, payload: r.data };
  }
  if (kind === 'keywords') {
    const r = keywordsPayloadSchema.safeParse(payload);
    if (!r.success) {
      return { ok: false, message: '参数有误，请检查填写内容' };
    }
    return { ok: true, payload: r.data };
  }
  const r = shopRosterPayloadSchema.safeParse(payload);
  if (!r.success) {
    return { ok: false, message: '参数有误，请检查填写内容' };
  }
  for (const item of r.data.items) {
    for (const key of Object.keys(item)) {
      if (FORBIDDEN_ROSTER_KEYS.has(key)) {
        return { ok: false, message: '店名册不能包含登录态或浏览器本地数据' };
      }
    }
  }
  return { ok: true, payload: r.data };
}

export async function getDesktopConfig(
  tenantId: string,
  kind: DesktopConfigKind,
): Promise<DesktopConfigBundle> {
  const { table } = KIND_META[kind];
  const r = await query<{
    config_version: string;
    updated_at: Date;
    payload: unknown;
  }>(
    `SELECT config_version, updated_at, payload FROM ${table} WHERE tenant_id = $1`,
    [tenantId],
  );
  return rowToBundle(r.rows[0], kind);
}

export async function getAllDesktopConfig(tenantId: string) {
  const [settings, keywords, shopRoster] = await Promise.all([
    getDesktopConfig(tenantId, 'settings'),
    getDesktopConfig(tenantId, 'keywords'),
    getDesktopConfig(tenantId, 'shopRoster'),
  ]);
  return { settings, keywords, shopRoster };
}

export type PutDesktopConfigResult =
  | { ok: true; data: DesktopConfigBundle }
  | { ok: false; conflict: true; data: DesktopConfigBundle };

/**
 * 樂觀鎖寫入：baseVersion 須等於雲端 config_version（無行時視為 0）。
 * 成功後版本 +1。
 */
export async function putDesktopConfig(
  tenantId: string,
  kind: DesktopConfigKind,
  baseVersion: number,
  payload: unknown,
): Promise<PutDesktopConfigResult> {
  const { table } = KIND_META[kind];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query<{
      config_version: string;
      updated_at: Date;
      payload: unknown;
    }>(
      `SELECT config_version, updated_at, payload FROM ${table}
       WHERE tenant_id = $1 FOR UPDATE`,
      [tenantId],
    );

    if (cur.rows.length === 0) {
      if (baseVersion !== 0) {
        await client.query('ROLLBACK');
        return { ok: false, conflict: true, data: rowToBundle(undefined, kind) };
      }
      const ins = await client.query<{
        config_version: string;
        updated_at: Date;
        payload: unknown;
      }>(
        `INSERT INTO ${table} (tenant_id, payload, config_version, updated_at)
         VALUES ($1, $2::jsonb, 1, now())
         RETURNING config_version, updated_at, payload`,
        [tenantId, JSON.stringify(payload)],
      );
      await client.query('COMMIT');
      return { ok: true, data: rowToBundle(ins.rows[0], kind) };
    }

    const current = cur.rows[0];
    if (Number(current.config_version) !== baseVersion) {
      await client.query('ROLLBACK');
      return { ok: false, conflict: true, data: rowToBundle(current, kind) };
    }

    const upd = await client.query<{
      config_version: string;
      updated_at: Date;
      payload: unknown;
    }>(
      `UPDATE ${table}
       SET payload = $2::jsonb,
           config_version = config_version + 1,
           updated_at = now()
       WHERE tenant_id = $1
       RETURNING config_version, updated_at, payload`,
      [tenantId, JSON.stringify(payload)],
    );
    await client.query('COMMIT');
    return { ok: true, data: rowToBundle(upd.rows[0], kind) };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export const putBodySchema = z.object({
  baseVersion: z.number().int().min(0),
  payload: z.unknown(),
});
