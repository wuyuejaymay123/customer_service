# DutyDesk 與 SettingsCenter（桌面 UI 第一期）

桌面首屏改為面向 Operator 的 **DutyDesk**（以 Shop 為主視覺單位），配置收斂為單一 **SettingsCenter**；未就緒走 **DeskReady** 阻塞嚮導。本決策部分取代 [0007](./0007-desktop-settings-scope-and-window.md) 中「關鍵詞獨立頂欄為主路徑、全局／平台／實例三套設置並列」的組織方式。

## Status

accepted

## Considered Options

- **值班首屏 vs 配置首屏**：選值班（DutyDesk）。配置台當首屏會讓產品像工程控制台，不利 Operator 日常。
- **Shop 卡 vs Instance 編號卡 vs 會話佇列主體**：選 Shop 卡。知識／扣費／關鍵詞以 Shop 為準；本版不做桌面完整聊天室，會話佇列主體成本高且與拼多多網頁重複。
- **僅全局開關 / 僅店級 / 全局+店級**：選 AutoReplyMaster + ShopAutoReply，兼顧下班一鍵全停與單店暫停。
- **首屏資訊密度**：選精簡（Shop + 開關 + HandoffAlert 常駐空態；日誌可展開；本版去掉平台選擇器）。拒絕「只換皮不動架構」。
- **未登閘道引導**：選 DeskReady 阻塞嚮導（登入 → 加店掃碼 → 可開回覆），避免未就緒亂點被誤認為故障。
- **設置入口**：選 SettingsCenter 單一側欄（帳戶與點數／回覆策略／本店資料含關鍵詞入口／關於）；Shop 卡「本店」打開同一中心並預選該店。本版取消平台齒輪主路徑。
- **視覺**：選日間運營台（DeskVisual），拒絕深色優先與電商營銷風主界面。
- **第一期範圍（DeskUIPhase1）**：骨架 + 換皮 + 設置合併即可發包；關鍵詞工作台大改、買家氣泡級跳轉、深色主題不做。

## Consequences

- 實作需新增店級自動回覆狀態（現況僅有全局 `hasPaused`）；Handoff「去接待」第一版只保證打開／聚焦該店瀏覽器窗。
- 0007 仍有效的部分：主窗可縮放；本店業務資料仍以 Shop 為作用域；未綁定網關店時本店設置先引導綁定。
- 詞彙見根目錄 `CONTEXT.md`（DutyDesk、DeskReady、SettingsCenter、DeskStatus、DeskVisual、ShopCardAction、DeskUIPhase1 等）。
