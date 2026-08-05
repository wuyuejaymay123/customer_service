import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { query } from './db.js';
import {
  authRequired,
  hashPassword,
  login,
  requireActiveTenant,
  requireRole,
  verifyPassword,
} from './auth.js';
import {
  estimateCredits,
  getPrice,
  recharge,
  releaseExpiredReserves,
  releaseReserve,
  reserveCredits,
  settleReserve,
  adjustCredits,
  setOperatorQuota,
  resetOperatorQuotaUsed,
  listPriceBook,
  upsertPriceBook,
  setTenantDiscount,
} from './billing.js';
import { selectKnowledgeForPrompt } from './knowledge.js';
import {
  DEEPSEEK_DEFAULT_RATES,
  computeUpstreamCostCny,
  creditToCny,
  marginCny,
  resolveUpstreamTier,
} from './upstreamCost.js';
import { tenantChatSuccessData } from './tenantChatResponse.js';
import { chatReserveAmount } from './chatReserve.js';
import {
  formatGoodsCatalogBlock,
  formatGoodsNoteBlock,
  formatPolicyBlock,
  getShop,
  listGoodsNotes,
  listShops,
  matchGoodsNote,
  mergeShopPolicy,
  resolveShop,
} from './shops.js';
import {
  getPlatformHardRules,
  getTenantVoice,
  HARD_RULES_TAIL_REMINDER,
  setPlatformHardRules,
  setTenantVoice,
  ensureHardRulesSeeded,
  TENANT_VOICE_MAX_CHARS,
} from './promptLayers.js';
import { listTenantUsageForClient } from './tenantUsageClient.js';
import {
  getAllDesktopConfig,
  getDesktopConfig,
  parseDesktopConfigPayload,
  putBodySchema,
  putDesktopConfig,
  type DesktopConfigKind,
} from './desktopConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

/** Express 4 不会自动捕获 async 抛错；统一转给错误中间件，避免整站挂掉 */
function wrap(
  fn: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => Promise<unknown>,
) {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason);
});
app.use('/admin', express.static(path.join(__dirname, '../admin')));

/** 停用后 JWT 仍有效时，禁止一切 /tenant 读写（/me 可看停用状态） */
app.use('/tenant', authRequired, requireActiveTenant);

function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '****';
  return `${'*'.repeat(Math.min(8, key.length - 4))}${key.slice(-4)}`;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/auth/login', async (req, res) => {
  const body = z
    .object({ username: z.string(), password: z.string() })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
    return;
  }
  try {
    const result = await login(body.data.username, body.data.password);
    if (!result) {
      res.status(401).json({ success: false, message: '账号或密码错误' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (e) {
    if (e instanceof Error && e.message === 'TENANT_SUSPENDED') {
      res.status(403).json({ success: false, message: '商户已停用' });
      return;
    }
    throw e;
  }
});

app.get('/me', authRequired, async (req, res) => {
  const user = req.user!;
  let wallet = null;
  let lowBalance = false;
  if (user.tenantId) {
    const w = await query<{ balance: string; reserved: string }>(
      'SELECT balance, reserved FROM wallets WHERE tenant_id = $1',
      [user.tenantId],
    );
    const th = await query<{ threshold_credit: string }>(
      'SELECT threshold_credit FROM low_balance_thresholds WHERE tenant_id = $1',
      [user.tenantId],
    );
    if (w.rows[0]) {
      const available = Number(w.rows[0].balance) - Number(w.rows[0].reserved);
      wallet = {
        balance: Number(w.rows[0].balance),
        reserved: Number(w.rows[0].reserved),
        available,
      };
      const threshold = Number(th.rows[0]?.threshold_credit ?? 100);
      lowBalance = available < threshold;
    }
  }
  const tenant = user.tenantId
    ? (
        await query<{ status: string; name: string }>(
          'SELECT status, name FROM tenants WHERE id = $1',
          [user.tenantId],
        )
      ).rows[0]
    : null;
  res.json({
    success: true,
    data: { user, wallet, lowBalance, tenant },
  });
});

app.post(
  '/admin/tenants',
  authRequired,
  requireRole('platform_admin'),
  async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        adminUsername: z.string().min(3),
        adminPassword: z.string().min(6),
        discountRate: z.number().min(0.01).max(1).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    try {
      const hash = await hashPassword(body.data.adminPassword);
      const t = await query<{ id: string }>(
        `INSERT INTO tenants (name, discount_rate) VALUES ($1, $2) RETURNING id`,
        [body.data.name, body.data.discountRate ?? 1],
      );
      const tenantId = t.rows[0].id;
      await query(`INSERT INTO wallets (tenant_id) VALUES ($1)`, [tenantId]);
      await query(
        `INSERT INTO low_balance_thresholds (tenant_id) VALUES ($1)`,
        [tenantId],
      );
      await query(
        `INSERT INTO operators (tenant_id, username, password_hash, role)
         VALUES ($1, $2, $3, 'tenant_admin')`,
        [tenantId, body.data.adminUsername, hash],
      );
      res.json({
        success: true,
        data: {
          tenantId,
          adminUsername: body.data.adminUsername,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('duplicate key') || message.includes('unique')) {
        res.status(409).json({
          success: false,
          message: '账号已存在',
        });
        return;
      }
      res.status(500).json({ success: false, message: '开通商户失败' });
    }
  },
);

app.get(
  '/admin/tenants',
  authRequired,
  requireRole('platform_admin'),
  async (_req, res) => {
    const r = await query(
      `SELECT t.*, w.balance, w.reserved,
              (
                SELECT o.username
                FROM operators o
                WHERE o.tenant_id = t.id AND o.role = 'tenant_admin'
                ORDER BY o.created_at ASC
                LIMIT 1
              ) AS admin_username
       FROM tenants t
       LEFT JOIN wallets w ON w.tenant_id = t.id
       ORDER BY t.created_at DESC`,
    );
    res.json({ success: true, data: r.rows });
  },
);

app.post(
  '/admin/tenants/:id/suspend',
  authRequired,
  requireRole('platform_admin'),
  async (req, res) => {
    await query(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [
      req.params.id,
    ]);
    res.json({ success: true });
  },
);

app.post(
  '/admin/tenants/:id/activate',
  authRequired,
  requireRole('platform_admin'),
  async (req, res) => {
    await query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [
      req.params.id,
    ]);
    res.json({ success: true });
  },
);

app.post(
  '/admin/tenants/:id/reset-admin-password',
  authRequired,
  requireRole('platform_admin'),
  async (req, res) => {
    const body = z
      .object({
        password: z.string().min(6),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        success: false,
        message: '新密码至少 6 位',
      });
      return;
    }
    const admin = await query<{ id: string; username: string }>(
      `SELECT id, username FROM operators
       WHERE tenant_id = $1 AND role = 'tenant_admin'
       ORDER BY created_at ASC
       LIMIT 1`,
      [req.params.id],
    );
    if (!admin.rows[0]) {
      res.status(404).json({
        success: false,
        message: '该商户还没有管理员账号',
      });
      return;
    }
    const hash = await hashPassword(body.data.password);
    await query(`UPDATE operators SET password_hash = $1 WHERE id = $2`, [
      hash,
      admin.rows[0].id,
    ]);
    res.json({
      success: true,
      data: {
        adminUsername: admin.rows[0].username,
      },
    });
  },
);

app.post(
  '/admin/tenants/:id/recharge',
  authRequired,
  requireRole('platform_admin'),
  wrap(async (req, res) => {
    const body = z
      .object({
        amountCredit: z.number().positive().optional(),
        amountCny: z.number().positive().optional(),
        note: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    let credit = body.data.amountCredit;
    if (credit == null && body.data.amountCny != null) {
      const rate = await getPrice('cny_to_credit');
      credit = body.data.amountCny * rate;
    }
    if (credit == null) {
      res.status(400).json({ success: false, message: '请填写充值点数或人民币金额' });
      return;
    }
    const id = await recharge({
      tenantId: req.params.id,
      amountCredit: credit,
      amountCny: body.data.amountCny,
      note: body.data.note,
      createdBy: req.user!.id,
    });
    res.json({ success: true, data: { rechargeId: id, credit } });
  }),
);

app.post(
  '/admin/tenants/:id/adjust',
  authRequired,
  requireRole('platform_admin'),
  wrap(async (req, res) => {
    const body = z
      .object({
        amountCredit: z.number().refine((n) => n !== 0),
        note: z.string().min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        success: false,
        message: '请填写非零调账点数与备注',
      });
      return;
    }
    try {
      const data = await adjustCredits({
        tenantId: req.params.id,
        amountCredit: body.data.amountCredit,
        note: body.data.note,
        createdBy: req.user!.id,
      });
      res.json({ success: true, data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'ADJUSTMENT_BELOW_RESERVED') {
        res.status(400).json({
          success: false,
          message: '调账后余额不能低于已冻结点数',
        });
        return;
      }
      throw e;
    }
  }),
);

app.post(
  '/admin/tenants/:id/discount',
  authRequired,
  requireRole('platform_admin'),
  async (req, res) => {
    const body = z
      .object({
        discountRate: z.number().min(0.01).max(1),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        success: false,
        message: '折扣须在 0.01～1 之间',
      });
      return;
    }
    const row = await setTenantDiscount({
      tenantId: req.params.id,
      discountRate: body.data.discountRate,
    });
    if (!row) {
      res.status(404).json({ success: false, message: '找不到该商户' });
      return;
    }
    res.json({ success: true, data: row });
  },
);

app.delete(
  '/admin/tenants/:id',
  authRequired,
  requireRole('platform_admin'),
  async (req, res) => {
    const body = z
      .object({
        confirmName: z.string().min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        success: false,
        message: '请输入商户名称以确认删除',
      });
      return;
    }
    const t = await query<{ id: string; name: string }>(
      'SELECT id, name FROM tenants WHERE id = $1',
      [req.params.id],
    );
    if (!t.rows[0]) {
      res.status(404).json({ success: false, message: '找不到该商户' });
      return;
    }
    if (t.rows[0].name !== body.data.confirmName) {
      res.status(400).json({
        success: false,
        message: '确认名称与商户名称不一致',
      });
      return;
    }
    const tid = t.rows[0].id;
    await query('DELETE FROM usage_records WHERE tenant_id = $1', [tid]);
    await query('DELETE FROM ledger_entries WHERE tenant_id = $1', [tid]);
    await query('DELETE FROM recharges WHERE tenant_id = $1', [tid]);
    await query('DELETE FROM reserves WHERE tenant_id = $1', [tid]);
    await query(
      `DELETE FROM shop_goods_notes WHERE shop_id IN
       (SELECT id FROM shops WHERE tenant_id = $1)`,
      [tid],
    );
    await query('DELETE FROM shops WHERE tenant_id = $1', [tid]);
    await query('DELETE FROM tenant_policies WHERE tenant_id = $1', [tid]);
    await query('DELETE FROM tenant_knowledge WHERE tenant_id = $1', [tid]);
    await query('DELETE FROM operators WHERE tenant_id = $1', [tid]);
    await query('DELETE FROM low_balance_thresholds WHERE tenant_id = $1', [
      tid,
    ]);
    await query('DELETE FROM wallets WHERE tenant_id = $1', [tid]);
    await query('DELETE FROM tenants WHERE id = $1', [tid]);
    res.json({ success: true });
  },
);

app.get(
  '/admin/price-book',
  authRequired,
  requireRole('platform_admin'),
  async (_req, res) => {
    res.json({ success: true, data: await listPriceBook() });
  },
);

app.put(
  '/admin/price-book/:key',
  authRequired,
  requireRole('platform_admin'),
  async (req, res) => {
    const body = z
      .object({
        value: z.number().positive(),
        note: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    await upsertPriceBook({
      key: req.params.key,
      value: body.data.value,
      note: body.data.note,
    });
    res.json({ success: true, data: await listPriceBook() });
  },
);

app.get(
  '/admin/model-skus',
  authRequired,
  requireRole('platform_admin'),
  async (_req, res) => {
    const r = await query<{
      id: string;
      name: string;
      base_url: string;
      api_key: string;
      model: string;
      active: boolean;
      platform_prompt: string;
    }>(
      `SELECT id, name, base_url, api_key, model, active, platform_prompt
       FROM model_skus ORDER BY active DESC, name ASC`,
    );
    res.json({
      success: true,
      data: r.rows.map((row) => ({
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        model: row.model,
        active: row.active,
        platformPrompt: row.platform_prompt,
        apiKeyMasked: maskApiKey(row.api_key),
        hasApiKey: Boolean(row.api_key),
      })),
    });
  },
);

app.get(
  '/admin/hard-rules',
  authRequired,
  requireRole('platform_admin'),
  async (_req, res) => {
    const content = await getPlatformHardRules();
    res.json({ success: true, data: { content } });
  },
);

app.put(
  '/admin/hard-rules',
  authRequired,
  requireRole('platform_admin'),
  async (req, res) => {
    const body = z
      .object({ content: z.string().max(50000) })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, message: '参数有误' });
      return;
    }
    const content = await setPlatformHardRules(body.data.content);
    res.json({ success: true, data: { content } });
  },
);

app.get(
  '/tenant/voice',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    if (!req.user!.tenantId) {
      res.status(403).json({ success: false, message: '未绑定商户' });
      return;
    }
    const content = await getTenantVoice(req.user!.tenantId);
    res.json({
      success: true,
      data: {
        content,
        maxChars: TENANT_VOICE_MAX_CHARS,
        canEdit: req.user!.role === 'tenant_admin',
      },
    });
  },
);

app.put(
  '/tenant/voice',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    if (!req.user!.tenantId) {
      res.status(403).json({ success: false, message: '未绑定商户' });
      return;
    }
    const body = z.object({ content: z.string() }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, message: '参数有误' });
      return;
    }
    const result = await setTenantVoice(req.user!.tenantId, body.data.content);
    if (!result.ok) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }
    res.json({
      success: true,
      data: { content: result.content, maxChars: TENANT_VOICE_MAX_CHARS },
    });
  },
);

app.post(
  '/admin/model-skus',
  authRequired,
  requireRole('platform_admin'),
  async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        baseUrl: z.string().url(),
        apiKey: z.string().optional().default(''),
        model: z.string().min(1),
        platformPrompt: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    const existing = await query<{ api_key: string }>(
      `SELECT api_key FROM model_skus WHERE name = $1`,
      [body.data.name],
    );
    const nextKey = body.data.apiKey.trim();
    if (!nextKey && !existing.rows[0]?.api_key) {
      res.status(400).json({ success: false, message: '请填写接口密钥' });
      return;
    }
    await query(`UPDATE model_skus SET active = false`);
    const r = await query(
      `INSERT INTO model_skus (name, base_url, api_key, model, platform_prompt, active)
       VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT (name) DO UPDATE SET
         base_url = EXCLUDED.base_url,
         api_key = CASE
           WHEN EXCLUDED.api_key = '' THEN model_skus.api_key
           ELSE EXCLUDED.api_key
         END,
         model = EXCLUDED.model,
         platform_prompt = EXCLUDED.platform_prompt,
         active = true
       RETURNING id, name, model, active`,
      [
        body.data.name,
        body.data.baseUrl,
        nextKey,
        body.data.model,
        body.data.platformPrompt ?? '',
      ],
    );
    res.json({ success: true, data: r.rows[0] });
  },
);

app.get(
  '/admin/usage',
  authRequired,
  requireRole('platform_admin'),
  async (_req, res) => {
    const r = await query<{
      id: string;
      model: string | null;
      prompt_tokens: number;
      completion_tokens: number;
      cost_upstream: string | null;
      credit_charged: string;
      success: boolean;
      created_at: string;
      tenant_id: string;
    }>(
      `SELECT id, tenant_id, model, prompt_tokens, completion_tokens,
              cost_upstream, credit_charged, success, created_at
       FROM usage_records ORDER BY created_at DESC LIMIT 100`,
    );
    const cnyToCredit = await getPrice('cny_to_credit');
    let creditSum = 0;
    let costSum = 0;
    for (const row of r.rows) {
      creditSum += Number(row.credit_charged || 0);
      costSum += Number(row.cost_upstream || 0);
    }
    const revenueCny = creditToCny(creditSum, cnyToCredit);
    const m = marginCny(revenueCny, costSum);
    res.json({
      success: true,
      data: r.rows,
      summary: {
        rows: r.rows.length,
        creditCharged: Number(creditSum.toFixed(4)),
        costUpstreamCny: Number(costSum.toFixed(6)),
        revenueCny,
        marginCny: m,
        marginRate:
          revenueCny > 0 ? Number((m / revenueCny).toFixed(4)) : null,
      },
    });
  },
);

app.post(
  '/tenant/operators',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    const body = z
      .object({
        username: z.string().min(3),
        password: z.string().min(6),
        quotaLimit: z.number().positive().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success || !req.user!.tenantId) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    try {
      const hash = await hashPassword(body.data.password);
      const r = await query(
        `INSERT INTO operators (tenant_id, username, password_hash, role, quota_limit)
         VALUES ($1,$2,$3,'operator',$4) RETURNING id, username, quota_limit`,
        [
          req.user!.tenantId,
          body.data.username,
          hash,
          body.data.quotaLimit ?? null,
        ],
      );
      res.json({ success: true, data: r.rows[0] });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('duplicate key') || message.includes('unique')) {
        res.status(409).json({ success: false, message: '客服账号已存在' });
        return;
      }
      res.status(500).json({ success: false, message: '创建客服账号失败' });
    }
  },
);

app.get(
  '/tenant/operators',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    const r = await query(
      `SELECT id, username, role, quota_limit, quota_used, created_at
       FROM operators WHERE tenant_id = $1 AND role = 'operator'
       ORDER BY created_at DESC`,
      [req.user!.tenantId],
    );
    res.json({ success: true, data: r.rows });
  },
);

app.patch(
  '/tenant/operators/:id/quota',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    const body = z
      .object({
        quotaLimit: z.number().positive().nullable(),
      })
      .safeParse(req.body);
    if (!body.success || !req.user!.tenantId) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    const row = await setOperatorQuota({
      tenantId: req.user!.tenantId,
      operatorId: req.params.id,
      quotaLimit: body.data.quotaLimit,
    });
    if (!row) {
      res.status(404).json({ success: false, message: '找不到该客服账号' });
      return;
    }
    res.json({ success: true, data: row });
  },
);

app.post(
  '/tenant/operators/:id/reset-quota',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    if (!req.user!.tenantId) {
      res.status(400).json({ success: false, message: '未绑定商户' });
      return;
    }
    const row = await resetOperatorQuotaUsed({
      tenantId: req.user!.tenantId,
      operatorId: req.params.id,
    });
    if (!row) {
      res.status(404).json({ success: false, message: '找不到该客服账号' });
      return;
    }
    res.json({ success: true, data: row });
  },
);

app.post(
  '/tenant/change-password',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        success: false,
        message: '新密码至少 6 位',
      });
      return;
    }
    const row = await query<{ password_hash: string }>(
      'SELECT password_hash FROM operators WHERE id = $1',
      [req.user!.id],
    );
    if (!row.rows[0]) {
      res.status(404).json({ success: false, message: '账号不存在' });
      return;
    }
    const ok = await verifyPassword(
      body.data.currentPassword,
      row.rows[0].password_hash,
    );
    if (!ok) {
      res.status(401).json({ success: false, message: '当前密码不正确' });
      return;
    }
    const hash = await hashPassword(body.data.newPassword);
    await query('UPDATE operators SET password_hash = $1 WHERE id = $2', [
      hash,
      req.user!.id,
    ]);
    res.json({ success: true });
  },
);

app.get(
  '/tenant/ledger',
  authRequired,
  requireRole('tenant_admin'),
  async (_req, res) => {
    // 客户端不对账完整 LedgerEntry（内部结算语意）；请用 /tenant/usage
    res.status(404).json({
      success: false,
      message: '请使用点数流水接口',
    });
  },
);

app.get(
  '/tenant/recharges',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    const r = await query(
      `SELECT id, amount_credit, amount_cny, note, created_at
       FROM recharges
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user!.tenantId],
    );
    res.json({ success: true, data: r.rows });
  },
);

app.get(
  '/tenant/usage',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const data = await listTenantUsageForClient(req.user!.tenantId!, {
      operatorId:
        req.user!.role === 'operator' ? req.user!.id : undefined,
    });
    res.json({ success: true, data });
  },
);

app.get(
  '/tenant/knowledge',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const r = await query(
      `SELECT id, title, content, updated_at FROM tenant_knowledge
       WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [req.user!.tenantId],
    );
    res.json({ success: true, data: r.rows });
  },
);

app.post(
  '/tenant/knowledge',
  authRequired,
  requireRole('tenant_admin'),
  async (_req, res) => {
    res.status(410).json({
      success: false,
      message:
        '旧版知识库已停用，请在桌面客户端「设置 → 店铺知识」维护',
    });
  },
);

app.put(
  '/tenant/knowledge/:id',
  authRequired,
  requireRole('tenant_admin'),
  async (_req, res) => {
    res.status(410).json({
      success: false,
      message:
        '旧版知识库已停用，请在桌面客户端「设置 → 店铺知识」维护',
    });
  },
);

app.delete(
  '/tenant/knowledge/:id',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    await query(
      `DELETE FROM tenant_knowledge WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId],
    );
    res.json({ success: true });
  },
);

/** —— Shop（F30–F32）—— */
app.get(
  '/tenant/shops',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const data = await listShops(req.user!.tenantId!);
    res.json({ success: true, data });
  },
);

app.post(
  '/tenant/shops',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    const body = z
      .object({
        displayName: z.string().min(1).max(200),
        channel: z.enum(['pinduoduo', 'qianniu']),
        externalKeys: z.array(z.string()).default([]),
        positioning: z.string().max(5000).optional(),
        logistics: z.string().max(5000).optional(),
        afterSales: z.string().max(5000).optional(),
        forbidden: z.string().max(5000).optional(),
        transferRules: z.string().max(5000).optional(),
      })
      .safeParse(req.body);
    if (!body.success || !req.user!.tenantId) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    const keys = body.data.externalKeys.map((k) => k.trim()).filter(Boolean);
    const r = await query(
      `INSERT INTO shops (
         tenant_id, display_name, channel, external_keys,
         positioning, logistics, after_sales, forbidden, transfer_rules
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
       RETURNING id, tenant_id, display_name, channel, external_keys,
         positioning, logistics, after_sales, forbidden, transfer_rules,
         created_at, updated_at`,
      [
        req.user!.tenantId,
        body.data.displayName,
        body.data.channel,
        JSON.stringify(keys),
        body.data.positioning || '',
        body.data.logistics || '',
        body.data.afterSales || '',
        body.data.forbidden || '',
        body.data.transferRules || '',
      ],
    );
    res.json({ success: true, data: r.rows[0] });
  },
);

app.put(
  '/tenant/shops/:id',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    const body = z
      .object({
        displayName: z.string().min(1).max(200).optional(),
        channel: z.enum(['pinduoduo', 'qianniu']).optional(),
        externalKeys: z.array(z.string()).optional(),
        positioning: z.string().max(5000).optional(),
        logistics: z.string().max(5000).optional(),
        afterSales: z.string().max(5000).optional(),
        forbidden: z.string().max(5000).optional(),
        transferRules: z.string().max(5000).optional(),
      })
      .safeParse(req.body);
    if (!body.success || !req.user!.tenantId) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    const existing = await getShop(req.user!.tenantId, req.params.id);
    if (!existing) {
      res.status(404).json({ success: false, message: '找不到该店铺' });
      return;
    }
    const keys =
      body.data.externalKeys !== undefined
        ? body.data.externalKeys.map((k) => k.trim()).filter(Boolean)
        : existing.external_keys;
    const r = await query(
      `UPDATE shops SET
         display_name = COALESCE($3, display_name),
         channel = COALESCE($4, channel),
         external_keys = $5::jsonb,
         positioning = COALESCE($6, positioning),
         logistics = COALESCE($7, logistics),
         after_sales = COALESCE($8, after_sales),
         forbidden = COALESCE($9, forbidden),
         transfer_rules = COALESCE($10, transfer_rules),
         updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, tenant_id, display_name, channel, external_keys,
         positioning, logistics, after_sales, forbidden, transfer_rules,
         created_at, updated_at`,
      [
        req.params.id,
        req.user!.tenantId,
        body.data.displayName ?? null,
        body.data.channel ?? null,
        JSON.stringify(keys),
        body.data.positioning ?? null,
        body.data.logistics ?? null,
        body.data.afterSales ?? null,
        body.data.forbidden ?? null,
        body.data.transferRules ?? null,
      ],
    );
    res.json({ success: true, data: r.rows[0] });
  },
);

app.delete(
  '/tenant/shops/:id',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    await query(`DELETE FROM shops WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      req.user!.tenantId,
    ]);
    res.json({ success: true });
  },
);

app.get(
  '/tenant/policy',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const r = await query(
      `SELECT logistics, after_sales, forbidden, transfer_rules, updated_at
       FROM tenant_policies WHERE tenant_id = $1`,
      [req.user!.tenantId],
    );
    res.json({
      success: true,
      data: r.rows[0] || {
        logistics: '',
        after_sales: '',
        forbidden: '',
        transfer_rules: '',
      },
    });
  },
);

app.put(
  '/tenant/policy',
  authRequired,
  requireRole('tenant_admin'),
  async (req, res) => {
    const body = z
      .object({
        logistics: z.string().max(5000).optional(),
        afterSales: z.string().max(5000).optional(),
        forbidden: z.string().max(5000).optional(),
        transferRules: z.string().max(5000).optional(),
      })
      .safeParse(req.body);
    if (!body.success || !req.user!.tenantId) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    const r = await query(
      `INSERT INTO tenant_policies (tenant_id, logistics, after_sales, forbidden, transfer_rules)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id) DO UPDATE SET
         logistics = EXCLUDED.logistics,
         after_sales = EXCLUDED.after_sales,
         forbidden = EXCLUDED.forbidden,
         transfer_rules = EXCLUDED.transfer_rules,
         updated_at = now()
       RETURNING logistics, after_sales, forbidden, transfer_rules, updated_at`,
      [
        req.user!.tenantId,
        body.data.logistics || '',
        body.data.afterSales || '',
        body.data.forbidden || '',
        body.data.transferRules || '',
      ],
    );
    res.json({ success: true, data: r.rows[0] });
  },
);

async function handleDesktopConfigPut(
  kind: DesktopConfigKind,
  req: express.Request,
  res: express.Response,
) {
  const tid = req.user!.tenantId;
  if (!tid) {
    res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
    return;
  }
  const body = putBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
    return;
  }
  const parsed = parseDesktopConfigPayload(kind, body.data.payload);
  if (!parsed.ok) {
    res.status(400).json({ success: false, message: parsed.message });
    return;
  }
  const result = await putDesktopConfig(
    tid,
    kind,
    body.data.baseVersion,
    parsed.payload,
  );
  if (!result.ok) {
    res.status(409).json({
      success: false,
      message: '配置已被其他设备更新，请先拉取后再保存',
      code: 'CONFIG_VERSION_CONFLICT',
      data: result.data,
    });
    return;
  }
  res.json({ success: true, data: result.data });
}

app.get(
  '/tenant/desktop-config',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const tid = req.user!.tenantId;
    if (!tid) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    const data = await getAllDesktopConfig(tid);
    res.json({ success: true, data });
  },
);

app.get(
  '/tenant/desktop-config/settings',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const tid = req.user!.tenantId;
    if (!tid) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    res.json({ success: true, data: await getDesktopConfig(tid, 'settings') });
  },
);

app.put(
  '/tenant/desktop-config/settings',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    await handleDesktopConfigPut('settings', req, res);
  },
);

app.get(
  '/tenant/desktop-config/keywords',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const tid = req.user!.tenantId;
    if (!tid) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    res.json({ success: true, data: await getDesktopConfig(tid, 'keywords') });
  },
);

app.put(
  '/tenant/desktop-config/keywords',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    await handleDesktopConfigPut('keywords', req, res);
  },
);

app.get(
  '/tenant/desktop-config/shop-roster',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const tid = req.user!.tenantId;
    if (!tid) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    res.json({ success: true, data: await getDesktopConfig(tid, 'shopRoster') });
  },
);

app.put(
  '/tenant/desktop-config/shop-roster',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    await handleDesktopConfigPut('shopRoster', req, res);
  },
);

app.get(
  '/tenant/shops/:shopId/goods-notes',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const shop = await getShop(req.user!.tenantId!, req.params.shopId);
    if (!shop) {
      res.status(404).json({ success: false, message: '找不到该店铺' });
      return;
    }
    const r = await query(
      `SELECT id, shop_id, goods_id, title_aliases, selling_points, specs_notes, objections, updated_at
       FROM shop_goods_notes WHERE shop_id = $1 ORDER BY updated_at DESC`,
      [req.params.shopId],
    );
    res.json({ success: true, data: r.rows });
  },
);

app.post(
  '/tenant/shops/:shopId/goods-notes',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const shop = await getShop(req.user!.tenantId!, req.params.shopId);
    if (!shop) {
      res.status(404).json({ success: false, message: '找不到该店铺' });
      return;
    }
    const body = z
      .object({
        goodsId: z.string().max(200).optional().nullable(),
        titleAliases: z.array(z.string()).default([]),
        sellingPoints: z.string().max(20000).optional(),
        specsNotes: z.string().max(20000).optional(),
        objections: z.string().max(20000).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    const aliases = body.data.titleAliases.map((a) => a.trim()).filter(Boolean);
    const r = await query(
      `INSERT INTO shop_goods_notes (
         shop_id, tenant_id, goods_id, title_aliases, selling_points, specs_notes, objections
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
       RETURNING id, shop_id, goods_id, title_aliases, selling_points, specs_notes, objections, updated_at`,
      [
        req.params.shopId,
        req.user!.tenantId,
        body.data.goodsId || null,
        JSON.stringify(aliases),
        body.data.sellingPoints || '',
        body.data.specsNotes || '',
        body.data.objections || '',
      ],
    );
    res.json({ success: true, data: r.rows[0] });
  },
);

app.put(
  '/tenant/goods-notes/:id',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    const body = z
      .object({
        goodsId: z.string().max(200).optional().nullable(),
        titleAliases: z.array(z.string()).optional(),
        sellingPoints: z.string().max(20000).optional(),
        specsNotes: z.string().max(20000).optional(),
        objections: z.string().max(20000).optional(),
      })
      .safeParse(req.body);
    if (!body.success || !req.user!.tenantId) {
      res.status(400).json({ success: false, message: '参数有误，请检查填写内容' });
      return;
    }
    const aliases =
      body.data.titleAliases !== undefined
        ? body.data.titleAliases.map((a) => a.trim()).filter(Boolean)
        : null;
    const r = await query(
      `UPDATE shop_goods_notes SET
         goods_id = COALESCE($3, goods_id),
         title_aliases = COALESCE($4::jsonb, title_aliases),
         selling_points = COALESCE($5, selling_points),
         specs_notes = COALESCE($6, specs_notes),
         objections = COALESCE($7, objections),
         updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, shop_id, goods_id, title_aliases, selling_points, specs_notes, objections, updated_at`,
      [
        req.params.id,
        req.user!.tenantId,
        body.data.goodsId === undefined ? null : body.data.goodsId,
        aliases ? JSON.stringify(aliases) : null,
        body.data.sellingPoints ?? null,
        body.data.specsNotes ?? null,
        body.data.objections ?? null,
      ],
    );
    if (!r.rows[0]) {
      res.status(404).json({ success: false, message: '找不到商品說明' });
      return;
    }
    res.json({ success: true, data: r.rows[0] });
  },
);

app.delete(
  '/tenant/goods-notes/:id',
  authRequired,
  requireRole('tenant_admin', 'operator'),
  async (req, res) => {
    await query(
      `DELETE FROM shop_goods_notes WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId],
    );
    res.json({ success: true });
  },
);

/** 桌面客戶端：啟動自動任務前校驗 */
app.get('/session/assert-active', authRequired, async (req, res) => {
  if (req.user!.role === 'platform_admin') {
    res.json({ success: true, data: { ok: true } });
    return;
  }
  if (!req.user!.tenantId) {
    res.status(403).json({ success: false, message: '未绑定商户' });
    return;
  }
  const t = await query<{ status: string }>(
    'SELECT status FROM tenants WHERE id = $1',
    [req.user!.tenantId],
  );
  if (t.rows[0]?.status !== 'active') {
    res.status(403).json({ success: false, message: '商户已停用' });
    return;
  }
  res.json({ success: true, data: { ok: true } });
});

app.post('/v1/chat/completions', authRequired, async (req, res) => {
  const user = req.user!;
  if (!user.tenantId) {
    res.status(403).json({ success: false, message: '运营账号不能调用智能回复，请使用商户账号' });
    return;
  }
  const tenant = await query<{ status: string; discount_rate: string }>(
    'SELECT status, discount_rate FROM tenants WHERE id = $1',
    [user.tenantId],
  );
  if (tenant.rows[0]?.status !== 'active') {
    res.status(403).json({ success: false, message: '商户已停用' });
    return;
  }

  const sku = await query<{
    base_url: string;
    api_key: string;
    model: string;
    platform_prompt: string;
  }>(`SELECT * FROM model_skus WHERE active = true LIMIT 1`);
  if (!sku.rows[0]) {
    res.status(503).json({ success: false, message: '尚未配置智能回复模型，请先在运营后台填写并保存' });
    return;
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const goodsContext =
    typeof req.body?.goodsContext === 'string' ? req.body.goodsContext : '';
  const shopChannel =
    typeof req.body?.shopChannel === 'string' ? req.body.shopChannel : null;
  const shopHints = Array.isArray(req.body?.shopHints)
    ? req.body.shopHints.map((x: unknown) => String(x))
    : [];
  const shopIdHint =
    typeof req.body?.shopId === 'string' ? req.body.shopId : null;
  const goodsId =
    typeof req.body?.goodsId === 'string' ? req.body.goodsId : null;
  const goodsTitle =
    typeof req.body?.goodsTitle === 'string' ? req.body.goodsTitle : null;
  const keywordHints =
    typeof req.body?.keywordHints === 'string' ? req.body.keywordHints : '';

  const lastUserText = [...messages]
    .reverse()
    .find((m: { role?: string }) => m?.role === 'user')?.content;

  const shopBlocks: string[] = [];
  let resolvedShop =
    shopIdHint && user.tenantId
      ? await getShop(user.tenantId, shopIdHint)
      : null;
  if (!resolvedShop && shopHints.length > 0 && user.tenantId) {
    resolvedShop = await resolveShop({
      tenantId: user.tenantId,
      channel: shopChannel,
      hints: shopHints,
    });
  }

  if (resolvedShop) {
    const policy = await mergeShopPolicy(user.tenantId!, resolvedShop);
    const policyBlock = formatPolicyBlock(policy);
    if (policyBlock) shopBlocks.push(policyBlock);

    const allNotes = await listGoodsNotes(resolvedShop.id);
    const catalogBlock = formatGoodsCatalogBlock(allNotes);
    if (catalogBlock) shopBlocks.push(catalogBlock);

    const note = await matchGoodsNote({
      shopId: resolvedShop.id,
      goodsId,
      goodsTitle:
        goodsTitle ||
        (goodsContext.match(/商品=([^|]+)/)?.[1]?.trim() ?? null),
    });
    if (note) {
      const noteBlock = formatGoodsNoteBlock(note);
      if (noteBlock) shopBlocks.push(noteBlock);
    }
  }

  if (keywordHints.trim()) {
    shopBlocks.push(
      [
        '【關鍵詞素材／約束】',
        keywordHints.trim(),
        '請在回覆中自然融入以上要點；不要生硬照抄，也不要編造未出現的承諾。',
      ].join('\n'),
    );
  }

  // 未帶 Shop 線索時保留舊 TenantKnowledge（過渡）；有線索則只用 Shop 模型（對不上也不串舊庫）
  let legacyKnowledge = '';
  if (!shopIdHint && shopHints.length === 0) {
    legacyKnowledge = await selectKnowledgeForPrompt(
      user.tenantId,
      typeof lastUserText === 'string' ? lastUserText : '',
      goodsContext,
    );
  }

  const knowledgeBlock = [...shopBlocks, legacyKnowledge]
    .filter(Boolean)
    .join('\n\n');

  const hardRules = await getPlatformHardRules();
  const tenantVoice = await getTenantVoice(user.tenantId);

  const upstreamMessages = [
    { role: 'system', content: hardRules },
    ...(tenantVoice
      ? [
          {
            role: 'system',
            content: `【商戶補充規則 TenantVoice】\n${tenantVoice}`,
          },
        ]
      : []),
    ...(knowledgeBlock
      ? [{ role: 'system', content: knowledgeBlock }]
      : []),
    ...(goodsContext
      ? [
          {
            role: 'system',
            content: `當前諮詢商品資訊：${goodsContext}`,
          },
        ]
      : []),
    ...messages.filter(
      (m: { role?: string }) => m && m.role !== 'system',
    ),
    { role: 'system', content: HARD_RULES_TAIL_REMINDER },
  ];

  const promptRate = await getPrice('credit_per_1k_prompt_tokens');
  const completionRate = await getPrice('credit_per_1k_completion_tokens');
  const discount = Number(tenant.rows[0].discount_rate);
  const estPrompt = Math.max(
    200,
    JSON.stringify(upstreamMessages).length / 3,
  );
  const reserveAmount = chatReserveAmount({
    promptTokensEst: estPrompt,
    promptRate,
    completionRate,
    discount,
  });

  let reserveId: string;
  try {
    reserveId = await reserveCredits({
      tenantId: user.tenantId,
      operatorId: user.id,
      amount: reserveAmount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INSUFFICIENT_CREDIT') {
      res.status(402).json({ success: false, message: '点数不足，请联系运营方充值' });
      return;
    }
    if (msg === 'QUOTA_EXCEEDED') {
      res.status(402).json({ success: false, message: '该客服账号用量已达上限' });
      return;
    }
    throw e;
  }

  // 桌面超时断开时：释放预扣、不结算，避免「已转人工仍扣点」
  let clientGone = false;
  const upstreamAbort = new AbortController();
  const onClientClose = () => {
    if (!res.writableEnded) {
      clientGone = true;
      upstreamAbort.abort();
    }
  };
  req.on('close', onClientClose);

  const baseUrl = sku.rows[0].base_url.replace(/\/$/, '');
  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sku.rows[0].api_key}`,
      },
      signal: upstreamAbort.signal,
      body: JSON.stringify({
        model: sku.rows[0].model,
        messages: upstreamMessages,
        stream: false,
      }),
    });
    if (clientGone || req.aborted) {
      await releaseReserve({
        reserveId,
        tenantId: user.tenantId,
        operatorId: user.id,
        errorMessage: 'client_disconnected_before_settle',
      });
      return;
    }
    if (!upstream.ok) {
      const text = await upstream.text();
      await releaseReserve({
        reserveId,
        tenantId: user.tenantId,
        operatorId: user.id,
        errorMessage: text.slice(0, 500),
      });
      if (!res.headersSent) {
        res.status(502).json({ success: false, message: '智能回复服务暂时失败，请稍后重试' });
      }
      return;
    }
    const data = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
      };
    };
    if (clientGone || req.aborted) {
      await releaseReserve({
        reserveId,
        tenantId: user.tenantId,
        operatorId: user.id,
        errorMessage: 'client_disconnected_before_settle',
      });
      return;
    }
    const content = data.choices?.[0]?.message?.content ?? '';
    const promptTokens = data.usage?.prompt_tokens ?? Math.ceil(estPrompt);
    const completionTokens =
      data.usage?.completion_tokens ?? Math.ceil(content.length / 3);
    const actual = estimateCredits(
      promptTokens,
      completionTokens,
      promptRate,
      completionRate,
      discount,
    );
    const tier = resolveUpstreamTier(sku.rows[0].model);
    const costUpstream = computeUpstreamCostCny(
      {
        promptTokens,
        completionTokens,
        promptCacheHitTokens: data.usage?.prompt_cache_hit_tokens,
        promptCacheMissTokens: data.usage?.prompt_cache_miss_tokens,
      },
      DEEPSEEK_DEFAULT_RATES[tier],
    );
    let charged: number;
    try {
      charged = await settleReserve({
        reserveId,
        tenantId: user.tenantId,
        operatorId: user.id,
        actualCredit: actual,
        usage: {
          model: sku.rows[0].model,
          promptTokens,
          completionTokens,
          costUpstream,
          success: true,
        },
      });
    } catch (settleErr) {
      const settleMsg =
        settleErr instanceof Error ? settleErr.message : String(settleErr);
      await releaseReserve({
        reserveId,
        tenantId: user.tenantId,
        operatorId: user.id,
        errorMessage: settleMsg,
      });
      throw settleErr;
    }
    if (clientGone || req.aborted || res.headersSent) {
      // 极端竞态：已结算但客户端已走——无法退款，只避免再写响应
      return;
    }
    res.json({
      success: true,
      data: tenantChatSuccessData({
        content,
        creditCharged: charged,
      }),
    });
  } catch (e) {
    const aborted =
      clientGone ||
      req.aborted ||
      (e instanceof Error && e.name === 'AbortError');
    await releaseReserve({
      reserveId,
      tenantId: user.tenantId,
      operatorId: user.id,
      errorMessage: aborted
        ? 'client_disconnected_or_aborted'
        : e instanceof Error
          ? e.message
          : String(e),
    });
    if (!res.headersSent && !aborted) {
      res.status(500).json({ success: false, message: '网关异常，请稍后重试' });
    }
  } finally {
    req.off('close', onClientClose);
  }
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('unhandled', message);
    if (res.headersSent) return;
    if (message === 'QUOTA_EXCEEDED') {
      res.status(402).json({
        success: false,
        message: '该客服账号用量已达上限',
      });
      return;
    }
    if (message === 'INSUFFICIENT_CREDIT') {
      res.status(402).json({
        success: false,
        message: '点数不足，请联系运营方充值',
      });
      return;
    }
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({
        success: false,
        message: '数据冲突（可能账号已存在）',
      });
      return;
    }
    res.status(500).json({ success: false, message: '服务器错误，请稍后重试' });
  },
);

const port = Number(process.env.PORT || 8787);
if (!process.env.JWT_SECRET) {
  console.warn(
    '[警告] 未设置登录密钥（JWT_SECRET），当前使用开发默认值；正式上线前必须改为强密钥',
  );
}

async function boot() {
  try {
    await ensureHardRulesSeeded();
  } catch (e) {
    console.error('HardRules 種子失敗（請先 npm run migrate）', e);
  }
  try {
    const n = await releaseExpiredReserves();
    if (n > 0) console.log(`已釋放 ${n} 筆超時 Reserve`);
  } catch (e) {
    console.error('啟動清理 Reserve 失敗', e);
  }
  setInterval(() => {
    releaseExpiredReserves().catch((e) =>
      console.error('定時清理 Reserve 失敗', e),
    );
  }, 60_000).unref();

  app.listen(port, () => {
    console.log(`billing-gateway on http://127.0.0.1:${port}`);
    console.log(`admin UI on http://127.0.0.1:${port}/admin/`);
  });
}

boot();
