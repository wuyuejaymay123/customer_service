import pg from 'pg';

const apiKey = process.argv[2];
if (!apiKey) {
  console.error('missing api key');
  process.exit(1);
}

const c = new pg.Client({
  connectionString: 'postgres://cs:cs_dev_password@127.0.0.1:5432/cs_billing',
});
await c.connect();

await c.query(
  `UPDATE model_skus
   SET api_key = $1,
       base_url = 'https://api.deepseek.com/v1',
       model = 'deepseek-chat',
       active = true
   WHERE active = true`,
  [apiKey],
);

const { rows } = await c.query(
  `SELECT name, base_url, model, right(api_key, 4) AS tail, active
   FROM model_skus WHERE active = true LIMIT 1`,
);
console.log('updated', rows[0]);

const sku = (
  await c.query(
    `SELECT base_url, model, api_key FROM model_skus WHERE active = true LIMIT 1`,
  )
).rows[0];

const url = `${sku.base_url.replace(/\/$/, '')}/chat/completions`;
const r = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sku.api_key}`,
  },
  body: JSON.stringify({
    model: sku.model,
    messages: [{ role: 'user', content: '用五个字回复：测试成功' }],
    stream: false,
  }),
});
const text = await r.text();
console.log('upstream_status', r.status);
console.log('upstream_body', text.slice(0, 400));

if (r.ok) {
  console.log('upstream ok；网关对话测试请用运营后台开通的商户账号，不再使用演示商户');
}

await c.end();
