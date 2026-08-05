import pg from 'pg';

const { Pool } = pg;

const rawConnectionString =
  process.env.DATABASE_URL ||
  'postgres://cs:cs_dev_password@127.0.0.1:5432/cs_billing';

/** Supabase／雲端 Postgres 常需 SSL；Node 校驗鏈常失敗，由 Pool 顯式放寬 */
const needsSsl =
  /supabase\.co|supabase\.com/i.test(rawConnectionString) &&
  !/127\.0\.0\.1|localhost/i.test(rawConnectionString);

/** 去掉 URL 內 sslmode，避免與 Pool.ssl 衝突仍走校驗 */
const connectionString = needsSsl
  ? rawConnectionString
      .replace(/[?&]sslmode=[^&]*/gi, '')
      .replace(/[?&]uselibpqcompat=[^&]*/gi, '')
      .replace(/\?&/, '?')
      .replace(/[?&]$/, '')
  : rawConnectionString;

export const pool = new Pool({
  connectionString,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}
