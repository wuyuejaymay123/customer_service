import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { ensureHardRulesSeeded } from './promptLayers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
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

  await ensureHardRulesSeeded();
  console.log('migrate: platform hard rules seeded if empty');

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
