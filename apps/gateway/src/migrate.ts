import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { ensureHardRulesSeeded } from './promptLayers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const hasTenants = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'tenants'
     ) AS exists`,
  );
  if (!hasTenants.rows[0]?.exists) {
    const baseSql = fs.readFileSync(
      path.join(__dirname, 'schema.sql'),
      'utf8',
    );
    await pool.query(baseSql);
    console.log('migrate: schema.sql applied (fresh database)');
  }

  const shopsSql = fs.readFileSync(
    path.join(__dirname, 'schema-shops.sql'),
    'utf8',
  );
  await pool.query(shopsSql);
  console.log('migrate: schema-shops.sql applied');

  const promptSql = fs.readFileSync(
    path.join(__dirname, 'schema-prompt-layers.sql'),
    'utf8',
  );
  await pool.query(promptSql);
  console.log('migrate: schema-prompt-layers.sql applied');

  const desktopConfigSql = fs.readFileSync(
    path.join(__dirname, 'schema-desktop-config.sql'),
    'utf8',
  );
  await pool.query(desktopConfigSql);
  console.log('migrate: schema-desktop-config.sql applied');

  await ensureHardRulesSeeded();
  console.log('migrate: platform hard rules seeded if empty');

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
