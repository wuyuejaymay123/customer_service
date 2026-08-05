# 上游成功必須結算（計費安全底線）

堵住「DeepSeek 已計費但商戶 Wallet 未扣 Credit」與「流式漏 usage」兩類虧損：閘道在上游請求成功完成後一律 settle；默認非流式；缺 usage 時偏貴兜底並標註估算單；運營用 UsageRecord 與上游帳單人工對帳。

**Status:** accepted

## Considered Options

- **斷線／空內容**：上游 HTTP 成功且響應已完整解析後 → **必須 settle**；不得再 release。桌面斷線只影響是否寫回響應，不影響扣點。
- **傳輸形態**：閘道→上游 **強制 `stream: false`**。若代碼路徑出現 `stream: true`，必須同時帶 `stream_options.include_usage=true`，否則視為配置錯誤、不得當成功結算。
- **缺 usage**：仍 settle；對外 Credit 取 **預扣額（Reserve）滿額**（或等價偏貴估算），UsageRecord 標記 **UsageEstimated**，便於對帳篩查。
- **對帳**：記清 `cost_upstream`／估算標；運營後台匯總可查。不接 DeepSeek 帳單 API 自動對帳（一期）。

## Consequences

- 商戶可能「沒看到回覆仍被扣點」（斷線／空內容）；產品側用轉人工／失敗提示承接，計費以運營不虧為先。
- 舊行為「客戶端斷線則釋放預扣」廢止；需同步 CONTEXT（Reserve／UsageEstimated）。
- 部署後執行含 `usage_estimated` 列的 migrate。
