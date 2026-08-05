# Supabase 托管閘道庫 + 桌面配置雲同步

在保留「對話全文與瀏覽器登入態不上雲」的前提下，將閘道 Postgres 遷至 Supabase，並讓關鍵詞／回覆策略／店名冊隨 Tenant 帳號同步，解決換機配置丟失；桌面只經閘道 API 讀寫，不直連數據庫。

**Status:** accepted

## Considered Options

- **雲範圍**：整包閘道庫上 Supabase；另建 Tenant 級桌面配置包（策略／關鍵詞整包／店名冊）。**不上雲**：Session／Message 全文、Playwright Cookie／localStorage、Instance 連線／Halt 運行時狀態。
- **帳號維度**：配置只掛 **Tenant**；產品已去掉客服子帳號維度，不做每 Operator 一份配置。
- **衝突**：配置帶 **ConfigVersion**；保存須帶版本，舊版不可覆蓋新版（409 後先拉再改）。離線時配置只讀、禁止編輯。
- **同步時機**：登入成功拉取；每次保存立即上傳。不做定時對刷。
- **店名冊 vs 掃碼**：雲端 **ShopRoster** 僅名冊；渠道真身分以掃碼為準（對得上則綁定，對不上則改綁或當新店；禁止用錯店知識回覆）。
- **通路**：桌面 → 既有 LLM Gateway／業務 API → Supabase。拒絕桌面直連 Supabase／RLS 雙軌登入（計費與權限已在閘道）。
- **關鍵詞存儲**：Tenant 下一份 JSON bundle（後寫整包替換＋版本），暫不拆成關鍵詞行表。
- **本機角色**：SQLite 為緩存；雲端為可同步配置的真相源。Session／Message 仍僅本機（延續 ADR-0001 隱私邊界；本 ADR 僅修正「Keyword／策略不可雲同步」之舊假設）。

## Consequences

- ADR-0001「對話主數據不上雲」仍成立；Keyword／桌面策略改為可雲同步，CONTEXT 詞彙需同步更新。
- 需新增閘道表與 GET／PUT（帶 version）接口；桌面登入與保存路徑要接同步，離線禁用配置編輯。
- 驗收：換機登同一 Tenant → 關鍵詞與策略在；店名冊在但須重掃碼；掃碼他店不串知識；雙機衝突不靜默覆蓋。

## Draft artifacts

- DDL：`apps/gateway/src/schema-desktop-config.sql`（已接入 `migrate.ts`；新庫亦見 `schema.sql`）
- API／payload 契約：`docs/desktop-config-sync-contract.md`
