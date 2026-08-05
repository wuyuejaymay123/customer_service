# 上游 API Key 只放伺服器環境變數

DeepSeek（及同類上游）的 API Key 不得再寫入 Supabase／`model_skus`；僅從閘道進程環境變數 `DEEPSEEK_API_KEY` 讀取。運營後台 ModelSKU 只配置 `base_url` 與 `model`。缺 key 時拒絕智能回覆且不預扣。切換時輪換上游 key 並清空庫內舊明文。

**Status:** accepted

## Considered Options

- **存放位置**：環境變數（採納）／繼續 DB 明文／雲 KMS（後期可升級）。
- **後台能力**：只配路由字段（採納）；允許後台填 key 但優先 env（易誤導，否決）。
- **缺 key**：硬失敗不預扣（採納）；回落 DB（否決）。

## Consequences

- 換 key 需改伺服器 `.env`（或 systemd Environment）並重啟 `cs-gateway`。
- 庫內 `model_skus.api_key` 列保留但應為空；migrate 會清空殘留明文。
- 部署清單與 `.env.example` 必須列出 `DEEPSEEK_API_KEY`。
