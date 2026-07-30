# 智能客服系統

B2B 電商智能客服：Windows 桌面自動回覆 + 運營方 Credit 閘道差價變現。

## 倉庫結構

| 路徑 | 說明 |
|------|------|
| [`CONTEXT.md`](CONTEXT.md) | 領域詞彙 |
| [`docs/adr/`](docs/adr/) | 架構決策 |
| [`apps/desktop`](apps/desktop) | Fork 自 ChatGPT-On-CS |
| [`apps/gateway`](apps/gateway) | Node + PostgreSQL 計費閘道與 PlatformAdmin Web |

**需你手動完成的步驟**：見 [`docs/USER_CHECKLIST.md`](docs/USER_CHECKLIST.md)

## 硬門檻：平台收發驗證

Strategy 二進位**不在 git**（`assets/backend/*` 被忽略），在上游 Release 安裝包內。

1. 下載並安裝：[ChatGPT-On-CS v1.4.5](https://github.com/cs-lazy-tools/ChatGPT-On-CS/releases/download/v1.4.5/1.4.5.exe)
2. 在 Windows 上分別驗證 **拼多多**、**千牛（淘寶）** 能讀消息並自動回覆（可用關鍵詞測試，不必先接閘道）
3. 若此步失敗：**停止上線售賣**，先解決 RPA／帳號環境問題

開發本倉庫桌面端時，需自行從安裝目錄拷貝 `backend/__main__.exe` 到 `apps/desktop/backend/__main__.exe`（或依 `.env` 的 `BKEXE_PATH`）。

## 啟動計費閘道（本機 Docker）

需先安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（本機若尚未安裝，請先裝好再開 Postgres）。

```bash
cd apps/gateway
docker compose up -d
npm install
npm run seed          # 預設 PlatformAdmin: admin / admin123
npm run dev           # http://127.0.0.1:8787
```

- 運營後台：http://127.0.0.1:8787/admin/
- 流程：登入超管 → 配置 ModelSKU（OpenAI 兼容 baseUrl/key/model）→ 開通 Tenant → 人工充值 Credit → 客戶端用 TenantAdmin／Operator 登入閘道

## 桌面端改造要點

- AI **禁止 BYOK**，改打閘道 `/v1/chat/completions`
- 設定頁「帳戶」改為閘道帳號密碼登入
- 第一版關閉自訂 Plugin
- Credit／Quota 不足時 AI 跳過，回落關鍵詞／預設回覆
- 可帶當前商品 Context（RPA 提供時）

```bash
cd apps/desktop
pnpm install
pnpm start
```

## 授權風險

桌面端基於 AGPL-3.0 Fork，閉源商用風險見 [`docs/adr/0002-agpl-fork-closed-distribution.md`](docs/adr/0002-agpl-fork-closed-distribution.md)。閘道與 Admin 為自有代碼，請獨立部署。
