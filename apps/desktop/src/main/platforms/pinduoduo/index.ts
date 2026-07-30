import { JSDOM } from 'jsdom';
import { BrowserContext, Page, ElementHandle, Locator } from 'playwright';
import { StrategyLifecycle } from '../base';
import {
  CTX_USERNAME,
  CTX_ORDER_STATUS,
  CTX_ORDER_ID,
  CTX_CURRENT_GOODS,
  CTX_ORDER_AMOUNT,
  CTX_GOODS_SPEC,
} from '../../backend/constants';
import {
  StrategyInfo,
  LifecycleStateEnum,
  PlatformTypeEnum,
  MessageDTO,
  Context,
  GenericConfig,
  RoleTypeEnum,
  MsgTypeEnum,
  EnvironmentTypeEnum,
  ILogger,
  IGetReplyFunc,
  IGetDefaultReplyFunc,
  IGetGenericConfigFunc,
} from '../../backend/types';
import { randomString } from '../../utils';
import { matcheTargetUrl, uploadFile } from '../../utils/playwright';
import G_V from '../globalState';

export class Pinduoduo extends StrategyLifecycle {
  page!: Page;

  instance_id: number;

  log!: ILogger;

  status!: LifecycleStateEnum;

  context: BrowserContext;

  url = 'https://mms.pinduoduo.com/chat-merchant/index.html';

  waitUrls = [
    'https://mms.pinduoduo.com/chat-merchant/index*',
    'https://mms.pinduoduo.com/login*',
  ];

  private initPageCounter: number = 0;

  private maxInitAttempts: number = 3;

  constructor(
    context: BrowserContext,
    instance_id: number,
    log: ILogger,
    private getConfig: IGetGenericConfigFunc,
    private getReply: IGetReplyFunc,
    private getDefReply: IGetDefaultReplyFunc,
    private markTransferResult?: (ctx: Context, ok: boolean) => void,
  ) {
    super();
    this.context = context;
    this.instance_id = instance_id;
    this.log = log;
    this.getConfig = getConfig;
    this.getReply = getReply;
    this.getDefReply = getDefReply;
    this.markTransferResult = markTransferResult;
  }

  static info(): StrategyInfo {
    return {
      id: 'pinduoduo',
      type: PlatformTypeEnum.E_COMMERCE,
      name: '拼多多',
      avatar: 'https://mms.pinduoduo.com/login/favicon.ico',
      desc: '拼多多商家后台',
      env: EnvironmentTypeEnum.WEB,
      impl: true,
    };
  }

  initParams() {
    this.status = LifecycleStateEnum.START;
    this.initPageCounter = 0;
  }

  async init() {
    if (this.initPageCounter >= this.maxInitAttempts) {
      // 不关页（避免触发外层重开循环）；导回客服页并重置计数
      this.initPageCounter = 0;
      try {
        await this.page.goto(this.url);
      } catch (e) {
        this.log.warn(`拼多多导回客服页失败：${e}`, this.getLogInstance());
      }
      return;
    }

    const currentUrl = this.page.url();
    const targetUrl = this.url;
    const foundTargetUrl = currentUrl.includes(targetUrl);

    if (foundTargetUrl) {
      this.initPageCounter = 0;
      this.status = LifecycleStateEnum.RUN;
    } else if (this.waitUrls.some((url) => matcheTargetUrl(url, currentUrl))) {
      this.initPageCounter = 0;
      await this.page.waitForTimeout(1000); // 等待 1 秒
      this.log.info('等待用户登录拼多多中...', this.getLogInstance());
    } else {
      this.initPageCounter += 1;
      await this.page.waitForTimeout(2000); // 等待 2 秒
    }
  }

  async stepRun() {
    await this.checkCurrentUrlAndSwitch();
    await this.checkOtherButtons();
    await this.handleMessage();
    await this.handleCustomersNotifications();
  }

  /** 供 WebStrategyService 更新实例店名／登录状态 */
  async probeShopMeta(): Promise<{
    loginStatus: 'pending' | 'logged_in' | 'unknown';
    shopName: string | null;
  }> {
    try {
      if (!this.page || this.page.isClosed()) {
        return { loginStatus: 'unknown', shopName: null };
      }
      const url = this.page.url();
      if (url.includes('/login')) {
        return { loginStatus: 'pending', shopName: null };
      }
      if (!url.includes('chat-merchant')) {
        return { loginStatus: 'unknown', shopName: null };
      }

      const selectors = [
        '.user-name',
        '.mall-info .name',
        '.shop-name',
        '.header-user-name',
        '[class*="mallName"]',
        '[class*="shop-name"]',
        '.nickname',
      ];
      let shopName: string | null = null;
      for (const sel of selectors) {
        const loc = this.page.locator(sel).first();
        // eslint-disable-next-line no-await-in-loop
        if ((await loc.count()) > 0) {
          // eslint-disable-next-line no-await-in-loop
          const text = (await loc.innerText().catch(() => '')).trim();
          if (text && text.length < 40) {
            shopName = text;
            break;
          }
        }
      }
      return { loginStatus: 'logged_in', shopName };
    } catch {
      return { loginStatus: 'unknown', shopName: null };
    }
  }

  isPageClosedError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes('Target page, context or browser has been closed') ||
        error.message.includes('has been closed'))
    );
  }

  async handleCustomersNotifications() {
    const elements = await this.page
      .locator('.chat-portrait > i')
      .elementHandles();

    const visibleElements: ElementHandle<Node>[] = [];

    for (const element of elements) {
      const isVisible = await element.evaluate((el) => {
        return window.getComputedStyle(el as Element).display !== 'none';
      });

      if (isVisible) {
        visibleElements.push(element);
      }
    }

    if (visibleElements.length > 0) {
      this.log.debug(
        `策略 ${Pinduoduo.info().name} 获取到新用户 ${visibleElements.length} 个....`,
        this.getLogInstance(),
      );

      const elementsToHandle = visibleElements.slice(0, 3); // 最多只处理 3 个消息
      for (const element of elementsToHandle) {
        const parentElementHandle = await element.evaluateHandle(
          (el) => el.parentElement,
        );

        const parentElement = parentElementHandle.asElement(); // 转换为 ElementHandle

        if (parentElement) {
          try {
            const isDisabled = await parentElement.evaluate(
              (el) => (el as HTMLButtonElement).disabled,
            );
            if (!isDisabled) {
              try {
                await parentElement.click({ timeout: 3000, force: true });
              } catch (e) {
                console.error(`点击用户消息失败：${e}`);
              } finally {
                await this.page.waitForTimeout(1000);
                await this.handleMessage();
              }
            }
          } catch (e) {
            this.log.error(`点击用户消息失败：${e}`, this.getLogInstance());
          }
        }
      }
    }
  }

  async handleMessage() {
    this.log.debug(`策略 ${Pinduoduo.info().name} 开始处理消息....`);

    const messageBox = this.page.locator('.msg-list');
    if (!(await messageBox.first().isVisible())) return;

    const cachedHtml = await messageBox.innerHTML();
    const dom = new JSDOM(cachedHtml);
    const doc = dom.window.document;

    const messageEles = Array.from(doc.querySelectorAll('.onemsg'));
    if (messageEles.length === 0) {
      return;
    }

    const lastSomeMessages = await this.getSomeMessages(messageEles);
    const lastMessage = await this.getLastMessage(lastSomeMessages);
    if (!lastMessage) return;

    const rl = await this.checkRole(lastMessage);
    if (rl === RoleTypeEnum.SELF) return;

    const messages: MessageDTO[] = [];
    const recentMessages = lastSomeMessages.slice(-G_V.contextCount);

    const ctx = await this.getContext();
    if (!ctx) return;

    for (const message of recentMessages) {
      const role = await this.checkRole(message);
      const { content: contentVal, type: msgType } =
        await this.extractContent(message);

      if (contentVal.trim() === '') {
        continue;
      }

      messages.push({
        sender: ctx.get(CTX_USERNAME) || '',
        role,
        content: contentVal,
        type: msgType,
      });
    }

    let reply = await this.getReply(ctx, messages);
    const chatInput = this.page.locator("[id='replyTextarea']");
    if (!(await chatInput.first().isVisible())) return;

    await chatInput.focus();
    await this.page.waitForTimeout(1000);

    const cfg = await this.getConfig(Pinduoduo.info().id, this.instance_id);

    if (reply.type === MsgTypeEnum.IMAGE) {
      try {
        await uploadFile(this.page, "input[type='file']", reply.content);
        await this.page.waitForTimeout(2000);
        const uploadBtn = this.page.locator('.modal-box>.modal-footer>.btn-ok');
        if (!(await uploadBtn.first().isVisible())) return;
        await uploadBtn.first().click();
        await this.page.waitForTimeout(1000);
        return;
      } catch (e) {
        this.log.error(`发送图片失败：${e}`, this.getLogInstance());
        reply = await this.getDefReply(ctx);
      }
    }

    if (reply.type === MsgTypeEnum.TRANSFER) {
      this.log.info(
        `策略 ${Pinduoduo.info().name} 开始转接会话....`,
        this.getLogInstance(),
      );

      const replyContent = reply.content || cfg.defaultTransferReply || '';
      // 有正文则先发安抚（FailureHandoff／规则转人工），不依赖 hasTransferReply 开关
      if (replyContent.trim() && replyContent.trim() !== '无') {
        try {
          await this.sendReply(replyContent, chatInput);
        } catch (e) {
          this.log.error(
            `转接前安抚发送失败：${e}`,
            this.getLogInstance(),
          );
        }
      } else if (cfg.hasTransferReply && (cfg.defaultTransferReply || '').trim()) {
        await this.sendReply(cfg.defaultTransferReply || '', chatInput);
      }

      try {
        await this.transferChat(cfg);
        this.markTransferResult?.(ctx, true);
      } catch (e) {
        this.log.error(`转接失败：${e}`, this.getLogInstance());
        this.markTransferResult?.(ctx, false);
      }
      return;
    } else if (reply.type === MsgTypeEnum.NO_REPLY) {
      return;
    }

    try {
      await this.sendReply(reply.content, chatInput);
    } catch (e) {
      this.log.error(`发送回复失败：${e}`, this.getLogInstance());
      const handoff = await this.getDefReply(ctx);
      if (handoff.type === MsgTypeEnum.TRANSFER) {
        reply = handoff;
        const replyContent = reply.content || '';
        if (replyContent.trim() && replyContent.trim() !== '无') {
          try {
            await this.sendReply(replyContent, chatInput);
          } catch {
            // ignore
          }
        }
        try {
          await this.transferChat(cfg);
          this.markTransferResult?.(ctx, true);
        } catch (te) {
          this.log.error(`转接失败：${te}`, this.getLogInstance());
          this.markTransferResult?.(ctx, false);
        }
      }
    }
  }

  async sendReply(content: string, chatInput: Locator) {
    const sentences = this.splitText(
      content,
      G_V.truncateWordCount,
      G_V.truncateWordKey,
    );

    for (const sentence of sentences) {
      const cleanSentence = sentence
        .replace('\n', '')
        // eslint-disable-next-line no-control-regex
        .replace(/[^\u0000-\uFFFF]/g, ''); // 移除非BMP字符

      await chatInput.fill(cleanSentence);
      await chatInput.press('Enter');
      await this.page.waitForTimeout(1000);
    }

    const sendBtn = this.page.locator('.reply-footer .send-btn');
    if (await sendBtn.first().isVisible()) {
      await sendBtn.first().click();
    } else {
      await chatInput.press('Enter');
    }
  }

  splitText(text: string, maxLength: number, keyword: string): string[] {
    const segments = keyword
      ? text
          .split(keyword)
          .map((seg) => seg + keyword)
          .filter((seg) => seg)
      : Array.from({ length: Math.ceil(text.length / maxLength) }, (_, i) =>
          text.slice(i * maxLength, (i + 1) * maxLength),
        );

    const result: string[] = [];
    let currentSegment = '';

    for (const segment of segments) {
      if (currentSegment.length + segment.length <= maxLength) {
        currentSegment += segment;
      } else {
        result.push(currentSegment);
        currentSegment = segment;
      }
    }

    if (currentSegment) result.push(currentSegment);
    return result;
  }

  async getSession(): Promise<string | null> {
    // 先检查是否是 .base-info .remark-row span 的值为 点击添加备注信息
    const remarkRow = this.page.locator('.base-info .remark-row span');
    const remark = await remarkRow.first().innerText();
    if (remark.trim() === '点击添加备注信息') {
      // 如果是则需要随机生成一个
      const randomRemark = randomString(6);
      // 先点击 remark-row
      await remarkRow.first().click();
      // 等待 500 毫秒
      await this.page.waitForTimeout(500);
      // .remark-row-edit input
      const remarkInput = this.page.locator('.remark-row-edit input');
      if (await remarkInput.first().isVisible()) {
        await remarkInput.first().fill(randomRemark);
        await this.page.waitForTimeout(500);
        await remarkInput.first().press('Enter');
      }

      return randomRemark;
    }

    // 返回备注信息
    return remark.trim();
  }

  async getContext(): Promise<Context | null> {
    const usn = await this.getSession();
    if (!usn) return null;

    const ctx = this.createCtx();
    ctx.set(CTX_USERNAME, usn);

    await this.extractInfoFromRightPanel(ctx);

    const tabBox = this.page.locator("[class='bar-box four-tab']");
    if (!(await tabBox.count())) {
      return ctx;
    }

    // 获取 bar-item bar-select
    const activeTab = tabBox.locator('.bar-item.bar-select');
    if (
      !(await activeTab.count()) ||
      (await activeTab.innerText()) !== '最新订单'
    ) {
      const tabs = tabBox.locator('.bar-item');
      if (!(await tabs.count())) {
        return ctx;
      }

      // 找到最新订单 tab
      const latestOrderTab = tabs.locator('text=最新订单');
      if (await latestOrderTab.count()) {
        await latestOrderTab.first().click();
        await this.page.waitForTimeout(1000);
      }
    }

    const orderPanel = this.page.locator(
      "[class='order-panel-second-bar bar-select']",
    );
    if (!(await orderPanel.count())) {
      return ctx;
    }

    // 检查是否是 ‘个人订单’
    if ((await orderPanel.innerText()) !== '个人订单') {
      const orderTabs = orderPanel.locator('.order-panel-second-bar');
      if (!(await orderTabs.count())) {
        return ctx;
      }

      // 找到个人订单 tab
      const personalOrderTab = orderTabs.locator('text=个人订单');
      if (await personalOrderTab.count()) {
        await personalOrderTab.first().click();
        await this.page.waitForTimeout(1000);
      }
    }

    // order-panel-third-bar i-line bar-select
    const orderTypePanel = this.page.locator(
      '.order-panel-third-bar.i-line.bar-select',
    );
    if (!(await orderTypePanel.count())) {
      return ctx;
    }

    if ((await orderTypePanel.innerText()) !== '全部') {
      const orderTypeTabs = orderTypePanel.locator(
        '.order-panel-third-bar.i-line',
      );
      if (!(await orderTypeTabs.count())) {
        return ctx;
      }

      // 找到全部 tab
      const allTab = orderTypeTabs.locator('text=全部');
      if (await allTab.count()) {
        await allTab.first().click();
        await this.page.waitForTimeout(1000);
      }
    }

    // 尝试获取订单信息 .order-item
    const orderItem = this.page.locator('.order-item');
    if (await orderItem.count()) {
      const orderInfo = orderItem;
      if (!orderInfo) {
        return ctx;
      }

      // .title-status
      const status = await orderInfo.locator('.title-status').innerText();
      if (status) {
        ctx.set(CTX_ORDER_STATUS, status);
      }

      // .order-sn
      const orderSn = await orderInfo.locator('.order-sn').innerText();
      if (orderSn) {
        ctx.set(CTX_ORDER_ID, orderSn);
      }

      // .goods-name
      const goodsName = await orderInfo.locator('.goods-name').innerText();
      if (goodsName) {
        ctx.set(CTX_CURRENT_GOODS, goodsName);
      }

      // .line-value.amount-value
      const price = await orderInfo
        .locator('.line-value.amount-value')
        .innerText();
      if (price) {
        ctx.set(CTX_ORDER_AMOUNT, price);
      }

      // .goods-spec
      const goodsSpec = await orderInfo.locator('.goods-spec').innerText();
      if (goodsSpec) {
        ctx.set(CTX_GOODS_SPEC, goodsSpec);
      }
    }

    return ctx;
  }

  private async extractInfoFromRightPanel(ctx: Context) {
    const tabBox = this.page.locator("[class='bar-box four-tab']");
    if (!(await tabBox.count())) {
      return ctx;
    }

    // 获取 bar-item bar-select
    const activeTab = tabBox.locator('.bar-item.bar-select');
    if (
      !(await activeTab.count()) ||
      (await activeTab.innerText()) !== '商品推荐'
    ) {
      const tabs = tabBox.locator('.bar-item');
      if (!(await tabs.count())) {
        return ctx;
      }

      // 找到最新商品信息 tab
      const latestOrderTab = tabs.locator('text=商品推荐');
      if (await latestOrderTab.count()) {
        await latestOrderTab.first().click();
        await this.page.waitForTimeout(500);
      }
    }

    const goodsTypes = this.page.locator('.goods-types-category-ctn');
    const goodsType = this.page.locator('.one-category.category-selected');
    // 如果不是 浏览足迹 则点击
    if (
      !(await goodsType.count()) ||
      !(await goodsType.innerText()).includes('浏览足迹')
    ) {
      // 找到浏览足迹 tab
      const browseTab = goodsTypes.locator('text=浏览足迹');
      if (await browseTab.count()) {
        await browseTab.first().click();
        await this.page.waitForTimeout(500);
      }
    }

    // .goods-header-content .goods-name
    const goodsName = this.page.locator('.goods-header-content .goods-name');
    if (await goodsName.count()) {
      // 可能有多个商品，只取第一个
      const name = await goodsName.first().innerText();
      ctx.set(CTX_CURRENT_GOODS, name);
    }

    return ctx;
  }

  async checkCurrentUrlAndSwitch() {
    const currentUrl = this.page.url();
    const targetUrl = this.url;

    if (this.waitUrls.some((url) => matcheTargetUrl(url, currentUrl))) {
      if (!currentUrl.includes(targetUrl)) {
        this.status = LifecycleStateEnum.INIT;
      }
    } else {
      // 离开允许路径时导回客服页，不要 stop() 关页（会触发外层弹窗循环）
      this.log.warn(
        `拼多多页面离开允许路径（${currentUrl}），导回客服页`,
        this.getLogInstance(),
      );
      this.status = LifecycleStateEnum.START;
      try {
        await this.page.goto(this.url);
      } catch (e) {
        this.log.warn(`导回客服页失败：${e}`, this.getLogInstance());
      }
    }
  }

  async checkOtherButtons() {
    const guideBtn = this.page.locator(
      '.fullscreen-dialog-manager .secondary-btn',
    );

    if (await guideBtn.first().isVisible()) {
      await guideBtn.first().click();
      await this.page.waitForTimeout(1000);
    }

    const notifyBtn = this.page.locator('.modal .cancel');
    if (await notifyBtn.first().isVisible()) {
      await notifyBtn.first().click();
      await this.page.waitForTimeout(1000);
    }
  }

  async getSomeMessages(messages: Element[]): Promise<Element[]> {
    // 过滤掉 [class*='system-msg'] 的消息
    const someMessages = messages.filter((message) => {
      const systemMsg = message.querySelector('.system-msg');
      return !systemMsg;
    });

    return someMessages;
  }

  async getLastMessage(messages: Element[]): Promise<Element | null> {
    // 倒序查找，找到第一个包 .msg-content 的消息
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const msgContent = message.querySelector('.msg-content');
      if (msgContent) {
        return message;
      }
    }

    return null;
  }

  async checkRole(message: Element): Promise<RoleTypeEnum> {
    // # 包含 .buyer-item 的是顾客的消息
    const buyerItem = message.querySelector('.buyer-item');
    if (buyerItem) {
      return RoleTypeEnum.OTHER;
    }

    const csItem = message.querySelector('.cs-item');
    if (csItem) {
      return RoleTypeEnum.SELF;
    }

    return RoleTypeEnum.SYSTEM;
  }

  async extractContent(message: Element): Promise<{
    content: string;
    type: MsgTypeEnum;
  }> {
    const contentEle = message.querySelector('.msg-content');
    if (!contentEle) {
      // 如果不存在对话消息内容，那么说明它可能是系统消息
      const systemMsg = await this.extractSystemCard(message);
      if (!systemMsg) {
        return { content: '', type: MsgTypeEnum.TEXT };
      }

      return {
        content: systemMsg,
        type: MsgTypeEnum.TEXT,
      };
    }

    const contentClass = contentEle.getAttribute('class');

    // 先检查是否是图片消息
    if (contentClass && contentClass.includes('image-msg')) {
      const imgEle = contentEle.querySelector('img');
      if (imgEle) {
        return {
          content: imgEle.getAttribute('src') || '',
          type: MsgTypeEnum.IMAGE,
        };
      }

      return { content: '', type: MsgTypeEnum.IMAGE };
    }

    // 再检查是否是商品卡片
    if (contentClass && contentClass.includes('good-card')) {
      return {
        content: await this.extractGoodsCard(message),
        type: MsgTypeEnum.TEXT,
      };
    }

    // 再检查是否是订单卡片
    if (contentClass && contentClass.includes('order-card')) {
      return {
        content: await this.extractOrderCard(message),
        type: MsgTypeEnum.TEXT,
      };
    }

    // 再检查是否是售后申请卡片
    if (contentClass && contentClass.includes('lego-card')) {
      return {
        content: await this.extractLegoCard(message),
        type: MsgTypeEnum.TEXT,
      };
    }

    // 检查是否是模板消息
    if (contentClass && contentClass.includes('.msg-content-group')) {
      return {
        content: await this.extractTemplateCard(message),
        type: MsgTypeEnum.TEXT,
      };
    }

    const contentBox = contentEle.querySelector('.msg-content-box');
    if (contentBox) {
      return { content: contentBox.textContent || '', type: MsgTypeEnum.TEXT };
    }

    return { content: contentEle.textContent || '', type: MsgTypeEnum.TEXT };
  }

  async extractTemplateCard(message: Element): Promise<string> {
    // .msg-c-withimg-title 说明是什么信息
    const title = message.querySelector('.msg-c-withimg-title');

    // .template-list .right 备注内容
    const right = message.querySelector('.template-list .right');

    if (title && right) {
      return `${title.textContent}: ${right.textContent}`;
    }

    const fullContent = message.textContent || '';
    let content = fullContent.trim();
    content = content.replace(/复制/g, '');
    content = content.replace(/查看详情/g, '');
    content = content.replace(/商品详情/g, '');

    return content;
  }

  async extractLegoCard(message: Element): Promise<string> {
    const applyConsultation = message.querySelector('.applyConsultation');
    if (applyConsultation) {
      const infoItems = Array.from(
        applyConsultation.querySelectorAll('.info_item'),
      );
      if (infoItems.length === 0) {
        return '[未知消息]';
      }

      let content = '咨询售后信息：\n';
      for (const infoItem of infoItems) {
        const key = infoItem.querySelector('.left');
        const value = infoItem.querySelector('.text-value');
        if (key && value) {
          content += `* ${key.textContent}: ${value.textContent}\n`;
        }
      }

      return content;
    }

    // .refundSuccessCard
    const refundSuccessCard = message.querySelector('.refundSuccessCard');
    if (refundSuccessCard) {
      let content = '退款成功信息：\n';
      const title = refundSuccessCard.querySelector('.title .text');
      if (title) {
        content += `* ${title.textContent}\n`;
      }

      const goodsName = refundSuccessCard.querySelector('.info .goods_name');
      if (goodsName) {
        content += `* 商品名称：${goodsName.textContent}\n`;
      }

      return content;
    }

    return '[未知消息]';
  }

  async extractGoodsCard(goodCard: Element): Promise<string> {
    let content = '咨询商品信息：\n';
    const goodId = goodCard.querySelector('.good-id');
    if (goodId) {
      // 商品ID：123456
      const id = goodId.textContent || '';
      content += `* 商品ID：${id.replace('商品ID：', '').trim()}\n`;
    }

    const goodName = goodCard.querySelector('.good-name');
    if (goodName) {
      content += `${`* 商品名称：${(goodName.textContent || '').trim()}\n`}`;
    }

    return content;
  }

  async extractOrderCard(orderCard: Element): Promise<string> {
    let content = '咨询订单信息：\n';
    const orderSn = orderCard.querySelector('.order-id');
    if (orderSn) {
      // 订单编号：240905-282748536433671
      const id = orderSn.textContent || '';
      content += `${`* 订单编号：${id.replace('订单编号：', '').trim()}\n`}`;
    }

    const afterSaleStatus = orderCard.querySelector('.aftersale-status');
    if (afterSaleStatus) {
      const status = afterSaleStatus.textContent || '';
      content += `${`* 售后状态：${status.trim()}\n`}`;
    }

    const orderStatus = orderCard.querySelector('.order-status');
    if (orderStatus) {
      const status = orderStatus.textContent || '';
      content += `${`* 订单状态：${status.trim()}\n`}`;
    }

    const goodName = orderCard.querySelector('.good-name');
    if (goodName) {
      content += `${`* 商品名称：${(goodName.textContent || '').trim()}\n`}`;
    }

    return content;
  }

  async extractSystemCard(message: Element): Promise<string> {
    const notifyCard = message.querySelector('.notify-card');
    if (notifyCard) {
      const title = notifyCard.querySelector('.title');
      if (title) {
        return title.textContent || '';
      }

      return `[系统通知消息] ${notifyCard.textContent}`;
    }

    return '';
  }

  async transferChat(cfg: GenericConfig) {
    const transferChatBtn = this.page.locator('.transfer-chat-wrap');

    // 有可能已经打开了转接窗口，如果没有打开，点击转接按钮
    if (await transferChatBtn.first().isVisible({ timeout: 1000 })) {
      try {
        await transferChatBtn.first().click({
          timeout: 1000,
          force: true,
        });
      } catch (e) {
        console.error(`点击转接按钮失败：${e}`);
      }
      await this.page.waitForTimeout(1000); // 等待 1 秒
    }

    // 检查是否有转交的用户
    if ((cfg.transferReplyMatch || '').trim()) {
      // 如果有，则先输入转交的用户名称
      const transferInput = this.page.locator(
        '.tranform-chat-dialog .search-box .el-input input',
      );

      if (await transferInput.first().isVisible()) {
        await transferInput.first().fill(cfg.transferReplyMatch || '');
        await this.page.waitForTimeout(500); // 等待
      }
    }

    const transferChatItems = this.page.locator('.el-table__row');
    const count = await transferChatItems.count();
    if (count <= 0) {
      throw new Error('转接列表为空，无人可转');
    }

    // TODO: 后续添加过滤逻辑
    // .el-table_1_column_1 > .cell 是账号名称
    // .el-table_1_column_2 > .cell 是昵称

    // item-btn-transfer el-popover__reference
    const btn = this.page.locator('.item-btn-transfer.el-popover__reference');
    if (!(await btn.first().isVisible())) {
      throw new Error('未找到可点击的转接按钮');
    }
    await btn.first().click();
    await this.page.waitForTimeout(1000); // 等待 1 秒

    // 选择第一个原因选项
    const transferBtn = this.page
      .locator(
        'div[aria-hidden="false"] .transfer-remark-list .trasnfer-remark-item',
      )
      .first();
    if (await transferBtn.first().isVisible()) {
      await transferBtn.first().click();
      await this.page.waitForTimeout(1000); // 等待 1 秒
    }

    await this.page.waitForTimeout(1000); // 等待 1 秒
  }
}
