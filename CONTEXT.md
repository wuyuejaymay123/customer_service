# 智能客服系統

B2B 電商智能客服：Windows 桌面客戶端連平台客服界面，AI 回覆經運營方閘道扣 Credit 差價變現。

## Language

### 組織與角色

**Tenant**：
向運營方採購並充值 Credit 的公司。
_Avoid_: 客戶公司, 商戶帳號, account

**Operator**：
Tenant 下負責值班回覆的客服人員（閘道模型仍可保留）。當前產品桌面以**單一商戶登入**為主路徑，已去掉「為同事開客服子帳號」作為正式能力；**DesktopConfig** 不按 Operator 拆分。
_Avoid_: 客服帳號, user, agent, 把子帳號當配置隔離維度（當前產品不做）

**TenantAdmin**：
Tenant 內管理員；可維護本 Tenant 配置與查看流水／餘額。歷史能力含開 Operator、設 Quota；當前桌面可不暴露開子帳號 UI。
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

**AppShell**：
桌面客戶端單一主窗口外殼：頂欄（品牌名固定為「智能客服」＋ **DeskStatus**）＋左導航＋右內容。日常路徑在殼內切換 **DutyDesk** 與 **SettingsCenter** 各目的地；需要時可另開次要窗口（如關鍵詞對照編輯），但不得作為唯一入口。換殼只調資訊架構與外觀，不新增假能力（無假統計、無「開發中」佔位當正式功能）。
_Avoid_: 設置／關鍵詞僅能靠獨立窗到達, 左導航點了就跳窗當唯一路徑, 為對齊視覺稿捏造運行指標或空模組頁, 頂欄改名「智客 Agent」等未定案品牌

**DutyDesk**：
**AppShell** 內面向 **Operator** 的值班首屏：左欄 **AutoReplyMaster**＋以 **Shop** 為單位的泳道（店名＋**ShopCardStatus**＋**ShopAutoReply**／**ShopCardAction**）；右上運行區＝真實連線／回覆日誌與狀態（無可造假指標，允許空態或可收合）；右下常駐 **HandoffAlert**。Instance 僅作連線細節。未滿足 **DeskReady** 時不進入完整 DutyDesk，改走阻塞式就緒嚮導。本版不在首屏放平台選擇器。
_Avoid_: 控制台, 任務管理器, 把 TenantAdmin 配置台當首屏, 首屏同時並列配置與值班且無主次, 以「拼多多 #編號」當 Operator 主識別, 首屏常駐功能 checkbox 牆, 本版首屏再放多平台列表, 未就緒仍開放全部控件只靠日誌報錯, 運行區放假數據或「模組開發中」充數

**DeskStatus**：
**AppShell** 頂欄右側精簡狀態：已登入身分（Operator／商戶顯示名；未登顯示「未登入」）、**Wallet** 的 Credit 餘額（有數據才顯示；偏低變色）。點擊身分／餘額進入 SettingsCenter「帳戶」。**AutoReplyMaster** 放在 DutyDesk 左欄，不堆進頂欄。不含在線店數彙總或閘道指示燈（店級狀態看 Shop 泳道）。
_Avoid_: 頂欄堆砌連線燈與店數統計, 頂欄無身分與餘額, 把餘額只藏在設置深處, 頂欄用假名或裝飾頭像充數

**CreditExhaustion**：
Wallet 不足以完成智能回覆時的處置（關鍵詞僅為 AI 素材，不得在無 AI 時冒充最終回覆）：餘額偏低時 **DeskStatus** 預警；單次智能回扣不動／失敗則該會話走 **ReplyFailure／FailureHandoff**；餘額耗盡時系統關閉 **AutoReplyMaster** 並給 Operator 全局提醒（窗可留供人工），避免每條消息刷待接管。規則轉人工（TransferKeyword 短路）仍可生效。
_Avoid_: 點數不足時用關鍵詞直出當最終回覆, 耗盡後仍假裝智能回可用, 耗盡時只靠每條 FailureHandoff 刷佇列而無總閘提示

**DeskVisual**：
**AppShell**／DutyDesk／SettingsCenter 的視覺取向為**日間運營台**：內容區淺底、清晰層級、狀態語義色（在線綠／待處理琥珀／失敗紅）；左導航可採深色軌道以對齊參考稿，但不把整窗做成深色主題優先。主色冷靜克制；組件策略為先換殼與 DutyDesk（TDesign 或等價樣式），SettingsCenter 內頁可暫留現有實現再遷。
_Avoid_: 整窗深色值班台作默認, 電商營銷風當主界面, 紫漸層／奶油襯線等通用模板臉, 卡片陰影與圓角堆疊搶狀態信息, 為換皮一次重寫全部內頁邏輯

**DeskUIPhase1**：
可發安裝包必須**行為真實可用**（禁止僅 UI 假開關）：**AppShell**、DeskReady、DutyDesk（Shop 泳道與 **ShopCardStatus**、AutoReplyMaster／ShopAutoReply 真生效、ShopAutoReplyHalt、HandoffAlert、DeskStatus、CreditExhaustion、真實運行日誌區）、**ShopIsolation**／**MultiShopScheduling**、SettingsCenter 按領域左導航、DeskVisual 換殼。關鍵詞三入口與本店資料掛入殼內側欄（交互可暫沿用舊頁，按店隔離與注入須正確）；另開窗僅為可選。不含關鍵詞工作台大改、不含整窗深色主題、不含完整桌面聊天室、不承諾 100% 窗聚焦與買家氣泡級跳轉。
_Avoid_: 第一期只換顏色不動資訊架構, 第一期開關僅展示不生效, 第一期同時重做關鍵詞與本店全部交互, 第一期做買家氣泡級跳轉, 第一期為對齊視覺稿增加假能力

**ShopCardAction**：
DutyDesk 上 Shop 泳道／卡片的主操作隨連線狀態變化：待掃碼→打開登錄窗；已登錄→本店設置（在 **AppShell** 內進 SettingsCenter「單店管理」並預選該店；可選另開窗）；已關閉→重新連接。ShopAutoReply 為次要控件；刪除等收入更多選單，避免與主按鈕同權重並列。
_Avoid_: 固定三按鈕無主次, 整卡點進詳情當唯一交互, 齒輪／刪除／播放同排同視覺權重

**ShopCardStatus**：
Shop 卡片同時展示**連線狀態**與**自動回狀態**（兩行，不合成一個含糊標籤）。連線：待掃碼／已連接／已關閉。自動回：未就緒／自動回覆中／人工接待（手動停）／已停用（Halt，附短原因）／總開關已關。避免「已連接但人工」被誤讀成斷線。
_Avoid_: 單一綜合狀態詞掩蓋「連著但人工」, 用「離線」指代手動停自動回

**DeskReady**：
進入完整 DutyDesk 前的就緒條件：已登入閘道（有效商戶會話）且至少有一家可值班的 Shop／Instance（含待掃碼）。就緒嚮導步驟固定為：登入商戶帳號 → 添加拼多多店並掃碼 →（可選）開啟 AutoReplyMaster。
_Avoid_: 軟引導步驟條當唯一約束, 未登閘道仍可亂點開回覆, 把配置項一次性塞進嚮導

**SettingsCenter**：
**AppShell** 內按**領域**組織的設置目的地：規則（TenantVoice／全店回覆策略合一，可保存並納入 **DesktopConfig**）、關鍵詞匹配／替換／轉接（Tenant 全店共用三入口）、單店管理＝ShopProfile／賣點與 **ShopRoster**、積分＝餘額／充值／用量、帳戶＝登入／改密（不開客服子帳號管理）、以及關於。預設在殼內打開。DutyDesk「本店」捷徑進「單店管理」並預選該店。
_Avoid_: 把規則／積分／改密糊成一塊且無導航區分, 關鍵詞強制先選 Shop, 帳戶頁再暴露開子帳號當正式能力, 為外觀拆出無對應能力的空頁

**AutoReplyMaster**：
DutyDesk 上的**全局**自動回覆總閘門（下班／上班）；關閉時所有 Shop 均不自動回覆。開啟時**不**自動清除各店的 ShopAutoReply 關閉狀態——此前手動停或 Halt 的店保持停，直至 Operator 在連線就緒後單獨打開該店。
_Avoid_: hasPaused（實作欄位名）, 僅用「播放按鈕」而不說明作用域, 打開總閘就強制全部店恢復自動回

**ShopAutoReply**：
某一 Shop 的自動回覆開關；**僅在 AutoReplyMaster 開啟時生效**，可單獨暫停該店、其餘店繼續（該店改由人工在渠道頁接待）。Master 關閉時本開關不可單獨「強行開跑」。可由 Operator 手動關；也可因 **ShopAutoReplyHalt** 被系統關。關閉後 DutyDesk 上必須一眼可見「本店未在自動回」。**停自動回不自動關瀏覽器窗**（便於人工繼續接待）；僅 Operator 手動關窗或掉登才進入已關閉／待掃碼並可觸發 Halt。重新打開自動回前須該店連線就緒；掉登／已關閉時不可只撥開關就假裝恢復。不要求向買家宣告（避免露餡）。第一期：凡能登入桌面的閘道帳號，對總閘／店級開關權限相同；不做 TenantAdmin vs Operator 桌面權限拆分。
_Avoid_: 只有店級無總閘, 只有總閘無法單店暫停, 把連線／掃碼狀態與是否自動回覆混成同一個開關, 靠向買家發露餡說明來代替 Operator 側狀態顯示, 單一會話失敗就默認關掉整店, 窗已關或待掃碼仍允許打開店級自動回, 停 ShopAutoReply 就自動關窗打斷人工接待, 第一期先做複雜桌面角色權限再做開關正確性

**ShopAutoReplyHalt**：
因店級故障把該店 **ShopAutoReply** 關掉（其餘店不受影響），並在卡片上標明原因。第一期觸發：瀏覽器／頁面被關；掉登／回到待掃碼；可選「連續多次店級驅動失敗」（預設連續 5 次，可配置）。**不**因單次 **ReplyFailure** 觸發；閘道點數不足或 Tenant 停用屬全局問題，走 **AutoReplyMaster**／**DeskStatus** 提示，不單獨 Halt 某一店。與 **FailureHandoff** 不同：後者是會話級冷卻＋待接管。Halt 時以 **Shop 卡片高亮＋獨立店級提醒**通知 Operator，**不**與買家維度的 **HandoffAlert** 佇列混為同一列表。
_Avoid_: 與 FailureHandoff 混成同一開關, 故障時只打日誌不改店級狀態, 一單 ReplyFailure 就 Halt 整店, 點數不足只關一家店而其餘店假裝仍可智能回, 把「整店已停自動回」塞進買家待接管佇列當同一類條目

**SupportedChannel**：
正式擔保的平台渠道：拼多多。淘寶／千牛本版不做。
_Avoid_: 全平台支持（營銷口徑，不作承諾）, 本版承諾千牛

**Instance**：
本機某個平台任務實例（沿用上游概念）；拼多多建議一 Instance 對應一 Shop，千牛可用一 Instance 覆蓋客戶端內多 Shop。
_Avoid_: 店鋪連接（口語）, 把 Instance 當成 Shop 本身, 在 DutyDesk 對外文案優先稱「任務／應用」而掩蓋 Shop

**Shop**：
Tenant 名下的一個對外經營店鋪（拼多多店或千牛／淘寶店等）；賣點、政策、話術與知識作用域以 Shop 為準，同一 Tenant 下多 Shop 彼此隔離。以顯示名、渠道與 **external_keys**（平台店名／店 ID／氣泡別名等）對上運行中的渠道身分。拼多多掃碼讀到店名後，桌面應自動建立（若不存在）並綁定 Instance↔Shop；本店設置無需再手動選店。
_Avoid_: 店鋪連接, Instance（技術連接器）, 把整 Tenant 當一店, 僅靠單一顯示名且不可別名, 每次進設置都強制手動綁定

**ShopIsolation**：
多店並行時必須同時保證：（1）讀寫消息與發送只落在該店對應的瀏覽器會話／Instance，不得發到另一店窗；（2）自動回覆只用該店的 ShopProfile／賣點／關鍵詞等 Context，不得混用他店資料。允許同一瀏覽器進程內多個獨立會話（Context），不要求每店一個作業系統進程。按店記帳（Credit／Usage 歸屬）可另保證，但不取代上述兩條。同一 Tenant 本機運行中，**禁止**兩個 Instance 綁定／登錄為同一 Shop（掃碼或綁定時發現重複則拒絕並提示已在運行）；不允許「同店雙窗自動化」。
_Avoid_: 只隔離窗不隔離知識, 把「同進程多 Context」當成串店缺陷, 用共用 cookie／共用頁面驅動多店, 同店多 Instance 並行自動化, 重複掃碼默認合併卻留下雙驅動窗

**MultiShopScheduling**：
多店同時有待回消息時，第一期以**串行排程**為準（一家處理完再處理下一家），接受短暫排隊延遲；若某單逼近 **ReplyTimeout**，走 **ReplyFailure／FailureHandoff**，不沉默拖過平台時限。不把「多店真並行處理」當第一期硬要求。
_Avoid_: 第一期承諾多店零等待並行, 忙時只排隊卻不觸發超時接管, 為搶並行犧牲 ShopIsolation

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
本機對話實體；不上雲作為主數據（隱私邊界，見 ADR-0001／0011）。

**Keyword**：
回覆用的關鍵詞／替換／轉接規則素材；提供**約束與素材**（必答點、禁用句、可引用短句），與 ShopProfile／ShopGoodsNote 一併注入閘道；**由 AI 生成最終回覆**。轉人工／硬性禁答等可短路、不必經 AI。當前產品作用域為 **Tenant 全店共用**（不按 Shop 選店編輯）。可隨 **DesktopConfig** 雲同步；本機庫為緩存。不含對話全文。
_Avoid_: Keyword 優先於 GPT（舊規則）, 命中關鍵詞就跳過 AI, 雲端會話全文, 進關鍵詞工作台強制先選 Shop（已取消）, 按 Operator 拆多套關鍵詞

**DesktopConfig**：
隨 Tenant 帳號走的可同步桌面配置包：全店回覆策略、Keyword 整包、**ShopRoster**。經閘道 API 讀寫，庫可托管於 Supabase；帶 **ConfigVersion**。真相在雲，本機 SQLite 為緩存。離線時只讀、不可編輯。
_Avoid_: 把 Cookie／連線狀態當 DesktopConfig, 桌面直連數據庫繞過閘道, 離線仍允許改配置並靜默覆蓋雲端

**ConfigVersion**：
某一 DesktopConfig 包的單調版本；保存必須攜帶本機已知版本，雲端已更新則拒絕覆蓋（先拉取再改）。
_Avoid_: 無版本後寫覆蓋且不提示, 離線合併衝突 UI（第一期不做）

**ShopRoster**：
Tenant 名下店鋪名冊（顯示名、渠道、對應 Shop／綁定鍵等），可雲同步以便換機仍見店列表。名冊不是渠道真身分；真身分以掃碼／渠道登入結果為準，對不上則改綁或當新店，禁止用錯店知識回覆。
_Avoid_: 雲名冊強制覆蓋掃碼結果, 換機還原 Cookie 免掃碼, 名冊與錯店窗口仍開自動回

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
桌面端運營可見的**待接管**提醒：DutyDesk **常駐區塊**（店鋪／買家／原因／時間）＋聲音／系統通知；無單時仍佔位並顯示空狀態（如「目前沒有待接管」）。每一行主操作為**去接待**：盡力打開／聚焦該店瀏覽器窗；失敗則提示「請手動切到「店名」窗口」。第一版不保證跳到具體買家氣泡，也不承諾 100% 聚焦成功。次要為「已接手」「恢復自動回」。來源含 **FailureHandoff** 與**規則轉人工**（TransferKeyword），原因欄區分二者。第一版不上報閘道、佇列不落盤（重啟清空）；短時間同因合併以免洗版。
_Avoid_: 僅日誌一行, 僅一次性 toast 無佇列, 第一版做遠端閘道告警, 規則轉人工不進佇列導致無人盯, 失敗與規則轉人工無法區分原因, 無單時整區消失導致 Operator 不知道該盯哪, 主按鈕只消佇列不幫定位到店窗, 第一版承諾點進具體買家氣泡, 第一版承諾 100% 聚焦到正確窗否則不做去接待

**TenantKnowledge**：
（過渡／棄用方向）舊的 Tenant 級自由文本知識條目；正式模型改以 ShopProfile／ShopGoodsNote／TenantPolicy 為準。
_Avoid_: 知識庫檔案中心, Dify（二期可替換承載）, 無 Shop 作用域的整包 Tenant 知識

**StrategyBackend**：
上游閉源 `__main__.exe`；以 UI 自動化收發平台訊息。當黑盒依賴。
_Avoid_: 爬蟲, 官方 API
