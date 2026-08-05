import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import {
  CTX_CURRENT_GOODS,
  CTX_CURRENT_GOODS_ID,
  CTX_GOODS_SPEC,
  CTX_APP_ID,
  CTX_SHOP_ID,
  CTX_SHOP_HINT,
  CTX_KEYWORD_HINTS,
} from '../constants';
import { Context, MessageDTO } from '../types';
import { requestWithAuthRetry } from './gatewayAuthRetry';
import { toPersistedGatewayAuth } from './gatewayAuthPersist';

export type GatewayAuth = {
  gatewayUrl: string;
  username: string;
  /** 仅内存短暂持有；落盘永不写入 */
  password?: string;
  token?: string;
};

function authPath() {
  const base = app?.getPath?.('documents') || process.cwd();
  return path.join(base, 'chatgpt-on-cs', 'gateway-auth.json');
}

export async function loadGatewayAuth(): Promise<GatewayAuth | null> {
  try {
    const raw = await fs.readFile(authPath(), 'utf8');
    const parsed = JSON.parse(raw) as GatewayAuth;
    // 迁移：旧文件若含明文密码，立刻重写去掉
    if (parsed && 'password' in parsed && parsed.password) {
      const cleaned = toPersistedGatewayAuth(parsed);
      await fs.writeFile(authPath(), JSON.stringify(cleaned, null, 2), 'utf8');
      return cleaned;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveGatewayAuth(auth: GatewayAuth) {
  const p = authPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(
    p,
    JSON.stringify(toPersistedGatewayAuth(auth), null, 2),
    'utf8',
  );
}

export async function clearGatewayAuth() {
  try {
    await fs.unlink(authPath());
  } catch {
    // 文件不存在也算已退出
  }
}

function normalizeGatewayUrl(gatewayUrl: string) {
  let base = gatewayUrl.trim().replace(/\/$/, '');
  // 用户常误填后台路径；登录 API 在根路径 /auth/login
  base = base.replace(/\/admin\/?$/, '');
  return base;
}

export async function loginGateway(
  gatewayUrl: string,
  username: string,
  password: string,
) {
  const base = normalizeGatewayUrl(gatewayUrl);
  const user = username.trim();
  const pass = password; // 密码不 trim 尾部空白以外的中间空白；只去首尾
  const passTrimmed = pass.trim();
  let resp: Response;
  try {
    resp = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: passTrimmed }),
    });
  } catch (e) {
    throw new Error(
      `无法连接网关 ${base}（请确认网关已启动，地址勿带后台路径）: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  const json = (await resp.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: { token: string };
  };
  if (!resp.ok || !json.data?.token) {
    if (resp.status === 404) {
      throw new Error(
        `网关地址不正确（收到 404）。请填写本机网关地址，不要加后台路径`,
      );
    }
    if (resp.status === 403 && !json.message) {
      throw new Error(
        `无法访问网关（403）。若使用未备案域名，大陆网络会被拦截；请改用服务器 IP 或完成备案后再用域名`,
      );
    }
    throw new Error(json.message || `登录失败（错误码 ${resp.status}）`);
  }
  const auth: GatewayAuth = {
    gatewayUrl: base,
    username: user,
    token: json.data.token,
  };
  await saveGatewayAuth(auth);
  // 返回值可短暂带密码，供当次会话重登；不落盘
  return { ...auth, password: passTrimmed };
}

export async function assertTenantActive(auth: GatewayAuth) {
  const { response } = await requestWithAuthRetry({
    auth,
    relogin: (a) => {
      if (!a.password) {
        return Promise.reject(new Error('请重新登录网关'));
      }
      return loginGateway(a.gatewayUrl, a.username, a.password);
    },
    request: (token) =>
      fetch(
        `${auth.gatewayUrl.replace(/\/$/, '')}/session/assert-active`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
  });
  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(json.message || '商户账号不可用或已停用');
  }
}

export async function fetchMe(auth: GatewayAuth) {
  const resp = await fetch(`${auth.gatewayUrl.replace(/\/$/, '')}/me`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取账户失败');
  return json.data;
}

async function withAuthToken(auth: GatewayAuth): Promise<GatewayAuth> {
  if (auth.token) return auth;
  if (!auth.password) {
    throw new Error('请重新登录网关');
  }
  return loginGateway(auth.gatewayUrl, auth.username, auth.password);
}

export async function listOperators(auth: GatewayAuth) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/operators`,
    { headers: { Authorization: `Bearer ${a.token}` } },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取客服账号列表失败');
  return json.data as Array<{
    id: string;
    username: string;
    quota_limit: string | null;
    quota_used: string;
  }>;
}

export async function createOperator(
  auth: GatewayAuth,
  payload: {
    username: string;
    password: string;
    quotaLimit?: number | null;
  },
) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/operators`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify({
        username: payload.username,
        password: payload.password,
        quotaLimit: payload.quotaLimit ?? null,
      }),
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '创建客服账号失败');
  return json.data;
}

export async function updateOperatorQuota(
  auth: GatewayAuth,
  operatorId: string,
  quotaLimit: number | null,
) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/operators/${operatorId}/quota`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify({ quotaLimit }),
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '修改用量上限失败');
  return json.data;
}

export async function resetOperatorQuota(auth: GatewayAuth, operatorId: string) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/operators/${operatorId}/reset-quota`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.token}` },
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '重置用量失败');
  return json.data;
}

export async function changeOwnPassword(
  auth: GatewayAuth,
  payload: { currentPassword: string; newPassword: string },
) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/change-password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '修改密码失败');
  return json;
}

export async function listLedger(auth: GatewayAuth) {
  const a = await withAuthToken(auth);
  const resp = await fetch(`${a.gatewayUrl.replace(/\/$/, '')}/tenant/ledger`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取流水失败');
  return json.data as Array<{
    id: string;
    kind: string;
    amount: string;
    balance_after: string | null;
    note: string | null;
    created_at: string;
  }>;
}

export async function listRecharges(auth: GatewayAuth) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/recharges`,
    { headers: { Authorization: `Bearer ${a.token}` } },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取充值记录失败');
  return json.data as Array<{
    id: string;
    amount_credit: string;
    amount_cny: string | null;
    note: string | null;
    created_at: string;
  }>;
}

export async function listTenantUsage(auth: GatewayAuth) {
  const a = await withAuthToken(auth);
  const resp = await fetch(`${a.gatewayUrl.replace(/\/$/, '')}/tenant/usage`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取用量失败');
  return json.data as Array<{
    id: string;
    credit_charged: string;
    created_at: string;
  }>;
}

export async function listShops(auth: GatewayAuth) {
  const a = await withAuthToken(auth);
  const resp = await fetch(`${a.gatewayUrl.replace(/\/$/, '')}/tenant/shops`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取店铺列表失败');
  return json.data as Array<{
    id: string;
    display_name: string;
    channel: string;
    external_keys: string[];
    positioning?: string;
    logistics?: string;
    after_sales?: string;
    forbidden?: string;
    transfer_rules?: string;
  }>;
}

export type ShopPayload = {
  displayName: string;
  channel: 'pinduoduo' | 'qianniu';
  externalKeys: string[];
  positioning?: string;
  logistics?: string;
  afterSales?: string;
  forbidden?: string;
  transferRules?: string;
};

export async function createShop(auth: GatewayAuth, payload: ShopPayload) {
  const a = await withAuthToken(auth);
  const resp = await fetch(`${a.gatewayUrl.replace(/\/$/, '')}/tenant/shops`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${a.token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '创建店铺失败');
  return json.data;
}

export async function updateShop(
  auth: GatewayAuth,
  id: string,
  payload: Partial<ShopPayload>,
) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/shops/${id}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '更新店铺失败');
  return json.data;
}

export async function deleteShop(auth: GatewayAuth, id: string) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/shops/${id}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${a.token}` },
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '删除店铺失败');
  return json;
}

export type PolicyPayload = {
  logistics?: string;
  afterSales?: string;
  forbidden?: string;
  transferRules?: string;
};

export async function getPolicy(auth: GatewayAuth) {
  const a = await withAuthToken(auth);
  const resp = await fetch(`${a.gatewayUrl.replace(/\/$/, '')}/tenant/policy`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取政策失败');
  return json.data as {
    logistics: string;
    after_sales: string;
    forbidden: string;
    transfer_rules: string;
  };
}

export async function savePolicy(auth: GatewayAuth, payload: PolicyPayload) {
  const a = await withAuthToken(auth);
  const resp = await fetch(`${a.gatewayUrl.replace(/\/$/, '')}/tenant/policy`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${a.token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '保存政策失败');
  return json.data;
}

export async function getTenantVoice(auth: GatewayAuth) {
  const a = await withAuthToken(auth);
  const resp = await fetch(`${a.gatewayUrl.replace(/\/$/, '')}/tenant/voice`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取商户补充规则失败');
  return json.data as {
    content: string;
    maxChars: number;
    canEdit: boolean;
  };
}

export async function saveTenantVoice(auth: GatewayAuth, content: string) {
  const a = await withAuthToken(auth);
  const resp = await fetch(`${a.gatewayUrl.replace(/\/$/, '')}/tenant/voice`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${a.token}`,
    },
    body: JSON.stringify({ content }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '保存商户补充规则失败');
  return json.data as { content: string; maxChars: number };
}

export type GoodsNotePayload = {
  goodsId?: string | null;
  titleAliases: string[];
  sellingPoints?: string;
  specsNotes?: string;
  objections?: string;
};

export async function listGoodsNotes(auth: GatewayAuth, shopId: string) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/shops/${shopId}/goods-notes`,
    { headers: { Authorization: `Bearer ${a.token}` } },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取商品卖点失败');
  return json.data as Array<{
    id: string;
    shop_id: string;
    goods_id: string | null;
    title_aliases: string[];
    selling_points: string;
    specs_notes: string;
    objections: string;
  }>;
}

export async function createGoodsNote(
  auth: GatewayAuth,
  shopId: string,
  payload: GoodsNotePayload,
) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/shops/${shopId}/goods-notes`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '新增商品卖点失败');
  return json.data;
}

export async function updateGoodsNote(
  auth: GatewayAuth,
  id: string,
  payload: Partial<GoodsNotePayload>,
) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/goods-notes/${id}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '更新商品卖点失败');
  return json.data;
}

export async function deleteGoodsNote(auth: GatewayAuth, id: string) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/goods-notes/${id}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${a.token}` },
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '删除商品卖点失败');
  return json;
}

export async function listKnowledge(auth: GatewayAuth) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/knowledge`,
    { headers: { Authorization: `Bearer ${a.token}` } },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '获取知识库失败');
  return json.data as Array<{
    id: string;
    title: string;
    content: string;
    updated_at: string;
  }>;
}

export async function createKnowledge(
  auth: GatewayAuth,
  payload: { title: string; content: string },
) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/knowledge`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '新增知识失败');
  return json.data;
}

export async function deleteKnowledge(auth: GatewayAuth, id: string) {
  const a = await withAuthToken(auth);
  const resp = await fetch(
    `${a.gatewayUrl.replace(/\/$/, '')}/tenant/knowledge/${id}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${a.token}` },
    },
  );
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || '删除失败');
  return json;
}

function buildGoodsContext(ctx: Context): string {
  const parts: string[] = [];
  const goods = ctx.get(CTX_CURRENT_GOODS);
  const goodsId = ctx.get(CTX_CURRENT_GOODS_ID);
  const spec = ctx.get(CTX_GOODS_SPEC);
  if (goods) parts.push(`商品=${goods}`);
  if (goodsId) parts.push(`商品ID=${goodsId}`);
  if (spec) parts.push(`规格=${spec}`);
  return parts.join('；');
}

function mapShopChannel(appId: string | undefined): string | null {
  if (appId === 'pinduoduo') return 'pinduoduo';
  if (appId === 'win_qianniu') return 'qianniu';
  return null;
}

export async function gatewayChat(opts: {
  auth: GatewayAuth;
  ctx: Context;
  messages: MessageDTO[];
  /** 桌面超时后取消，避免迟到回复仍扣点 */
  signal?: AbortSignal;
}): Promise<{ content: string; creditCharged?: number } | null> {
  const messages = opts.messages
    .filter((m) => m.role !== 'SYSTEM')
    .map((m) => ({
      role: m.role === 'SELF' ? 'assistant' : 'user',
      content: m.content,
    }));

  const shopHint = opts.ctx.get(CTX_SHOP_HINT);
  const shopId = opts.ctx.get(CTX_SHOP_ID);
  const appId = opts.ctx.get(CTX_APP_ID);
  const goodsTitle = opts.ctx.get(CTX_CURRENT_GOODS);
  const goodsId = opts.ctx.get(CTX_CURRENT_GOODS_ID);
  const keywordHints = opts.ctx.get(CTX_KEYWORD_HINTS);

  const { response: resp } = await requestWithAuthRetry({
    auth: opts.auth,
    signal: opts.signal,
    relogin: (a) => {
      if (!a.password) {
        return Promise.reject(new Error('请重新登录网关'));
      }
      return loginGateway(a.gatewayUrl, a.username, a.password);
    },
    request: (token) =>
      fetch(
        `${opts.auth.gatewayUrl.replace(/\/$/, '')}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: opts.signal,
          body: JSON.stringify({
            messages,
            goodsContext: buildGoodsContext(opts.ctx),
            shopChannel: mapShopChannel(appId),
            shopId: shopId || undefined,
            shopHints: shopHint ? [shopHint] : [],
            goodsId: goodsId || undefined,
            goodsTitle: goodsTitle || undefined,
            keywordHints: keywordHints || undefined,
          }),
        },
      ),
  });

  const json = (await resp.json()) as {
    success?: boolean;
    message?: string;
    data?: { content: string; creditCharged?: number };
  };

  if (resp.status === 402) {
    throw new Error(json.message || '点数或用量不足');
  }
  if (!resp.ok || !json.data?.content) {
    throw new Error(json.message || '网关未返回可用回复');
  }
  return json.data;
}

export type DesktopConfigBundle = {
  configVersion: number;
  updatedAt: string | null;
  payload: unknown;
};

export type DesktopConfigAll = {
  settings: DesktopConfigBundle;
  keywords: DesktopConfigBundle;
  shopRoster: DesktopConfigBundle;
};

export type DesktopConfigPutKind = 'settings' | 'keywords' | 'shop-roster';

export class DesktopConfigConflictError extends Error {
  data: DesktopConfigBundle;

  constructor(message: string, data: DesktopConfigBundle) {
    super(message);
    this.name = 'DesktopConfigConflictError';
    this.data = data;
  }
}

async function gatewayJson(
  auth: GatewayAuth,
  pathAndQuery: string,
  init?: RequestInit,
) {
  const a = await withAuthToken(auth);
  const { response, auth: next } = await requestWithAuthRetry({
    auth: a,
    relogin: (x) => {
      if (!x.password) {
        return Promise.reject(new Error('请重新登录网关'));
      }
      return loginGateway(x.gatewayUrl, x.username, x.password);
    },
    request: (token) =>
      fetch(`${a.gatewayUrl.replace(/\/$/, '')}${pathAndQuery}`, {
        ...init,
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      }),
  });
  if (next.token && next.token !== auth.token) {
    await saveGatewayAuth(next);
  }
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    code?: string;
    data?: unknown;
  };
  return { response, json };
}

export async function fetchDesktopConfigAll(
  auth: GatewayAuth,
): Promise<DesktopConfigAll> {
  const { response, json } = await gatewayJson(auth, '/tenant/desktop-config');
  if (response.status === 404) {
    throw new Error('拉取桌面配置失败（404）');
  }
  if (!response.ok || !json.data) {
    throw new Error(json.message || '拉取桌面配置失败');
  }
  return json.data as DesktopConfigAll;
}

export async function putDesktopConfigPart(
  auth: GatewayAuth,
  kind: DesktopConfigPutKind,
  baseVersion: number,
  payload: unknown,
): Promise<DesktopConfigBundle> {
  const { response, json } = await gatewayJson(
    auth,
    `/tenant/desktop-config/${kind}`,
    {
      method: 'PUT',
      body: JSON.stringify({ baseVersion, payload }),
    },
  );
  if (response.status === 409 && json.data) {
    throw new DesktopConfigConflictError(
      json.message || '配置已被其他设备更新，请先拉取后再保存',
      json.data as DesktopConfigBundle,
    );
  }
  if (!response.ok || !json.data) {
    throw new Error(json.message || '上传桌面配置失败');
  }
  return json.data as DesktopConfigBundle;
}
