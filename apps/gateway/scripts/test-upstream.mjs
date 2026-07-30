import pg from 'pg';

const c = new pg.Client({
  connectionString: 'postgres://cs:cs_dev_password@127.0.0.1:5432/cs_billing',
});
await c.connect();
const { rows } = await c.query(
  'SELECT base_url, model, api_key, length(api_key) as len FROM model_skus WHERE active=true LIMIT 1',
);
const sku = rows[0];
console.log(
  'base',
  sku.base_url,
  'model',
  sku.model,
  'keyLen',
  sku.len,
  'keyTail',
  sku.api_key.slice(-4),
);
const base = sku.base_url.replace(/\/$/, '');
const url = `${base}/chat/completions`;
console.log('url', url);
try {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sku.api_key}`,
    },
    body: JSON.stringify({
      model: sku.model,
      messages: [{ role: 'user', content: '你好' }],
      stream: false,
    }),
  });
  const text = await r.text();
  console.log('status', r.status);
  console.log('body', text.slice(0, 800));
} catch (e) {
  console.log('fetch_error', e instanceof Error ? e.message : String(e));
}
await c.end();
