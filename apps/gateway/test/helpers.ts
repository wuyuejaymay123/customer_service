import { hashPassword } from '../src/auth.js';
import { query } from '../src/db.js';

export async function createTestTenant(prefix = 'tdd') {
  const stamp = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const name = `${prefix}_${stamp}`;
  const username = `${prefix}_op_${stamp}`;
  const password = 'testpass1';
  const hash = await hashPassword(password);
  const t = await query<{ id: string }>(
    `INSERT INTO tenants (name) VALUES ($1) RETURNING id`,
    [name],
  );
  const tenantId = t.rows[0].id;
  await query(`INSERT INTO wallets (tenant_id, balance) VALUES ($1, $2)`, [
    tenantId,
    1000,
  ]);
  await query(`INSERT INTO low_balance_thresholds (tenant_id) VALUES ($1)`, [
    tenantId,
  ]);
  const o = await query<{ id: string }>(
    `INSERT INTO operators (tenant_id, username, password_hash, role)
     VALUES ($1,$2,$3,'operator') RETURNING id`,
    [tenantId, username, hash],
  );
  return {
    tenantId,
    operatorId: o.rows[0].id,
    username,
    password,
    name,
  };
}

/** 删除测试商户及其关联数据，避免污染运营后台列表 */
export async function deleteTestTenant(tenantId: string) {
  await query('DELETE FROM usage_records WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM ledger_entries WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM recharges WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM reserves WHERE tenant_id = $1', [tenantId]);
  await query(
    `DELETE FROM shop_goods_notes WHERE shop_id IN
     (SELECT id FROM shops WHERE tenant_id = $1)`,
    [tenantId],
  );
  await query('DELETE FROM shops WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM tenant_policies WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM tenant_knowledge WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM operators WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM low_balance_thresholds WHERE tenant_id = $1', [
    tenantId,
  ]);
  await query('DELETE FROM wallets WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM tenants WHERE id = $1', [tenantId]);
}

/** 清掉历史测试残留（settle_/shortfall_/expire_/tdd_ 前缀） */
export async function purgeTestTenants() {
  const r = await query<{ id: string; name: string }>(
    `SELECT id, name FROM tenants
     WHERE name ~ '^(settle|shortfall|expire|tdd)_'`,
  );
  for (const row of r.rows) {
    await deleteTestTenant(row.id);
  }
  return r.rows.length;
}

export async function walletSnapshot(tenantId: string) {
  const r = await query<{ balance: string; reserved: string }>(
    `SELECT balance, reserved FROM wallets WHERE tenant_id = $1`,
    [tenantId],
  );
  return {
    balance: Number(r.rows[0].balance),
    reserved: Number(r.rows[0].reserved),
    available: Number(r.rows[0].balance) - Number(r.rows[0].reserved),
  };
}
