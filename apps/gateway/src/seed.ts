import { hashPassword } from './auth.js';
import { query } from './db.js';

async function ensurePlatformAdmin() {
  const username = process.env.SEED_ADMIN_USER || 'admin';
  const password = process.env.SEED_ADMIN_PASS || 'admin123';
  const existing = await query(
    `SELECT id FROM operators WHERE username = $1`,
    [username],
  );
  if (existing.rows[0]) {
    console.log('运营管理员已存在:', username);
    return;
  }
  const hash = await hashPassword(password);
  await query(
    `INSERT INTO operators (tenant_id, username, password_hash, role)
     VALUES (NULL, $1, $2, 'platform_admin')`,
    [username, hash],
  );
  console.log('已创建运营管理员');
  console.log('  账号:', username);
  console.log('  密码:', password);
  console.log('请尽快修改密码。');
}

async function main() {
  await ensurePlatformAdmin();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
