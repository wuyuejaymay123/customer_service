/**
 * 本機 mock 懶人客服 VIP API，解決官方版因連不上 chat.lazaytools.top 導致應用列表空白。
 * 需搭配 hosts：127.0.0.1 chat.lazaytools.top
 */
const http = require('http');

const PORT = 443; // HTTPS 較難 mock；改用 80 + hosts 指向後官方若走 https 仍會失敗
// 官方用 https://chat.lazaytools.top — 無憑證時 Node https 無法簡單用 443。
// 改為在 8788 提供 HTTP mock，並用環境說明；同時寫一個可被 hosts+代理使用的回應。

const HTTP_PORT = 8788;

const vipInfo = {
  code: 200,
  data: {
    vipPlans: { enable: false },
  },
  message: 'ok',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = req.url || '';
  console.log(req.method, url);
  if (url.includes('/api/common/system/vipInfo')) {
    res.end(JSON.stringify(vipInfo));
    return;
  }
  if (url.includes('/api/user/account/tokenLogin')) {
    res.end(
      JSON.stringify({
        code: 200,
        data: {
          membership: {
            vipLevel: 'Pro',
            expirationDate: '2099-12-31T00:00:00Z',
          },
        },
        message: 'ok',
      }),
    );
    return;
  }
  res.end(JSON.stringify({ code: 200, data: {}, message: 'mock ok' }));
});

server.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`VIP mock on http://127.0.0.1:${HTTP_PORT}`);
  console.log(
    '官方版走 https://chat.lazaytools.top，需可連外網或另配系統代理。',
  );
  console.log('本 Fork 已改靜態平台列表，不依賴此服務。');
});
