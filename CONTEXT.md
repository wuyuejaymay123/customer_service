# 智能客服系統

B2B 電商智能客服：Windows 桌面客戶端連平台客服界面，AI 回覆經運營方閘道扣 Credit 差價變現。

## Language

### 組織與角色

**Tenant**：
向運營方採購並充值 Credit 的公司。
_Avoid_: 客戶公司, 商戶帳號, account

**Operator**：
Tenant 下負責值班回覆的客服人員。
_Avoid_: 客服帳號, user, agent

**TenantAdmin**：
Tenant 內管理員；可開 Operator、設 Quota、查看本 Tenant 流水與餘額。
_Avoid_: 店長帳號（口語可保留，正式文檔用本詞）

**PlatformAdmin**：
運營方管理員；開戶、人工充值、Suspend、配置 ModelSKU 與 PlatformHardRules。
_Avoid_: 超管, 後台管理員（口語）

### 計費

**Wallet**：
Tenant 的 Credit 餘額容器；扣費只從此出。
_Avoid_: 帳戶餘額, balance（口語可）

**Credit**：
對外售賣與扣費的虛擬單位；不是上游模型的 raw token。對商戶溝通時可並陳「約等於多少次智能回覆」作感知輔助（營銷估算口徑約 3 Credit／次，即 ¥100 ≈ 約 3,000 次）；凡出現該估算須附固定免責短句（約值、視長度與知識注入浮動、以實扣為準）。精確扣費仍以 Credit 為準。
_Avoid_: Token（對外）, 積分（易與別系統混淆）, 只用「次數套餐」而無 Credit 結算, 把「約等於 N 次」寫成保證次數, 樂觀次數估算不帶免責

**Quota**：
掛在 Operator 上的使用上限；觸頂則硬停 AI。
_Avoid_: 限額（口語）, Instance 額度（第一版不做）

**Recharge**：
充值單；第一版由 PlatformAdmin 人工確認後入帳。
_Avoid_: 訂單（易與電商訂單混淆）, top-up

**LedgerEntry**：
Wallet 的流水記錄（充值、凍結、結算、釋放、調整）；供運營／內部對帳。客戶端「點數流水」**不**展示本實體（避免暴露內部結算語意）。
_Avoid_: 流水日誌（口語）, 把完整 Ledger 直接給商戶當對帳 UI

**Adjustment**：
PlatformAdmin 對 Wallet 的糾錯或補償入帳；不表示現金退款。
_Avoid_: 退款, 贈送單（若需可記為 Adjustment 子類型）

**Reserve**：
AI 請求前凍結的預估 Credit；成功則結算，失敗則釋放。
_Avoid_: 預扣（口語可）, hold

**UsageRecord**：
一次 AI 呼叫的對內計量（真實 token、分項上游成本、扣 Credit、成敗）；不含對話全文。上游成本與對外扣 Credit 可分離：前者跟模型價目與 cache，後者跟 PriceBook／TenantPricing。客戶端對帳僅見**成功且 Credit＞0** 的時間與扣點，不回傳模型名／token／成本。
_Avoid_: 調用日誌（過寬）, 假定扣費金額等於上游帳單, 向商戶暴露上游模型名

**PriceBook**：
全局「用量 → Credit」與「人民幣 → Credit」的**對外零售**規則；不隨單次上游緩存命中／未命中波動。上游真實成本記入 UsageRecord，供運營對帳與調價，不直接等於當次向 Tenant 扣費公式。上游供應商調價後，零售價不自動聯動，由 PlatformAdmin 依毛利決定是否改價。
_Avoid_: 價目表（口語）, 匯率表, 把上游帳單原樣轉嫁商戶, 上游調價自動改商戶單價

**TenantPricing**：
某 Tenant 相對 PriceBook 的折扣。
_Avoid_: 合同價（過寬）

### AI 與閘道

**LLM Gateway**：
唯一允許的 AI 出口；禁止客戶 BYOK。
_Avoid_: 代理, proxy（技術口語可）

**ModelSKU**：
PlatformAdmin 配置的可路由上游模型（OpenAI 兼容端點）。不承載全平台行為禁令文案。
_Avoid_: 模型名（裸字符串）, 把 HardRules 寫進 ModelSKU

**PlatformHardRules**：
運營方配置的**全平台一份**強制系統規則（禁編造商品、禁對買家說轉人工／露餡詞、僅可依目錄售貨等）。與 ModelSKU 脫鉤；注入時優先於商戶自訂，且不可被削弱。
_Avoid_: PlatformPrompt（舊稱／與模型綁定的整包提示）, system prompt（對外文檔優先本詞）, 讓 Tenant 覆蓋硬規則

**TenantVoice**：
Tenant 級、該商戶下**所有 Shop 共用**的可選補充系統說明（口吻、品牌話術、公司統一補充規則）。僅 TenantAdmin 在桌面「設置 → 網關帳戶」附近維護；可為空；約 2,000 字上限；保存時禁詞拒絕。不可覆蓋 PlatformHardRules；第一版不做 Shop 級 Voice。
_Avoid_: 每店一段人設（第一版）, 客服號可改公司口吻, 用 TenantVoice 當商品知識庫

**PlatformPrompt**：
（過渡／棄用方向）舊稱：曾指掛在 ModelSKU 上的整包系統提示。正式模型改以 **PlatformHardRules**＋可選 **TenantVoice** 為準。
_Avoid_: 新設計繼續用本詞指代硬規則

**GatewayPayload**：
當次請求送入閘道的內容：短歷史、PlatformHardRules、可選 TenantVoice、當前 Shop 政策／目錄／賣點、Keyword 素材等允許的 Context；不含手機號；不長期存全文。
_Avoid_: 請求體（過寬）

### 桌面與渠道

**SupportedChannel**：
正式擔保的平台渠道：拼多多。淘寶／千牛本版不做。
_Avoid_: 全平台支持（營銷口徑，不作承諾）, 本版承諾千牛

**Instance**：
本機某個平台任務實例（沿用上游概念）；拼多多建議一 Instance 對應一 Shop，千牛可用一 Instance 覆蓋客戶端內多 Shop。
_Avoid_: 店鋪連接（口語）, 把 Instance 當成 Shop 本身

**Shop**：
Tenant 名下的一個對外經營店鋪（拼多多店或千牛／淘寶店等）；賣點、政策、話術與知識作用域以 Shop 為準，同一 Tenant 下多 Shop 彼此隔離。以顯示名、渠道與 **external_keys**（平台店名／店 ID／氣泡別名等）對上運行中的渠道身分。拼多多掃碼讀到店名後，桌面應自動建立（若不存在）並綁定 Instance↔Shop；本店設置無需再手動選店。
_Avoid_: 店鋪連接, Instance（技術連接器）, 把整 Tenant 當一店, 僅靠單一顯示名且不可別名, 每次進設置都強制手動綁定

**ShopProfile**：
掛在某一 Shop 上的結構化**整店共通**說明：店顯示名、可選店鋪定位、物流／發貨、售後政策、禁答、轉人工條件等；**不含**單品賣點。閘道回覆時按當前 Shop 注入。
_Avoid_: TenantKnowledge（舊稱／過渡）, 把商品賣點寫進整店檔, 無結構的整包知識庫

**TenantPolicy**：
Tenant 級、多 Shop 可共用的結構化政策（如統一售後原則、禁答底線）；ShopProfile 未填的對應欄位可回落至此，Shop 有填則覆寫。不承載單品賣點。
_Avoid_: 全公司賣點庫, 與 ShopProfile 混為同一張無作用域表

**GoodsMatchKey**：
用以把當前諮詢商品對上 ShopGoodsNote 的鍵：優先平台商品 ID，其次標題別名／關鍵詞；皆未命中則不注入該 Note（寧缺勿錯、禁止猜款）。
_Avoid_: 全庫模糊搜尋硬塞賣點, 向量檢索（第一版不做）

**Session** / **Message**：
本機對話實體；不上雲作為主數據。

**Keyword**：
本機關鍵詞實體；不上雲作為主數據。提供**約束與素材**（必答點、禁用句、可引用短句），與 ShopProfile／ShopGoodsNote 一併注入閘道；**由 AI 生成最終回覆**。轉人工／硬性禁答等可短路、不必經 AI。作用域為 Shop。桌面右上「關鍵詞」為工作台入口，進門須選／切換當前 Shop；實例齒輪不承載關鍵詞編輯。
_Avoid_: Keyword 優先於 GPT（舊規則）, 命中關鍵詞就跳過 AI, 雲端會話, 全公司一份關鍵詞且不可按店切換

**ReplyFailure**：
自動回覆輪次中**未能在時限內向買家送出有效回覆**的情況：發送／渠道硬錯誤；AI、關鍵詞與預設皆未產出可發內容；或自買家該則訊息起超過 **ReplyTimeout** 仍未成功發出。不含「時限內已用關鍵詞／預設成功發出」；亦不含規則觸發的轉人工。發生時應觸發 **FailureHandoff**。
_Avoid_: 把有兜底成功發出的情況當失敗, 與 TransferKeyword 規則轉人工混為同一事件, 無限等待 AI 導致買家側超時

**ReplyTimeout**：
自買家該則待回訊息起，允許自動回覆鏈路消耗的最長時間；逾時即升為 ReplyFailure。預設 60 秒，可配置。目的：避免平台回覆超時與買家乾等引發客訴／售後。
_Avoid_: 僅依賴上游拋錯才放棄, 與「等待人工間隔」混為同一語意不清欄位

**FailureHandoff**：
對 ReplyFailure 的處置：先盡力向買家發送**失敗轉人工安撫語**（獨立於預設回覆的短句，禁露餡詞），再**強制嘗試**平台轉接（不受設定「開啟轉人工／has_transfer」關閉影響；該開關僅約束規則轉人工），並發出 **HandoffAlert**；安撫發送失敗不阻擋轉接與提醒；轉接失敗時提醒須標明「轉接也失敗，請立刻人工」。觸發後該**會話**自動回覆冷卻預設 15 分鐘（可配置），並可手動提前恢復；其它會話不受影響。拼多多與千牛同一套流程；千牛轉接盡力而為，失敗／不支持時佇列加重標註。
_Avoid_: 只打日誌不提醒, 只提醒不嘗試轉接（第一版不做）, 與規則轉人工混用不記原因, 失敗話術暴露自動化身分, 與 default_reply 混用同一文案, 一單失敗就暫停整實例自動回, 千牛第一版不做 FailureHandoff, 因 has_transfer 關閉而跳過失敗轉接

**HandoffAlert**：
桌面端運營可見的**待接管**提醒：主視窗佇列（店鋪／買家／原因／時間，可「已接手／恢復自動回」）＋聲音／系統通知。來源含 **FailureHandoff** 與**規則轉人工**（TransferKeyword），原因欄區分「回覆失敗」與「規則轉人工」。第一版不上報閘道、佇列不落盤（重啟清空）；短時間同因合併以免洗版。
_Avoid_: 僅日誌一行, 僅一次性 toast 無佇列, 第一版做遠端閘道告警, 規則轉人工不進佇列導致無人盯, 失敗與規則轉人工無法區分原因

**TenantKnowledge**：
（過渡／棄用方向）舊的 Tenant 級自由文本知識條目；正式模型改以 ShopProfile／ShopGoodsNote／TenantPolicy 為準。
_Avoid_: 知識庫檔案中心, Dify（二期可替換承載）, 無 Shop 作用域的整包 Tenant 知識

**StrategyBackend**：
上游閉源 `__main__.exe`；以 UI 自動化收發平台訊息。當黑盒依賴。
_Avoid_: 爬蟲, 官方 API
