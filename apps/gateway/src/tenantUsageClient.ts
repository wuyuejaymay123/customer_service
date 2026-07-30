import { query } from './db.js';

/** 客戶端對賬可見的 UsageRecord 欄位（不暴露模型／token／成本） */
export type TenantUsageClientRow = {
  id: string;
  credit_charged: string;
  created_at: Date | string;
};

/**
 * Tenant／Operator 客戶端點數流水：僅成功且實際扣 Credit > 0 的 UsageRecord。
 */
export async function listTenantUsageForClient(
  tenantId: string,
  opts?: { operatorId?: string },
): Promise<TenantUsageClientRow[]> {
  const params: string[] = [tenantId];
  let sql = `SELECT id, credit_charged, created_at
     FROM usage_records
     WHERE tenant_id = $1 AND success = true AND credit_charged > 0`;
  if (opts?.operatorId) {
    sql += ' AND operator_id = $2';
    params.push(opts.operatorId);
  }
  sql += ' ORDER BY created_at DESC LIMIT 100';
  const r = await query<TenantUsageClientRow>(sql, params);
  return r.rows;
}
