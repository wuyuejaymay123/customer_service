# 平台收發依賴上游 Strategy 二進位

拼多多／千牛等訊息收發不走官方客服 API，而依賴上游 `__main__.exe`（Socket.IO + UI 自動化）。第一版接受該黑盒：不自研 RPA。二進位不在 git 中（`assets/backend/*` 被忽略），需從上游 Release 取得。平台改版風險由該二進位承擔；正式擔保渠道僅 SupportedChannel。

**Status:** accepted
