# 闸道生产部署基线（F17）

面向正式环境的最短清单。开发机可继续用默认值，**对外售卖前必须按本页配置**。

## 1. 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | 例：`postgres://USER:PASS@HOST:5432/cs_billing` |
| `JWT_SECRET` | **是（生产）** | 强随机字符串（≥32 字节）。未设置时进程会警告并使用开发默认密钥，**不可上线** |
| `PORT` | 否 | 默认 `8787` |
| `SEED_ADMIN_USER` / `SEED_ADMIN_PASS` | 否 | 仅首次 `npm run seed` 时创建运营管理员 |

生成密钥示例（PowerShell）：

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

## 2. 数据库

```powershell
cd apps/gateway
docker compose up -d          # 或自建 Postgres 16+
npm run migrate
npm run seed                  # 仅创建运营管理员；不再自动建演示商户
```

## 3. 进程与反向代理

```powershell
$env:JWT_SECRET = "你的强密钥"
$env:DATABASE_URL = "postgres://..."
npm run start                 # 生产用 start；开发可用 npm run dev
```

建议前挂 Nginx／Caddy：

- 对外 **HTTPS**（证书）
- 反代到 `127.0.0.1:8787`
- 运营后台路径：`/admin/`
- 健康检查：`GET /health` → 200

## 4. 上线后必做

1. 用强密码登录运营后台，**立刻修改** seed 的 `admin` 密码（当前可通过「重置商户管理员密码」同类流程自行在库中改，或后续用改密接口）
2. 配置并启用「智能回复模型」（含真实 API Key）
3. 开通真实商户并充值，**不要**依赖演示账号
4. 定期备份 Postgres 卷／库

## 5. 安全注意

- 本机桌面端登录后只缓存 JWT，**不再落盘明文密码**
- 勿把含 `JWT_SECRET`／API Key 的 `.env` 提交到 git
- 运营后台仅内网或 VPN 可达更佳
