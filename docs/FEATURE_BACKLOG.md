# 功能待補清單（FEATURE_BACKLOG）

> 對照 `CONTEXT.md` 產品意圖：B2B 電商智能客服；AI 經運營方閘道扣 Credit；渠道僅擔保拼多多＋千牛。  
> 狀態：`todo` 未做｜`partial` 部分有｜`done` 已完成｜`wont` 本版不做  
> 本檔會在 grilling 過程中隨決策更新。

**最後更新：** 2026-07-29  
**Grill 状态：** 收費／DeepSeek 對齊已收束（ADR 0006）；F26 已完成；F02 仍须人工冒烟

---

## 已具備（對照，不重做）

| ID | 能力 | 狀態 |
|----|------|------|
| D01 | 閘道 Auth（PlatformAdmin／TenantAdmin／Operator）+ JWT | done |
| D02 | Wallet／Reserve／Settle／Recharge／Quota 硬停 | done |
| D03 | PlatformAdmin：開戶、充值、停用、ModelSKU、Usage | done |
| D04 | PlatformPrompt + TenantKnowledge 注入回覆 | done |
| D05 | 桌面閘道登入、餘額展示、禁止 BYOK | done |
| D06 | 回覆管線：Keyword → 閘道 AI → 預設回覆 | done |
| D07 | 拼多多一實例一店（Playwright） | done |
| D08 | 千牛一實例＋客戶端多店鋪模式聯動 | done |
| D09 | 原開源品牌／外鏈已從可見 UI 清除 | done |

---

## P0 — 阻擋對外交付

| ID | 能力 | 狀態 | 驗收要點 | 預估 |
|----|------|------|----------|------|
| F01 | StrategyBackend（`__main__.exe`）納入安裝／開發資產 | done | 本機 `assets/backend/__main__.exe` 已就位（約 62MB）；git 仍不納入二進位 | L |
| F02 | 拼多多＋千牛真實收發冒煙（可手動腳本／清單） | partial | 清單見 `docs/SMOKE_F02.md`；真實收發需人工＋二進位 | L |
| F03 | 客户端更新通道（自有发版源或明确「联系运营方」） | done | docs/RELEASE.md；关于页引导 | M |
| F37 | **ReplyFailure／FailureHandoff／HandoffAlert**（防超时接管） | done | 超时/硬失败→安抚+转接+待接管队列；会话冷却；规则转人工同队列；见 ADR 0005 | M |

---

## P1 — 營運／商業必備

| ID | 能力 | 狀態 | 驗收要點 | 預估 |
|----|------|------|----------|------|
| F10 | **Adjustment**（PlatformAdmin 调账／补偿） | done | 运营后台「调账」 | S |
| F11 | **PriceBook**／Tenant 折扣事后可改 | done | 价目表＋「改折扣」 | M |
| F12 | Tenant 查看 **UsageRecord**（成功扣點）／Recharge | done | 桌面「点数流水」仅时间＋用量；不暴露模型；Ledger 不对客户展示 | S |
| F13 | Operator **Quota** 可改上限／可重置 used | done | 桌面改上限／重置已用 | S |
| F14 | 账密生命周期（改密／重置） | done | 运营重置＋桌面自助改密 | M |
| F15 | 舊 TenantKnowledge 凍結（只讀／匯出）；新知識走 F30+ | done | POST/PUT 回 410；GET／DELETE 保留 | S |
| F30 | **Shop** 主檔＋渠道綁定（拼多多 Instance↔Shop；千牛店標識） | done | 主檔＋API＋桌面綁定 UI | M |
| F31 | **ShopProfile**＋**TenantPolicy**（共用＋覆寫） | done | schema＋API＋tenant.html | M |
| F32 | **ShopGoodsNote**＋**GoodsMatchKey**（ID→別名） | done | schema＋API＋匹配＋tenant.html | M |
| F33 | 閘道注入改為：識別 Shop → 合併政策 → 匹配商品 Note | done | chat/completions 已接 shopId／hints／goods | M |
| F34 | 閘道 Admin：Shop／TenantPolicy／ShopProfile／ShopGoodsNote CRUD | done | `/admin/tenant.html` | M |
| F34b | 桌面：Instance↔Shop 綁定 UI | done | InstanceCard 下拉綁定＋refetch | S |
| F35 | 回覆管線：Keyword 改為注入素材，AI 成稿（硬規則可短路） | done | 素材注入＋AI；失敗回落關鍵詞；轉人工短路 | M |
| F36 | Keyword 按 Shop 作用域（本機或同步策略） | done | keyword.shop_id＋EditKeyword＋getKeywords 過濾 | M |
| F38 | **PlatformHardRules**＋**TenantVoice**（分層 Prompt） | done | HardRules 全局一份；TenantVoice 桌面可編；注入疊加且不可削弱硬規則；見 ADR 0008 | M |
| F16 | 闸道凭证安全存储（勿明文 password） | done | 落盘仅 JWT，不含明文密码 | S |
| F17 | 闸道生产部署基线（JWT_SECRET、容器／HTTPS 说明） | done | docs/PRODUCTION.md | M |
| F26 | UsageRecord.cost_upstream 填入＋毛利視圖 | done | hit／miss／output×官方價；／admin 用量與毛利彙總 | S |

---

## P2 — 可後做（本版可標 wont）

| ID | 能力 | 狀態 | 備註 | 預估 |
|----|------|------|------|------|
| F20 | 自訂 Plugin | wont | 第一版刻意關閉 | L |
| F21 | 實例級 Driver／話術設定 | todo | 目前僅全局配置 | M |
| F22 | 拼多多轉接對象過濾 | todo | 代碼有 TODO | S |
| F23 | 多 ModelSKU 路由（按 Tenant／場景） | todo | 現僅單一 active | S |
| F24 | 本機營運日誌持久化／匯出 | todo | 現僅即時 Log UI | M |
| F25 | 低餘額門檻可配置 | todo | 表有、API／UI 無 | S |
| F26 | UsageRecord.cost_upstream 填入＋毛利視圖 | — | 已升 P1 並完成（見上） | S |
| F27 | Strategy WS 健康檢查完善 | todo | backend 有 TODO | S |

---

## 非功能／法務（PO 必知）

| ID | 項目 | 狀態 | 說明 |
|----|------|------|------|
| R01 | AGPL Fork 閉源交付風險 | open | 見 `docs/adr/0002-agpl-fork-closed-distribution.md` |
| R02 | StrategyBackend 黑盒依賴 | accepted | 見 `docs/adr/0003-strategy-backend-binary-rpa.md` |
| R03 | 按 Shop 隔離＋Keyword 注入 AI 成稿 | accepted | 見 `docs/adr/0004-shop-scoped-knowledge-ai-compose.md` |

---

## Grill 決策紀錄（進行中填寫）

| # | 決策問題 | 結論 | 影響功能 ID |
|---|----------|------|-------------|
| G1 | 對外可賣第一版邊界 | （未決） | F01–F17 |
| G2 | 每店賣點／話術隔離單位 | **Shop**：一公司（Tenant）下多拼多多店＋多千牛店；知識／話術按 Shop 隔離，禁止串店 | 知識模型、閘道檢索、Instance 綁定 |
| G3 | 來訊時如何識別當前 Shop | **A**：拼多多 Instance↔Shop；千牛靠氣泡／視窗店標識；識別失敗不注入他店知識（保守） | 閘道 payload、RPA／PDD ctx |
| G4 | 每店賣點／資訊形態 | **結構化**；賣點跟商品走（ShopGoodsNote），ShopProfile 不含單品賣點 | ShopProfile／ShopGoodsNote |
| G5 | Shop vs 商品賣點分工 | **A**：ShopProfile＝店共通（名／定位／物流／售後／禁答／轉人工）；ShopGoodsNote＝商品賣點等，按當前諮詢商品注入 | 閘道注入、維護 UI |
| G6 | 商品如何對上 ShopGoodsNote | **A**：優先平台商品 ID，其次標題別名／關鍵詞；皆未命中則不注入商品賣點（寧缺勿錯） | 匹配邏輯、維護欄位 |
| G7 | 多店是否共用公司級政策 | **A**：Tenant 共用政策＋ Shop 可覆寫；賣點不走共用層 | TenantPolicy／ShopProfile 合併注入 |
| G8 | 誰維護 Shop／賣點／政策 | **A**：TenantAdmin 管 Shop＋Policy＋Profile＋全部 Note；Operator 僅可編 ShopGoodsNote，不可改政策／禁答／轉人工 | 權限、F34 |
| G9 | Keyword 與 AI 關係 | **A**：Keyword＝約束／素材，與店／商品知識一併注入；AI 成稿。轉人工等可短路 | 回覆管線、F35 |
| G10 | Keyword 作用域 | **A**：按 Shop；注入只帶當前 Shop 命中素材 | Keyword 模型、F36 |
| G11 | 維護入口 | **A**：閘道 Web Admin 為主；桌面做 Instance↔Shop 綁定 | F34、Admin UI |
| G12 | Shop 對外標識 | **A**：顯示名＋渠道＋`external_keys[]`（店名／店 ID／氣泡別名）；對不上則保守不串店 | Shop 主檔、匹配 |
| G13 | 舊 TenantKnowledge | **A**：凍結只讀／可匯出；新內容只進 Shop 模型；不自動猜店歸屬 | 遷移、F15 |
| G14 | 下一波實作優先序 | **C**：並行——F30–F33（Shop 模型＋注入）＋ F01／F02（二進位打包＋雙渠道冒煙） | 排期 |
| G15 | grilling 收束 | **A**：收束並開工；先 F30＋F01 | 實作 |
| G16 | 何謂須接管的回覆失敗 | **ReplyFailure**：硬失敗，或 AI＋關鍵詞＋預設皆發不出；不含有兜底成功發出；不含規則轉人工 | F37 |
| G17 | 失敗處置形態 | **FailureHandoff**：不露餡安撫 → 平台轉接 → HandoffAlert；轉失敗加重標註 | F37 |
| G18 | 買家側失敗話術 | 獨立「失敗轉人工安撫語」，禁露餡；不共用 default_reply | F37 |
| G19 | 失敗後自動回 | 僅該會話冷卻 15 分鐘＋可手動恢復 | F37 |
| G20 | 運營如何知道 | 桌面待接管佇列＋聲音／通知；不上報閘道；不落盤 | F37 |
| G21 | 渠道範圍 | 拼多多＋千牛同一套；千牛轉接盡力 | F37 |
| G22 | 規則轉人工是否進佇列 | **A**：進同一 HandoffAlert，原因區分 | F37 |
| G23 | has_transfer 與失敗轉接 | 失敗轉接不受 has_transfer 關閉影響 | F37 |
| G24 | 超時 | **ReplyTimeout** 預設 60s，逾時升 ReplyFailure | F37 |
| G26 | 收費如何對齊 DeepSeek | **固定零售 PriceBook≈10×Flash 未命中成本**；對內記真實成本；cache 歸運營；默認 flash；中位「¥100≈約3千次」+強制免責；上游調價零售先不動；F26 升 P1；文案桌面+運營側 | ADR 0006、F26 |
| G27 | 關鍵詞桌面入口 | **B**：右上為工作台；進門選／切 Shop；實例齒輪不編關鍵詞 | Keyword、UI |
| G28 | 設置分層 | **A**：右上＝網關帳戶＋本機行為＋關於；實例齒輪＝綁定店＋本店物流／售後／禁答／轉人工／商品賣點；店鋪知識改由齒輪進 | UI、Shop |
| G29 | 主視窗縮放 | **B**：可縮放；默認 528×1024；最小約 480×720 | 桌面主窗 |
| G30 | 未綁定店時實例齒輪 | **A**：仍可開，第一屏只做綁定；綁好再編本店資料 | UI、Shop |
| G31 | HardRules vs TenantVoice | **A**：HardRules 永不被覆蓋，TenantVoice 只能疊加 | ADR 0008、F38 |
| G32 | TenantVoice 作用域 | **A**：僅 Tenant 一層；第一版不做 ShopVoice | ADR 0008、F38 |
| G33 | 誰維護／入口 | **A**：僅 TenantAdmin；桌面「設置 → 網關帳戶」旁 | F38、UI |
| G34 | 未填 TenantVoice | **A**：允許為空，僅 HardRules＋店／商品／關鍵詞 | F38 |
| G35 | TenantVoice 字數 | **A**：約 2,000 字上限 | F38 |
| G36 | HardRules 存放 | **B**：全平台一份，與 ModelSKU 脫鉤 | ADR 0008、F38 |
| G37 | TenantVoice 禁詞 | **B**：命中露餡／轉人工等詞則拒絕保存 | F38 |

---

## 建議實作順序（已鎖定 G14＝並行）

### 並行線 1：按店知識／話術
1. F30 → F31 → F32 → F33 → F34／F34b → F35 → F36 → F15（**已完成代碼**）  

### 並行線 2：交付硬門檻
1. F01 Strategy 二進位納入資產／安裝包（README 已補；二進位仍需人工）  
2. F02 拼多多＋千牛收發冒煙（清單 `docs/SMOKE_F02.md`；真實收發需人工）  
3. **F37** ReplyFailure／FailureHandoff（防超時接管）— 對齊防客訴  

### 其後（G1 未決）
F03／F10–F14／F16／F17／刪除商戶 — **已完成**；餘 P2（F21–F27）與 R01 法務  
