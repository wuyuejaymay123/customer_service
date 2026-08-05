# DeepSeek 請求硬化（成本與風控）

對齊官方 Chat Completions 行為，收斂客服路徑的上游請求體：關閉思考模式、硬頂 `max_tokens`、固定走平台便宜檔 ModelSKU、暫不實作峰谷價差、帶租戶級 `user` 供上游風控。

**Status:** accepted

## Considered Options

- **Thinking**：客服回覆路徑強制 `thinking: { type: "disabled" }`，避免默認開啟思考模式產生 `reasoning_tokens` 額外成本。
- **輸出長度**：閘道強制 `max_tokens: 1024`；桌面／租戶不可覆寫。截斷仍按實際 usage settle（ADR-0012）。
- **ModelSKU**：只走 PlatformAdmin 配置的單一便宜檔（flash／現行 `deepseek-chat` 等價）；租戶不可自選 pro。官方改名時只改 SKU 字串與價目對齊。
- **峰谷定價**：一期**不做**時段價差；預扣／settle 一律用現行非高峰單價。正式生效且需對帳時另開議題。
- **`user` 欄位**：帶 `tenant:<tenantId>`，不暴露買家身分；便於上游濫用排查對到租戶。

## Consequences

- 長回覆可能被截斷（`finish_reason=length`）；客服場景可接受。
- 高峰時段若供應商加價，運營可能短暫承擔價差，直到上峰谷規則。
- 與 ADR-0012 併讀：傳輸形態仍強制非流式；成功後仍必須 settle。
