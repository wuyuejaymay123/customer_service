# 按 Shop 隔離知識，Keyword 注入、AI 成稿

一 Tenant 下多拼多多／千牛店，賣點與話術須按 **Shop** 隔離，禁止串店。商品賣點掛 **ShopGoodsNote**（GoodsMatchKey：先 ID 後別名），整店政策為 **ShopProfile**，公司共通為 **TenantPolicy**（店可覆寫）。回覆管線改為：Keyword 與店／商品知識一併注入閘道，**由 AI 生成最終回覆**（轉人工等硬規則可短路），廢棄「Keyword 優先於 GPT 直接回」。維護以閘道 Web Admin 為主；桌面負責 Instance↔Shop 綁定。

**Status:** accepted

**Considered Options:** 以 Instance 當店；純自由文本 TenantKnowledge；Keyword 直接回覆。均因串店／串款或與「互補」目標不符而捨棄。
