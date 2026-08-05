# DesktopConfig 同步契約（草案）

對應 ADR-0011。閘道表見 `apps/gateway/src/schema-desktop-config.sql`。  
桌面只經本契約 API；不上傳 Cookie／Session／Message／Instance 運行時狀態。

## 通用約定

| 項 | 約定 |
|----|------|
| Base | 既有閘道 origin（與 `/tenant/policy` 同機） |
| Auth | `Authorization: Bearer <jwt>`；`/tenant/*` 需 active Tenant |
| 角色 | GET／PUT 皆允許 `tenant_admin`、`operator`（配置掛 Tenant，不按 Operator 拆） |
| 成功 | `{ "success": true, "data": … }` |
| 失敗 | `{ "success": false, "message": "…" }`；可選 `code` |
| Body | 請求 camelCase；`data` 內版本字段用 `configVersion` |
| 版本 | 雲端單調遞增 `BIGINT`；從未寫過視為 `0` + 空默認 payload |
| 樂觀鎖 | PUT 必須帶客戶端已知的 `baseVersion`；僅當 `baseVersion === 雲端 config_version` 才寫入並 +1 |
| 409 | 版本不符；`data` 帶回當前雲端整包，客戶端覆蓋本機緩存後提示重試 |
| 離線 | 桌面禁止打開配置編輯；本契約假設在線 |

### 樂觀鎖 SQL 模式（三表相同）

```sql
-- 無行且 baseVersion = 0：INSERT … config_version = 1
-- 有行：UPDATE … SET payload = $payload, config_version = config_version + 1, updated_at = now()
--       WHERE tenant_id = $tid AND config_version = $baseVersion
-- rowCount = 0 → 409 CONFLICT（再 SELECT 當前行）
```

---

## 1. 回覆策略／桌面設置 — `tenant_desktop_settings`

### GET `/tenant/desktop-config/settings`

**Response `data`**

```json
{
  "configVersion": 0,
  "updatedAt": null,
  "payload": {
    "schemaVersion": 1,
    "general": {},
    "voice": ""
  }
}
```

- 無行時：`configVersion: 0`，`payload` 為上列默認（不強制 INSERT）。
- `payload.general`：對應本機 `n_config` 中**可同步**字段子集（見下）；未知鍵服務端原樣保存、客戶端可忽略。
- `payload.voice`：可與現有 `/tenant/voice` 對齊；第一期允許雙寫，以本包為 DesktopConfig 真相源，收斂時機另定。

**`general` 建議同步字段（草案，可增減）**

| 字段 | 說明 |
|------|------|
| `hasKeywordMatch` / `hasReplace` / `hasTransfer` | 開關 |
| `hasUseGpt` / `hasPaused` | 開關（運行時主閘仍以本機 AutoReplyMaster 為準，雲端只還原偏好） |
| `defaultReply` / `failureHandoffReply` | 文案 |
| `truncateWordCount` / `truncateWordKey` | 截斷 |
| `handoffCooldownSeconds` | 冷卻 |
| 其它純偏好且非密鑰 | 可進包 |

**明確排除**：API Key、本機路徑、窗口幾何、Cookie、平台登入態。

### PUT `/tenant/desktop-config/settings`

**Request**

```json
{
  "baseVersion": 0,
  "payload": {
    "schemaVersion": 1,
    "general": { "hasUseGpt": true, "defaultReply": "稍等，我帮您确认一下" },
    "voice": "语气礼貌简洁"
  }
}
```

**成功 `data`**：與 GET 相同形狀，`configVersion` 為寫入後新版本（如 `1`）。

**409**

```json
{
  "success": false,
  "message": "配置已被其他设备更新，请先拉取后再保存",
  "code": "CONFIG_VERSION_CONFLICT",
  "data": {
    "configVersion": 3,
    "updatedAt": "2026-08-05T05:00:00.000Z",
    "payload": {}
  }
}
```

---

## 2. 關鍵詞整包 — `tenant_keywords_bundle`

### GET `/tenant/desktop-config/keywords`

```json
{
  "configVersion": 1,
  "updatedAt": "…",
  "payload": {
    "schemaVersion": 1,
    "items": [
      {
        "id": "9b2c0e1a-….uuid",
        "keyword": "包邮|运费",
        "reply": "默认包邮，偏远除外",
        "mode": "keyword",
        "platformId": null,
        "shopId": null,
        "fuzzy": true,
        "hasRegular": false
      }
    ]
  }
}
```

| 字段 | 約定 |
|------|------|
| `id` | 穩定 UUID（換機不變）；本機 SQLite 可用映射表或直接存字串主鍵 |
| `mode` | 與現網一致：匹配／替換／轉接對應值（如 `keyword` / `replace` / `transfer`，以本機枚舉為準） |
| `shopId` | 產品為 Tenant 全店共用 → 固定 `null`；保留字段兼容舊數據 |
| `platformId` | 可選渠道過濾；全渠道則 `null` |

PUT 為**整包替換**（`items` 即雲端最終列表，刪除＝不出現在數組中）。

### PUT `/tenant/desktop-config/keywords`

```json
{
  "baseVersion": 1,
  "payload": {
    "schemaVersion": 1,
    "items": [ /* 完整列表 */ ]
  }
}
```

校驗（400）：`items` 必須為數組；單條 `id`／`keyword`／`reply`／`mode` 必填；建議硬上限（如 5000 條或 payload ≤ 2MB）防誤傳。

---

## 3. 店名冊 — `tenant_shop_roster`

### GET `/tenant/desktop-config/shop-roster`

```json
{
  "configVersion": 1,
  "updatedAt": "…",
  "payload": {
    "schemaVersion": 1,
    "items": [
      {
        "id": "local-or-uuid-stable",
        "displayName": "旗舰店A",
        "channel": "pinduoduo",
        "gatewayShopId": "uuid-of-shops-row-or-null",
        "externalKeys": [],
        "sortOrder": 0
      }
    ]
  }
}
```

| 字段 | 約定 |
|------|------|
| `id` | 名冊條目穩定 ID（UUID）；≠ Cookie／瀏覽器 profile |
| `gatewayShopId` | 對應閘道 `shops.id`；未綁定則 `null` |
| `externalKeys` | 掃碼／渠道可對上的鍵（與 `shops.external_keys` 對齊思路） |
| **禁止** | cookies、storageState、localStorage、瀏覽器路徑 |

掃碼規則（客戶端，非本 API）：雲名冊僅提示；渠道真身分以掃碼為準 → 對上則綁 `gatewayShopId`，對不上則改綁或新建 Shop；禁止用錯店知識回覆。

### PUT `/tenant/desktop-config/shop-roster`

同樂觀鎖整包替換；`baseVersion` + `payload`。

---

## 4. 可選：一次拉取

### GET `/tenant/desktop-config`

登入後少往返：

```json
{
  "success": true,
  "data": {
    "settings": { "configVersion": 1, "updatedAt": "…", "payload": {} },
    "keywords": { "configVersion": 2, "updatedAt": "…", "payload": { "items": [] } },
    "shopRoster": { "configVersion": 1, "updatedAt": "…", "payload": { "items": [] } }
  }
}
```

三包版本獨立；保存仍走各自 PUT。

---

## 5. 桌面行為對照（非閘道，供實作對齊）

| 時機 | 行為 |
|------|------|
| 登入成功 | `GET /tenant/desktop-config` → 寫入本機緩存；關鍵詞／策略 UI 以雲為準覆蓋 |
| 保存策略／關鍵詞／名冊 | 先寫本機緩存，再對應 PUT；409 → 用返回 `data` 覆蓋緩存並提示「已從雲端刷新，請重新修改後保存」 |
| 離線 | 配置頁只讀；不調 PUT |
| 掃碼 | 不靠名冊免登；名冊與掃碼衝突時以掃碼為準並可再 PUT 名冊 |

---

## 6. 與現有接口關係

| 現有 | 關係 |
|------|------|
| `/tenant/policy`、`/tenant/voice`、`/tenant/shops` | 知識／計費域仍用；DesktopConfig 不取代 `shops` 行上的 ShopProfile／賣點 |
| `shops` 表 | 雲知識與計費歸屬；名冊 `gatewayShopId` 指向它 |
| 本機 SQLite Session／Message | 永不進本契約 |

---

## 7. 遷移

1. `schema-desktop-config.sql` 已接入 `migrate.ts`；舊庫執行 `npm run migrate`（於 `apps/gateway`）即可建表。  
2. 新鮮 `schema.sql` 已含同 DDL（docker 空庫初始化）。  
3. 舊 Tenant 無行＝版本 0，首次保存即建立。

**本文件狀態**：閘道讀寫已實作；桌面已接（`desktopConfigSync.ts`：登入／`gateway:me` 拉取，策略／關鍵詞／名冊保存上傳，離線擋配置寫入）。字段／路徑變更時與 ADR-0011 同步修訂。
