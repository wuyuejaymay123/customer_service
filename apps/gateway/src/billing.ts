import { pool, query } from './db.js';

export async function getPrice(key: string): Promise<number> {
  const r = await query<{ value: string }>(
    'SELECT value FROM price_book WHERE key = $1',
    [key],
  );
  if (!r.rows[0]) throw new Error(`缺少價目: ${key}`);
  return Number(r.rows[0].value);
}

export function estimateCredits(
  promptTokens: number,
  completionTokens: number,
  promptRate: number,
  completionRate: number,
  discount: number,
) {
  const raw =
    (promptTokens / 1000) * promptRate +
    (completionTokens / 1000) * completionRate;
  return Math.max(0.01, Number((raw * discount).toFixed(4)));
}

/** 可用餘額 = balance - reserved */
export async function reserveCredits(opts: {
  tenantId: string;
  operatorId: string;
  amount: number;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const op = await client.query<{
      quota_limit: string | null;
      quota_used: string;
    }>(
      'SELECT quota_limit, quota_used FROM operators WHERE id = $1 FOR UPDATE',
      [opts.operatorId],
    );
    const quotaLimit = op.rows[0]?.quota_limit;
    const quotaUsed = Number(op.rows[0]?.quota_used ?? 0);
    if (quotaLimit != null && quotaUsed + opts.amount > Number(quotaLimit)) {
      throw new Error('QUOTA_EXCEEDED');
    }

    const w = await client.query<{ balance: string; reserved: string }>(
      'SELECT balance, reserved FROM wallets WHERE tenant_id = $1 FOR UPDATE',
      [opts.tenantId],
    );
    if (!w.rows[0]) throw new Error('WALLET_MISSING');
    const balance = Number(w.rows[0].balance);
    const reserved = Number(w.rows[0].reserved);
    const available = balance - reserved;
    if (available < opts.amount) throw new Error('INSUFFICIENT_CREDIT');

    // 凍結時即佔用 Quota，避免並行 Reserve 突破硬停
    await client.query(
      'UPDATE operators SET quota_used = quota_used + $1 WHERE id = $2',
      [opts.amount, opts.operatorId],
    );
    await client.query(
      'UPDATE wallets SET reserved = reserved + $1, updated_at = now() WHERE tenant_id = $2',
      [opts.amount, opts.tenantId],
    );
    const ins = await client.query<{ id: string }>(
      `INSERT INTO reserves (tenant_id, operator_id, amount, status)
       VALUES ($1, $2, $3, 'held') RETURNING id`,
      [opts.tenantId, opts.operatorId, opts.amount],
    );
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, operator_id, kind, amount, ref_id, note)
       VALUES ($1, $2, 'reserve', $3, $4, '預凍結')`,
      [opts.tenantId, opts.operatorId, opts.amount, ins.rows[0].id],
    );
    await client.query('COMMIT');
    return ins.rows[0].id;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function settleReserve(opts: {
  reserveId: string;
  tenantId: string;
  operatorId: string;
  actualCredit: number;
  usage: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUpstream?: number | null;
    success: boolean;
    errorMessage?: string;
  };
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<{ amount: string; status: string }>(
      'SELECT amount, status FROM reserves WHERE id = $1 FOR UPDATE',
      [opts.reserveId],
    );
    if (!r.rows[0] || r.rows[0].status !== 'held') {
      throw new Error('RESERVE_INVALID');
    }
    const held = Number(r.rows[0].amount);
    const w = await client.query<{ balance: string; reserved: string }>(
      'SELECT balance, reserved FROM wallets WHERE tenant_id = $1 FOR UPDATE',
      [opts.tenantId],
    );
    if (!w.rows[0]) throw new Error('WALLET_MISSING');
    const balance = Number(w.rows[0].balance);
    const reserved = Number(w.rows[0].reserved);
    // 釋放本筆凍結後的可用額。若實際用量超過錢包，仍盡量扣光可用額（禁止上游成功後整筆免單）
    const availableAfterRelease = balance - reserved + held;
    const actual = Math.max(0, opts.actualCredit);
    const charge = Math.min(actual, Math.max(0, availableAfterRelease));

    await client.query(
      `UPDATE wallets
       SET reserved = reserved - $1,
           balance = balance - $2,
           updated_at = now()
       WHERE tenant_id = $3`,
      [held, charge, opts.tenantId],
    );
    await client.query(
      `UPDATE reserves SET status = 'settled', finalized_at = now() WHERE id = $1`,
      [opts.reserveId],
    );
    const bal = await client.query<{ balance: string }>(
      'SELECT balance FROM wallets WHERE tenant_id = $1',
      [opts.tenantId],
    );
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, operator_id, kind, amount, balance_after, ref_id, note)
       VALUES ($1, $2, 'settle', $3, $4, $5, '結算扣費')`,
      [
        opts.tenantId,
        opts.operatorId,
        charge,
        bal.rows[0].balance,
        opts.reserveId,
      ],
    );
    if (held > charge) {
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, operator_id, kind, amount, ref_id, note)
         VALUES ($1, $2, 'release', $3, $4, '凍結多餘釋放')`,
        [opts.tenantId, opts.operatorId, held - charge, opts.reserveId],
      );
    }
    // Reserve 時已佔用 held；此處只調整到實際 charge
    await client.query(
      `UPDATE operators SET quota_used = GREATEST(0, quota_used + $1) WHERE id = $2`,
      [charge - held, opts.operatorId],
    );
    await client.query(
      `INSERT INTO usage_records (
         tenant_id, operator_id, reserve_id, model,
         prompt_tokens, completion_tokens, cost_upstream,
         credit_charged, success, error_message
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        opts.tenantId,
        opts.operatorId,
        opts.reserveId,
        opts.usage.model,
        opts.usage.promptTokens,
        opts.usage.completionTokens,
        opts.usage.costUpstream ?? null,
        charge,
        opts.usage.success,
        opts.usage.errorMessage ?? null,
      ],
    );
    await client.query('COMMIT');
    return charge;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function releaseReserve(opts: {
  reserveId: string;
  tenantId: string;
  operatorId: string;
  errorMessage?: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<{ amount: string; status: string }>(
      'SELECT amount, status FROM reserves WHERE id = $1 FOR UPDATE',
      [opts.reserveId],
    );
    if (!r.rows[0] || r.rows[0].status !== 'held') {
      await client.query('COMMIT');
      return;
    }
    const held = Number(r.rows[0].amount);
    await client.query(
      `UPDATE wallets SET reserved = reserved - $1, updated_at = now() WHERE tenant_id = $2`,
      [held, opts.tenantId],
    );
    await client.query(
      `UPDATE reserves SET status = 'released', finalized_at = now() WHERE id = $1`,
      [opts.reserveId],
    );
    await client.query(
      `UPDATE operators SET quota_used = GREATEST(0, quota_used - $1) WHERE id = $2`,
      [held, opts.operatorId],
    );
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, operator_id, kind, amount, ref_id, note)
       VALUES ($1, $2, 'release', $3, $4, '失敗釋放')`,
      [opts.tenantId, opts.operatorId, held, opts.reserveId],
    );
    await client.query(
      `INSERT INTO usage_records (
         tenant_id, operator_id, reserve_id, success, error_message, credit_charged
       ) VALUES ($1,$2,$3,false,$4,0)`,
      [opts.tenantId, opts.operatorId, opts.reserveId, opts.errorMessage ?? null],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** 釋放超時仍 held 的 Reserve，避免行程崩潰後永久佔用 reserved */
export async function releaseExpiredReserves(
  maxAgeMs = Number(process.env.RESERVE_TTL_MS || 15 * 60 * 1000),
): Promise<number> {
  const r = await query<{
    id: string;
    tenant_id: string;
    operator_id: string;
  }>(
    `SELECT id, tenant_id, operator_id FROM reserves
     WHERE status = 'held'
       AND created_at < now() - ($1::double precision * interval '1 millisecond')`,
    [maxAgeMs],
  );
  let n = 0;
  for (const row of r.rows) {
    await releaseReserve({
      reserveId: row.id,
      tenantId: row.tenant_id,
      operatorId: row.operator_id,
      errorMessage: 'Reserve 超時自動釋放',
    });
    n += 1;
  }
  return n;
}

export async function resolveOperatorFk(
  operatorId?: string | null,
): Promise<string | null> {
  if (!operatorId) return null;
  const r = await query<{ id: string }>(
    'SELECT id FROM operators WHERE id = $1',
    [operatorId],
  );
  return r.rows[0]?.id ?? null;
}

export async function recharge(opts: {
  tenantId: string;
  amountCredit: number;
  amountCny?: number;
  note?: string;
  createdBy?: string;
}) {
  const createdBy = await resolveOperatorFk(opts.createdBy);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE wallets SET balance = balance + $1, updated_at = now() WHERE tenant_id = $2`,
      [opts.amountCredit, opts.tenantId],
    );
    const rec = await client.query<{ id: string }>(
      `INSERT INTO recharges (tenant_id, amount_credit, amount_cny, note, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [
        opts.tenantId,
        opts.amountCredit,
        opts.amountCny ?? null,
        opts.note ?? null,
        createdBy,
      ],
    );
    const bal = await client.query<{ balance: string }>(
      'SELECT balance FROM wallets WHERE tenant_id = $1',
      [opts.tenantId],
    );
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, operator_id, kind, amount, balance_after, ref_id, note)
       VALUES ($1,$2,'recharge',$3,$4,$5,$6)`,
      [
        opts.tenantId,
        createdBy,
        opts.amountCredit,
        bal.rows[0].balance,
        rec.rows[0].id,
        opts.note ?? '人工充值',
      ],
    );
    await client.query('COMMIT');
    return rec.rows[0].id;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** PlatformAdmin 調帳／補償；amount 可為負（扣減） */
export async function adjustCredits(opts: {
  tenantId: string;
  amountCredit: number;
  note: string;
  createdBy?: string;
}) {
  if (!Number.isFinite(opts.amountCredit) || opts.amountCredit === 0) {
    throw new Error('ADJUSTMENT_INVALID');
  }
  const createdBy = await resolveOperatorFk(opts.createdBy);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query<{ balance: string; reserved: string }>(
      'SELECT balance, reserved FROM wallets WHERE tenant_id = $1 FOR UPDATE',
      [opts.tenantId],
    );
    if (!w.rows[0]) throw new Error('WALLET_MISSING');
    const next = Number(w.rows[0].balance) + opts.amountCredit;
    if (next < Number(w.rows[0].reserved)) {
      throw new Error('ADJUSTMENT_BELOW_RESERVED');
    }
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = now() WHERE tenant_id = $2`,
      [next, opts.tenantId],
    );
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, operator_id, kind, amount, balance_after, note)
       VALUES ($1,$2,'adjustment',$3,$4,$5)`,
      [
        opts.tenantId,
        createdBy,
        opts.amountCredit,
        next,
        opts.note || '调账',
      ],
    );
    await client.query('COMMIT');
    return { balance: next };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function setOperatorQuota(opts: {
  tenantId: string;
  operatorId: string;
  quotaLimit: number | null;
}) {
  const r = await query(
    `UPDATE operators SET quota_limit = $1
     WHERE id = $2 AND tenant_id = $3 AND role = 'operator'
     RETURNING id, username, quota_limit, quota_used`,
    [opts.quotaLimit, opts.operatorId, opts.tenantId],
  );
  return r.rows[0] ?? null;
}

export async function resetOperatorQuotaUsed(opts: {
  tenantId: string;
  operatorId: string;
}) {
  const r = await query(
    `UPDATE operators SET quota_used = 0
     WHERE id = $1 AND tenant_id = $2 AND role = 'operator'
     RETURNING id, username, quota_limit, quota_used`,
    [opts.operatorId, opts.tenantId],
  );
  return r.rows[0] ?? null;
}

export async function listPriceBook() {
  const r = await query<{ key: string; value: string; note: string | null }>(
    `SELECT key, value, note FROM price_book ORDER BY key`,
  );
  return r.rows.map((row) => ({
    key: row.key,
    value: Number(row.value),
    note: row.note,
  }));
}

export async function upsertPriceBook(opts: {
  key: string;
  value: number;
  note?: string;
}) {
  await query(
    `INSERT INTO price_book (key, value, note)
     VALUES ($1,$2,$3)
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       note = COALESCE(EXCLUDED.note, price_book.note),
       updated_at = now()`,
    [opts.key, opts.value, opts.note ?? null],
  );
}

export async function setTenantDiscount(opts: {
  tenantId: string;
  discountRate: number;
}) {
  const r = await query(
    `UPDATE tenants SET discount_rate = $1 WHERE id = $2
     RETURNING id, name, discount_rate`,
    [opts.discountRate, opts.tenantId],
  );
  return r.rows[0] ?? null;
}
