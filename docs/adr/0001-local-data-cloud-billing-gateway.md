# 本機業務資料 + 雲端計費閘道

電商客服**對話全文**留在客戶 Windows 本機 SQLite；AI 一律經運營方 LLM Gateway，並以 Tenant Wallet／Credit 計費。這樣差價變現與隱私邊界分離：對話主數據不上雲，變現點集中在閘道。

**Status:** accepted（**Keyword／桌面策略雲同步**見 ADR-0011，部分修正本 ADR 早期「關鍵詞不上雲」假設；Session／Message 不上雲仍成立）
