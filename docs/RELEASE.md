# 客户端发版与更新（F03）

本产品**不连接**上游开源项目的自动更新源。商户获取新版本的唯一途径：**联系运营方领取安装包**。

## 运营侧发版步骤

1. 在干净环境构建桌面端：

```powershell
cd apps/desktop
pnpm install
pnpm run package
```

2. 产物在 `apps/desktop/release/`（以 electron-builder 实际输出为准）
3. 将安装包放到自有网盘／OSS／客户交付渠道
4. 在发版说明中写明版本号与变更摘要
5. 通知商户：卸载或覆盖安装；网关账户登录态可能需重登（token 过期时）

## 客户端表现

- 「关于」页：**不再**检查远程更新，文案为「请联系运营方获取更新」
- 若需强制升级，由运营停用旧商户／公告即可

## 与 Strategy 二进制

千牛所需 `__main__.exe` 不在 git 内，发版包须一并放入 `assets/backend/`（见 `USER_CHECKLIST.md`／`SMOKE_F02.md`）。
