import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { Op } from 'sequelize';
import { Config } from '../entities/config';
import { Instance } from '../entities/instance';
import { Keyword } from '../entities/keyword';
import { ReplaceKeyword } from '../entities/replace';
import { TransferKeyword } from '../entities/transfer';
import {
  DesktopConfigConflictError,
  fetchDesktopConfigAll,
  loadGatewayAuth,
  putDesktopConfigPart,
  type DesktopConfigBundle,
  type GatewayAuth,
} from './gatewayClient';
import { hasUsableGatewaySession } from './gatewayAuthPersist';

type SyncState = {
  settingsVersion: number;
  keywordsVersion: number;
  shopRosterVersion: number;
  gatewayOnline: boolean;
  lastPulledAt: string | null;
};

const DEFAULT_STATE: SyncState = {
  settingsVersion: 0,
  keywordsVersion: 0,
  shopRosterVersion: 0,
  gatewayOnline: false,
  lastPulledAt: null,
};

let memoryOnline = false;
/** 閘道是否已提供 /tenant/desktop-config（404 時為 false，仍允許本機編輯） */
let syncSupported = true;
let keywordsTimer: ReturnType<typeof setTimeout> | null = null;
let settingsTimer: ReturnType<typeof setTimeout> | null = null;
let rosterTimer: ReturnType<typeof setTimeout> | null = null;

function statePath() {
  const base = app?.getPath?.('documents') || process.cwd();
  return path.join(base, 'chatgpt-on-cs', 'desktop-config-sync.json');
}

async function loadState(): Promise<SyncState> {
  try {
    const raw = await fs.readFile(statePath(), 'utf8');
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<SyncState>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function saveState(state: SyncState) {
  const p = statePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(state, null, 2), 'utf8');
}

function setOnline(online: boolean) {
  memoryOnline = online;
}

export function isGatewayConfigOnline(): boolean {
  return memoryOnline;
}

function isMissingDesktopConfigApi(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /404|Not Found|桌面配置/.test(msg) && /失败|404|Not Found/.test(msg);
}

export async function assertCanEditDesktopConfig() {
  const auth = await loadGatewayAuth();
  if (!hasUsableGatewaySession(auth)) {
    throw new Error('请先登录网关后再修改配置');
  }
  if (!syncSupported) {
    // 舊閘道無同步接口：不阻本地編輯
    setOnline(true);
    return;
  }
  if (memoryOnline) return;
  try {
    await fetchDesktopConfigAll(auth!);
    setOnline(true);
    syncSupported = true;
    const st = await loadState();
    st.gatewayOnline = true;
    await saveState(st);
  } catch (e) {
    if (isMissingDesktopConfigApi(e)) {
      syncSupported = false;
      setOnline(true);
      return;
    }
    setOnline(false);
    throw new Error('当前无法连接网关，配置暂为只读（联网后再改）');
  }
}

function channelToAppId(channel: string): string {
  if (channel === 'qianniu') return 'win_qianniu';
  return 'pinduoduo';
}

function appIdToChannel(appId: string): 'pinduoduo' | 'qianniu' {
  if (appId === 'win_qianniu' || appId.includes('qianniu')) return 'qianniu';
  return 'pinduoduo';
}

type KeywordCloudItem = {
  id: string;
  keyword: string;
  reply: string;
  mode: string;
  platformId?: string | null;
  shopId?: string | null;
  fuzzy?: boolean;
  hasRegular?: boolean;
};

async function ensureAuth(): Promise<GatewayAuth> {
  const auth = await loadGatewayAuth();
  if (!hasUsableGatewaySession(auth)) {
    throw new Error('请先登录网关');
  }
  return auth!;
}

async function applySettingsPayload(payload: unknown) {
  const p = (payload || {}) as {
    general?: Record<string, unknown>;
    voice?: string;
  };
  const g = p.general || {};
  const globalCfg = await Config.findOne({ where: { global: true } });
  if (globalCfg) {
    await globalCfg.update({
      has_keyword_match:
        typeof g.hasKeywordMatch === 'boolean'
          ? g.hasKeywordMatch
          : globalCfg.has_keyword_match,
      has_replace:
        typeof g.hasReplace === 'boolean'
          ? g.hasReplace
          : globalCfg.has_replace,
      has_transfer:
        typeof g.hasTransfer === 'boolean'
          ? g.hasTransfer
          : globalCfg.has_transfer,
      has_use_gpt:
        typeof g.hasUseGpt === 'boolean' ? g.hasUseGpt : globalCfg.has_use_gpt,
      has_paused:
        typeof g.hasPaused === 'boolean' ? g.hasPaused : globalCfg.has_paused,
    });
  }
  // 同步默認回覆等到「非全局」活躍配置行（若有）
  const generic = await Config.findOne({
    where: { global: false, active: true },
  });
  const target = generic || globalCfg;
  if (target) {
    await target.update({
      default_reply:
        typeof g.defaultReply === 'string'
          ? g.defaultReply
          : target.default_reply,
      failure_handoff_reply:
        typeof g.failureHandoffReply === 'string'
          ? g.failureHandoffReply
          : target.failure_handoff_reply,
      truncate_word_count:
        typeof g.truncateWordCount === 'number'
          ? g.truncateWordCount
          : target.truncate_word_count,
      truncate_word_key:
        typeof g.truncateWordKey === 'string'
          ? g.truncateWordKey
          : target.truncate_word_key,
      handoff_cooldown_seconds:
        typeof g.handoffCooldownSeconds === 'number'
          ? g.handoffCooldownSeconds
          : target.handoff_cooldown_seconds,
    });
  }
}

async function buildSettingsPayload(): Promise<Record<string, unknown>> {
  const globalCfg = await Config.findOne({ where: { global: true } });
  const generic = await Config.findOne({
    where: { global: false, active: true },
  });
  const g = generic || globalCfg;
  return {
    schemaVersion: 1,
    general: {
      hasKeywordMatch: Boolean(globalCfg?.has_keyword_match),
      hasReplace: Boolean(globalCfg?.has_replace),
      hasTransfer: Boolean(globalCfg?.has_transfer),
      hasUseGpt: Boolean(globalCfg?.has_use_gpt),
      hasPaused: Boolean(globalCfg?.has_paused),
      defaultReply: g?.default_reply || '',
      failureHandoffReply: g?.failure_handoff_reply || '',
      truncateWordCount: g?.truncate_word_count ?? null,
      truncateWordKey: g?.truncate_word_key || '',
      handoffCooldownSeconds: g?.handoff_cooldown_seconds ?? null,
    },
    voice: '',
  };
}

async function applyKeywordsPayload(payload: unknown) {
  const items = ((payload as { items?: KeywordCloudItem[] })?.items ||
    []) as KeywordCloudItem[];
  // Sequelize 禁止 where: {} 的全表刪除；用永真條件
  await Keyword.destroy({ where: { id: { [Op.gte]: 0 } } });
  await ReplaceKeyword.destroy({ where: { id: { [Op.gte]: 0 } } });
  await TransferKeyword.destroy({ where: { id: { [Op.gte]: 0 } } });

  for (const item of items) {
    const mode = String(item.mode || 'keyword');
    if (mode === 'replace') {
      await ReplaceKeyword.create({
        cloud_id: item.id,
        keyword: item.keyword,
        replace: item.reply || '',
        app_id: item.platformId || '',
        fuzzy: item.fuzzy ?? true,
        has_regular: item.hasRegular ?? false,
      });
    } else if (mode === 'transfer') {
      await TransferKeyword.create({
        cloud_id: item.id,
        keyword: item.keyword,
        app_id: item.platformId || '',
        fuzzy: item.fuzzy ?? true,
        has_regular: item.hasRegular ?? false,
      });
    } else {
      await Keyword.create({
        cloud_id: item.id,
        keyword: item.keyword,
        reply: item.reply || '',
        mode: 'fuzzy',
        platform_id: item.platformId || null,
        shop_id: null,
        fuzzy: item.fuzzy ?? true,
        has_regular: item.hasRegular ?? false,
      });
    }
  }
}

async function buildKeywordsPayload(): Promise<{
  schemaVersion: number;
  items: KeywordCloudItem[];
}> {
  const items: KeywordCloudItem[] = [];
  const keywords = await Keyword.findAll({
    where: {
      [Op.or]: [{ shop_id: null }, { shop_id: '' }],
    },
  });
  for (const row of keywords) {
    if (!row.cloud_id) {
      row.cloud_id = randomUUID();
      await row.save();
    }
    items.push({
      id: row.cloud_id,
      keyword: row.keyword,
      reply: row.reply,
      mode: 'keyword',
      platformId: row.platform_id || null,
      shopId: null,
      fuzzy: Boolean(row.fuzzy),
      hasRegular: Boolean(row.has_regular),
    });
  }
  const replaces = await ReplaceKeyword.findAll();
  for (const row of replaces) {
    if (!row.cloud_id) {
      row.cloud_id = randomUUID();
      await row.save();
    }
    items.push({
      id: row.cloud_id,
      keyword: row.keyword,
      reply: row.replace,
      mode: 'replace',
      platformId: row.app_id || null,
      shopId: null,
      fuzzy: Boolean(row.fuzzy),
      hasRegular: Boolean(row.has_regular),
    });
  }
  const transfers = await TransferKeyword.findAll();
  for (const row of transfers) {
    if (!row.cloud_id) {
      row.cloud_id = randomUUID();
      await row.save();
    }
    items.push({
      id: row.cloud_id,
      keyword: row.keyword,
      reply: '',
      mode: 'transfer',
      platformId: row.app_id || null,
      shopId: null,
      fuzzy: Boolean(row.fuzzy),
      hasRegular: Boolean(row.has_regular),
    });
  }
  return { schemaVersion: 1, items };
}

async function applyShopRosterPayload(payload: unknown) {
  const items = ((payload as { items?: Array<Record<string, unknown>> })
    ?.items || []) as Array<{
    id: string;
    displayName: string;
    channel: 'pinduoduo' | 'qianniu';
    gatewayShopId?: string | null;
    sortOrder?: number;
  }>;

  const locals = await Instance.findAll();
  const byRoster = new Map(
    locals.filter((i) => i.roster_id).map((i) => [i.roster_id!, i]),
  );
  const byGateway = new Map(
    locals
      .filter((i) => i.gateway_shop_id)
      .map((i) => [i.gateway_shop_id!, i]),
  );
  const seenLocalIds = new Set<number>();

  for (const item of items) {
    let inst =
      byRoster.get(item.id) ||
      (item.gatewayShopId ? byGateway.get(item.gatewayShopId) : undefined);
    if (!inst) {
      inst = await Instance.create({
        app_id: channelToAppId(item.channel),
        env_id: `roster-${item.id.slice(0, 8)}`,
        shop_name: item.displayName,
        login_status: 'closed',
        gateway_shop_id: item.gatewayShopId || null,
        roster_id: item.id,
        auto_reply_enabled: true,
        created_at: new Date(),
      });
    } else {
      inst.roster_id = item.id;
      inst.shop_name = item.displayName || inst.shop_name;
      if (item.gatewayShopId) inst.gateway_shop_id = item.gatewayShopId;
      const wantApp = channelToAppId(item.channel);
      if (inst.app_id !== wantApp && inst.login_status !== 'logged_in') {
        inst.app_id = wantApp;
      }
      await inst.save();
    }
    seenLocalIds.add(inst.id);
  }

  // 雲端已刪且本機未登錄的店：移除名冊條目（保留已登錄／待掃碼窗）
  for (const inst of locals) {
    if (seenLocalIds.has(inst.id)) continue;
    if (inst.login_status === 'logged_in' || inst.login_status === 'pending') {
      continue;
    }
    await inst.destroy();
  }
}

async function buildShopRosterPayload(): Promise<{
  schemaVersion: number;
  items: Array<Record<string, unknown>>;
}> {
  const instances = await Instance.findAll({ order: [['id', 'ASC']] });
  const items = [];
  for (const inst of instances) {
    if (!inst.roster_id) {
      inst.roster_id = randomUUID();
      await inst.save();
    }
    items.push({
      id: inst.roster_id,
      displayName: inst.shop_name || `店铺 ${inst.id}`,
      channel: appIdToChannel(inst.app_id),
      gatewayShopId: inst.gateway_shop_id || null,
      externalKeys: [],
      sortOrder: inst.id,
    });
  }
  return { schemaVersion: 1, items };
}

async function rememberBundle(
  kind: 'settings' | 'keywords' | 'shopRoster',
  bundle: DesktopConfigBundle,
) {
  const st = await loadState();
  if (kind === 'settings') st.settingsVersion = bundle.configVersion;
  if (kind === 'keywords') st.keywordsVersion = bundle.configVersion;
  if (kind === 'shopRoster') st.shopRosterVersion = bundle.configVersion;
  st.gatewayOnline = true;
  await saveState(st);
  setOnline(true);
}

/** 登入／恢復會話後拉取並覆寫本機可同步配置 */
export async function pullDesktopConfigOnLogin(): Promise<{
  ok: boolean;
  message?: string;
}> {
  try {
    const auth = await ensureAuth();
    let all;
    try {
      all = await fetchDesktopConfigAll(auth);
    } catch (e) {
      if (isMissingDesktopConfigApi(e)) {
        syncSupported = false;
        setOnline(true);
        return {
          ok: true,
          message: '网关暂无配置同步接口，已跳过云同步',
        };
      }
      throw e;
    }
    syncSupported = true;
    setOnline(true);

    // 雲端從未寫過（version 0）且本機已有數據 → 首次上傳，避免空包蓋掉本機
    const st = await loadState();
    if (all.settings.configVersion === 0) {
      const payload = await buildSettingsPayload();
      const saved = await putDesktopConfigPart(auth, 'settings', 0, payload);
      await rememberBundle('settings', saved);
    } else {
      await applySettingsPayload(all.settings.payload);
      await rememberBundle('settings', all.settings);
    }

    if (all.keywords.configVersion === 0) {
      const local = await buildKeywordsPayload();
      if (local.items.length > 0) {
        const saved = await putDesktopConfigPart(auth, 'keywords', 0, local);
        await rememberBundle('keywords', saved);
      } else {
        await rememberBundle('keywords', all.keywords);
      }
    } else {
      await applyKeywordsPayload(all.keywords.payload);
      await rememberBundle('keywords', all.keywords);
    }

    if (all.shopRoster.configVersion === 0) {
      const local = await buildShopRosterPayload();
      if (local.items.length > 0) {
        const saved = await putDesktopConfigPart(auth, 'shop-roster', 0, local);
        await rememberBundle('shopRoster', saved);
      } else {
        await rememberBundle('shopRoster', all.shopRoster);
      }
    } else {
      await applyShopRosterPayload(all.shopRoster.payload);
      await rememberBundle('shopRoster', all.shopRoster);
    }

    const next = await loadState();
    next.lastPulledAt = new Date().toISOString();
    next.gatewayOnline = true;
    await saveState(next);
    return { ok: true };
  } catch (e) {
    setOnline(false);
    const st = await loadState();
    st.gatewayOnline = false;
    await saveState(st);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

async function pushKind(
  kind: 'settings' | 'keywords' | 'shopRoster',
  apiKind: 'settings' | 'keywords' | 'shop-roster',
  build: () => Promise<unknown>,
  applyConflict: (payload: unknown) => Promise<void>,
) {
  if (!syncSupported) {
    return { ok: true as const };
  }
  const auth = await ensureAuth();
  const st = await loadState();
  const baseVersion =
    kind === 'settings'
      ? st.settingsVersion
      : kind === 'keywords'
        ? st.keywordsVersion
        : st.shopRosterVersion;
  const payload = await build();
  try {
    const saved = await putDesktopConfigPart(auth, apiKind, baseVersion, payload);
    await rememberBundle(kind, saved);
    return { ok: true as const };
  } catch (e) {
    if (e instanceof DesktopConfigConflictError) {
      await applyConflict(e.data.payload);
      await rememberBundle(kind, e.data);
      throw new Error(
        '配置已从云端刷新（其他设备已更新），请重新修改后再保存',
      );
    }
    setOnline(false);
    throw e;
  }
}

export async function pushDesktopSettings() {
  return pushKind(
    'settings',
    'settings',
    buildSettingsPayload,
    applySettingsPayload,
  );
}

export async function pushDesktopKeywords() {
  return pushKind(
    'keywords',
    'keywords',
    buildKeywordsPayload,
    applyKeywordsPayload,
  );
}

export async function pushDesktopShopRoster() {
  return pushKind(
    'shopRoster',
    'shop-roster',
    buildShopRosterPayload,
    applyShopRosterPayload,
  );
}

export function schedulePushDesktopKeywords() {
  if (keywordsTimer) clearTimeout(keywordsTimer);
  keywordsTimer = setTimeout(() => {
    pushDesktopKeywords().catch((e) =>
      console.warn('push keywords sync failed:', e),
    );
  }, 500);
}

export function schedulePushDesktopSettings() {
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    pushDesktopSettings().catch((e) =>
      console.warn('push settings sync failed:', e),
    );
  }, 400);
}

export function schedulePushDesktopShopRoster() {
  if (rosterTimer) clearTimeout(rosterTimer);
  rosterTimer = setTimeout(() => {
    pushDesktopShopRoster().catch((e) =>
      console.warn('push shop roster sync failed:', e),
    );
  }, 500);
}

export async function markGatewayOffline() {
  setOnline(false);
  const st = await loadState();
  st.gatewayOnline = false;
  await saveState(st);
}
