# 需你手动完成的步骤（统一清单）

以下事项无法由代理完全代劳（涉及你的密钥、平台账号、真实收发）。

## 1. 确认闸道在跑

打开：http://127.0.0.1:8787/admin/  
账号：`admin`／密码：首次 seed 的 `admin123`（登录后请改强密码）

```powershell
cd apps\gateway
docker compose up -d
$env:JWT_SECRET = "请换成强随机串"   # 生产必设，见 docs/PRODUCTION.md
npm run migrate
npm run seed
npm run dev
```

## 2. 配置智能回复模型

运营后台填写 DeepSeek（或兼容接口）密钥并「保存并启用」。

## 3. 开通商户

在运营后台「开通商户」，抄给商户管理员账号／密码；可充值、调账、改折扣、删除（需输入店名确认）。

店铺／卖点请在桌面端「设置 → 店铺知识」维护。

## 4. 硬门槛：拼多多＋千牛冒烟

见 `docs/SMOKE_F02.md`。须本机有 `__main__.exe`、真实扫码登录并完成至少一轮自动回复。

**此步未过不要对外售卖。**

## 5. 启动桌面端

```powershell
cd apps\desktop
pnpm start
```

网关账户登录一次即可（token 持久化，密码不落盘）。

## 6. 发版

见 `docs/RELEASE.md`：`pnpm run package` 后由运营方交付安装包。
