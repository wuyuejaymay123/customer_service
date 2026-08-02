# 多店隔離與單店自動回覆控制

多店並行必須滿足 **ShopIsolation**（不回錯窗、不用錯他店知識）；自動回覆以 **AutoReplyMaster** 為大門、**ShopAutoReply** 為店級開關，並以 **ShopAutoReplyHalt**／**CreditExhaustion**／**FailureHandoff** 區分整店停、全局點數耗盡與會話級接管。第一期上述行為均須真實生效，禁止僅 UI 展示。

## Status

accepted

## Considered Options

- **串店底線**：保證窗＋知識隔離；允許同 Chrome 多 Context；禁止同店雙 Instance 自動化。
- **排程**：第一期串行處理多店待回；逼近超時走 FailureHandoff，不承諾真並行。
- **停自動回 vs 關窗**：停 ShopAutoReply 不關窗；關窗／掉登才 Halt。
- **Halt 提醒**：卡片高亮＋店級提醒，不與買家 HandoffAlert 列表混用。
- **總閘 vs 店開關**：打開總閘不清除各店已停狀態。
- **點數耗盡**：關鍵詞非最終回覆；預警 → 單次失敗走 Handoff → 耗盡關總閘；TransferKeyword 短路仍可。
- **權限**：第一期登入桌面者權限相同。
- **去接待**：盡力聚焦店窗，失敗則提示店名。
- **範圍**：DeskUIPhase1 含本 ADR 全部行為真做；不做假開關。

## Consequences

- 需落地店級開關持久化、Halt 原因、與現有全局 `hasPaused` 的語義遷移（Master）。
- 驗收以「兩店同時值班不串、單店停其他店續跑、點數耗盡全體改人工」為業務準繩。
- 詞彙見 `CONTEXT.md`。
