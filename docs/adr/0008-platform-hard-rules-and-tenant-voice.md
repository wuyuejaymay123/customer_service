# Prompt 分層：HardRules + TenantVoice

全平台行為底線（禁編造、禁露餡／勸轉人工、僅目錄內商品等）改為與 ModelSKU 脫鉤的 **PlatformHardRules**；商戶可在桌面維護可選 **TenantVoice**（公司一段、約 2k 字、可空、禁詞拒存），疊加於 HardRules 之上且**不可削弱**硬規則。第一版不做 ShopVoice。曾考慮整段 PlatformPrompt 仍掛 ModelSKU、或允許商戶覆蓋硬規則——分別因底線隨模型漂移、以及會重現亂編貨／勸轉人工而排除。
