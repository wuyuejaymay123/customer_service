import fs from 'fs/promises';
import { KeywordReplyController } from '../controllers/keywordReplyController';
import {
  MessageDTO,
  ReplyDTO,
  Context,
  MessageType,
  LLMConfig,
} from '../types';
import { Config } from '../entities/config';

import {
  CTX_APP_ID,
  CTX_CURRENT_GOODS,
  CTX_CURRENT_GOODS_ID,
  CTX_MEMBER_TAG,
  CTX_FAN_TAG,
  CTX_NEW_CUSTOMER_TAG,
  CTX_INSTANCE_ID,
  CTX_SHOP_HINT,
  CTX_SHOP_ID,
  CTX_KEYWORD_HINTS,
} from '../constants';
import { Instance } from '../entities/instance';
import {
  rangeMatch,
  specialTokenReplace,
  replaceKeyword,
} from '../../utils/strings';
import {
  ErnieAI,
  GeminiAI,
  HunYuanAI,
  MinimaxAI,
  OpenAI,
  QWenAI,
  SparkAI,
  VYroAI,
  DifyAI,
} from '../../gptproxy';
import { LoggerService } from './loggerService';
import { HandoffService, sessionKeyFromCtx } from './handoffService';

export class MessageService {
  private llmClientMap: Map<
    string,
    | ErnieAI
    | GeminiAI
    | HunYuanAI
    | MinimaxAI
    | OpenAI
    | QWenAI
    | SparkAI
    | VYroAI
    | DifyAI
  >;

  private onCreditExhausted?: () => Promise<void>;

  private creditExhaustHandled = false;

  constructor(
    private log: LoggerService,
    private autoReplyController: KeywordReplyController,
    private handoff?: HandoffService,
  ) {
    this.log = log;
    this.autoReplyController = autoReplyController;

    this.llmClientMap = new Map();
  }

  public setCreditExhaustedHandler(fn: () => Promise<void>) {
    this.onCreditExhausted = fn;
  }

  private isCreditExhaustError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /点数|用量不足|余额不足|credit|402/i.test(msg);
  }

  private async handleCreditExhaustion(error: unknown): Promise<void> {
    if (!this.isCreditExhaustError(error) || this.creditExhaustHandled) return;
    this.creditExhaustHandled = true;
    try {
      if (this.onCreditExhausted) {
        await this.onCreditExhausted();
      }
    } catch (e) {
      console.warn('credit exhaustion handler failed', e);
    }
  }

  /**
   * 历史 API：不再把 default_reply 发给买家。
   * 若仍被调用，一律返回不露馅安抚语。
   */
  public async getDefaultReply(cfg: Config): Promise<ReplyDTO> {
    const comfort =
      (cfg.failure_handoff_reply || '').trim() || '稍等，我帮您找同事看一下';
    return {
      type: 'TEXT' as MessageType,
      content: comfort,
    };
  }

  /**
   * 获取回复
   * @param cfg
   * @param ctx
   * @param messages
   * @returns
   */
  public async getReply(
    cfg: Config,
    ctx: Context,
    messages: MessageDTO[],
  ): Promise<ReplyDTO> {
    if (this.handoff?.isInCooldown(ctx)) {
      this.log.info('会话在接管冷却中，跳过自动回复');
      return { type: 'NO_REPLY' as MessageType, content: '' };
    }

    const sessionKey = sessionKeyFromCtx(ctx);
    const epoch = this.handoff?.bumpEpoch(sessionKey) ?? 0;
    const comfort = this.handoff
      ? this.handoff.getComfortReply(cfg.failure_handoff_reply)
      : '稍等，我帮您找同事看一下';
    const cooldownMs =
      this.handoff?.getCooldownMs(cfg.handoff_cooldown_seconds) ?? 900000;
    const timeoutMs =
      this.handoff?.getTimeoutMs(cfg.wait_humans_time) ?? 60000;

    const lastUserMsg = messages
      .slice()
      .reverse()
      .find((msg) => msg.role === 'OTHER');

    await this.ensureShopContext(ctx);

    if (lastUserMsg && cfg.has_transfer) {
      const isTransfer = await this.matchTransferKeyword(ctx, lastUserMsg);
      if (isTransfer) {
        this.log.info('需要转接（规则）');
        this.handoff?.raise({
          ctx,
          reason: '规则转人工',
          reasonCode: 'rule_transfer',
          cooldownMs,
          transferAttempted: true,
          transferOk: null,
        });
        return {
          type: 'TRANSFER' as MessageType,
          content: comfort,
        };
      }
    }

    const abort = new AbortController();
    const buildPromise = this.buildAutoReply(
      cfg,
      ctx,
      messages,
      lastUserMsg,
      abort.signal,
    );

    const reply = await Promise.race([
      buildPromise.then((r) => ({ kind: 'ok' as const, r })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
      }),
    ]);

    if (this.handoff && !this.handoff.isEpochCurrent(sessionKey, epoch)) {
      abort.abort();
      return { type: 'NO_REPLY' as MessageType, content: '' };
    }

    if (reply.kind === 'timeout') {
      // 取消闸道请求：服务端应释放预扣、不结算扣点
      abort.abort();
      this.handoff?.bumpEpoch(sessionKey);
      this.handoff?.raise({
        ctx,
        reason: `回复超时（${Math.round(timeoutMs / 1000)} 秒），请立刻接管`,
        reasonCode: 'timeout',
        cooldownMs,
        transferAttempted: true,
        transferOk: null,
      });
      // 忽略迟到的 build 结果
      buildPromise.catch(() => undefined);
      return { type: 'TRANSFER' as MessageType, content: comfort };
    }

    const result = reply.r;
    if (
      !result ||
      (result.type === 'TEXT' && !String(result.content || '').trim())
    ) {
      this.handoff?.raise({
        ctx,
        reason: '未能生成可发送回复，请立刻接管',
        reasonCode: 'reply_failure',
        cooldownMs,
        transferAttempted: true,
        transferOk: null,
      });
      return { type: 'TRANSFER' as MessageType, content: comfort };
    }

    // 禁止把推诿／露馅／劝转人工句发给买家
    if (
      result.type === 'TEXT' &&
      /消息有点多|稍后再回复|稍后再回|系统繁忙|机器人|智能客服|AI客服|转人工/.test(
        String(result.content || ''),
      )
    ) {
      this.log.warn(`拦截禁止话术，改走 FailureHandoff: ${result.content}`);
      this.handoff?.raise({
        ctx,
        reason: '回复含禁止话术，请立刻接管',
        reasonCode: 'reply_failure',
        cooldownMs,
        transferAttempted: true,
        transferOk: null,
      });
      return { type: 'TRANSFER' as MessageType, content: comfort };
    }

    if (timedOut) {
      return { type: 'NO_REPLY' as MessageType, content: '' };
    }

    // 人工感延迟放在生成成功之后，不计入 ReplyTimeout
    const min = cfg.reply_speed;
    const max = cfg.reply_random_speed + cfg.reply_speed;
    const delaySec = min + Math.random() * Math.max(0, max - min);
    if (delaySec > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
      if (this.handoff && !this.handoff.isEpochCurrent(sessionKey, epoch)) {
        return { type: 'NO_REPLY' as MessageType, content: '' };
      }
    }

    return result;
  }

  /**
   * 发送阶段硬失败时由策略层调用。
   */
  public notifySendFailure(cfg: Config, ctx: Context, errMsg: string): ReplyDTO {
    const comfort = this.handoff
      ? this.handoff.getComfortReply(cfg.failure_handoff_reply)
      : '稍等，我帮您找同事看一下';
    const cooldownMs =
      this.handoff?.getCooldownMs(cfg.handoff_cooldown_seconds) ?? 900000;
    this.handoff?.bumpEpoch(sessionKeyFromCtx(ctx));
    this.handoff?.raise({
      ctx,
      reason: `发送失败：${errMsg}`,
      reasonCode: 'reply_failure',
      cooldownMs,
      transferAttempted: true,
      transferOk: null,
    });
    return { type: 'TRANSFER' as MessageType, content: comfort };
  }

  public markTransferResult(ctx: Context, ok: boolean): void {
    this.handoff?.markTransferResult(sessionKeyFromCtx(ctx), ok);
  }

  private async buildAutoReply(
    cfg: Config,
    ctx: Context,
    messages: MessageDTO[],
    lastUserMsg: MessageDTO | undefined,
    signal?: AbortSignal,
  ): Promise<ReplyDTO> {
    let hasDefaultReply = true;
    let reply: ReplyDTO | null = null;
    let working = messages;

    if (lastUserMsg) {
      if (cfg.context_count > 0) {
        working = working.slice(-cfg.context_count);
      }

      if (cfg.has_keyword_match) {
        const data = await this.matchKeyword(ctx, lastUserMsg);
        if (data && data.content) {
          ctx.set(CTX_KEYWORD_HINTS, data.content);
          this.log.info(
            `关键词素材已注入（不直接回复）: ${data.content.slice(0, 80)}`,
          );
        } else {
          this.log.warn(`未匹配到关键词素材`);
        }
      }

      if (cfg.has_use_gpt) {
        if (signal?.aborted) {
          return { type: 'TEXT' as MessageType, content: '' };
        }
        this.log.info(`开始使用网关智能回复`);
        const data = await this.getLLMResponse(cfg, ctx, working, signal);
        if (data && data.content) {
          this.log.success(`智能回复已生成： ${data.content}`);
          reply = data;
          hasDefaultReply = false;
        } else {
          this.log.warn(`智能回复生成失败`);
        }
      }

      // G9：关键词仅作素材注入，AI 失败时不直接把关键词成稿发给买家
    }

    if (hasDefaultReply) {
      // 不再把 default_reply 发给买家（如「消息有点多稍后再回」）。
      // 交由 getReply 走 FailureHandoff：不露馅安抚 → 静默转接 → 待接管。
      this.log.warn(
        '智能回复不可用，交由 FailureHandoff（不发默认回复／不直出关键词）',
      );
      return { type: 'TEXT' as MessageType, content: '' };
    }

    if (cfg.has_replace && reply && reply.type === 'TEXT') {
      reply.content = await this.matchReplaceKeyword(ctx, reply.content);
    }

    return reply as ReplyDTO;
  }

  public async createTextReply(content: string) {
    return {
      type: 'TEXT',
      content,
    };
  }

  /**
   * 匹配需要替换的关键词
   * @param ctx
   * @param message
   * @returns
   */
  public async matchReplaceKeyword(
    ctx: Context,
    reply: string,
  ): Promise<string> {
    const appId = ctx.get(CTX_APP_ID);
    if (!appId) return reply;

    const replaceKeywords =
      await this.autoReplyController.getReplaceKeywords(appId);

    // 先找到匹配的关键词
    const foundKeywordObj = replaceKeywords.find((keywordObj) => {
      return keywordObj.keyword.split('|').some((pattern) => {
        return rangeMatch(
          pattern,
          reply,
          keywordObj.fuzzy,
          keywordObj.has_regular,
        );
      });
    });

    // 如果找到匹配的关键词对象，进行替换
    if (foundKeywordObj) {
      foundKeywordObj.keyword.split('|').forEach((pattern) => {
        // eslint-disable-next-line no-param-reassign
        reply = replaceKeyword(
          pattern,
          reply,
          foundKeywordObj.replace,
          foundKeywordObj.fuzzy,
          foundKeywordObj.has_regular,
        );
      });
    }

    return reply;
  }

  /**
   * 匹配关键词
   * @param ctx
   * @param message
   * @returns
   */
  public async matchTransferKeyword(
    ctx: Context,
    message: MessageDTO,
  ): Promise<boolean> {
    const appId = ctx.get(CTX_APP_ID);
    if (!appId) return false;

    const keywords = await this.autoReplyController.getTransferKeywords(appId);

    // 先找到匹配的关键词
    const foundKeywordObj = keywords.find((keywordObj) => {
      return keywordObj.keyword.split('|').some((pattern) => {
        return rangeMatch(
          pattern,
          message.content,
          keywordObj.fuzzy,
          keywordObj.has_regular,
        );
      });
    });

    if (foundKeywordObj) {
      return true;
    }

    return false;
  }

  /**
   * 匹配关键词
   * @param ctx
   * @param message
   * @returns
   */
  public async matchKeyword(
    ctx: Context,
    message: MessageDTO,
  ): Promise<ReplyDTO | null> {
    const appId = ctx.get(CTX_APP_ID);
    if (!appId) return null;

    await this.ensureShopContext(ctx);
    const shopId = ctx.get(CTX_SHOP_ID) || null;
    const keywords = await this.autoReplyController.getKeywords(appId, shopId);

    // 先找到匹配的关键词
    const foundKeywordObj = keywords.find((keywordObj) => {
      return keywordObj.keyword.split('|').some((pattern) => {
        return rangeMatch(
          pattern,
          message.content,
          keywordObj.fuzzy,
          keywordObj.has_regular,
        );
      });
    });

    if (foundKeywordObj) {
      const chosenReply = await this.choseRandomReply(foundKeywordObj.reply);

      let msgType = 'TEXT';
      if (chosenReply.includes('[@]') && chosenReply.includes('[/@]')) {
        msgType = 'FILE';
        const fileStart = chosenReply.indexOf('[@]') + 3;
        const fileEnd = chosenReply.indexOf('[/@]');
        const filePath = chosenReply.substring(fileStart, fileEnd);
        return {
          type: msgType as MessageType,
          content: filePath,
        };
      }

      return {
        type: msgType as MessageType,
        content: chosenReply,
      };
    }

    return null;
  }

  public async choseRandomReply(reply: string) {
    const replies = reply.split('[or]');
    const chosenReply = specialTokenReplace(
      replies[Math.floor(Math.random() * replies.length)],
    );

    return chosenReply;
  }

  /**
   * 检查 LLM 是否可用
   */
  public async checkGptHealth(cfg: LLMConfig) {
    try {
      const llmClient = this.createLLMClient(cfg, cfg.llmType);
      // 尝试使用它回复 Hi 来检查是否可用
      if ('chat' in llmClient) {
        // @ts-ignore
        const response = await llmClient.chat.completions.create({
          model: cfg.model,
          messages: [
            {
              role: 'user',
              content: 'Hi',
            },
          ],
          stream: true,
        });

        const chunks = [];
        // eslint-disable-next-line no-restricted-syntax
        for await (const chunk of response) {
          chunks.push(chunk.choices[0]?.delta?.content || '');
        }

        return {
          status: true,
          message: chunks.join(''),
        };
      }
    } catch (error) {
      console.error(`Error in getLLMResponse: ${error}`);
      return {
        status: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      status: false,
      message: '该模型的 LLM 不可用',
    };
  }

  /**
   * 尽早写入 Shop 上下文，供关键词匹配与闸道注入共用（勿拖到打闸道才设）。
   */
  private async ensureShopContext(ctx: Context): Promise<void> {
    try {
      const instanceId = ctx.get(CTX_INSTANCE_ID);
      if (!instanceId) return;
      const inst = await Instance.findByPk(Number(instanceId));
      if (inst?.gateway_shop_id && !ctx.get(CTX_SHOP_ID)) {
        ctx.set(CTX_SHOP_ID, inst.gateway_shop_id);
      }
      if (inst?.shop_name && !ctx.get(CTX_SHOP_HINT)) {
        ctx.set(CTX_SHOP_HINT, inst.shop_name);
      }
    } catch {
      // ignore
    }
  }

  /**
   * 获取 GPT 回复
   * @param cfg
   * @param ctx
   * @param messages
   * @returns
   */
  public async getLLMResponse(
    _cfg: Config,
    ctx: Context,
    messages: MessageDTO[],
    signal?: AbortSignal,
  ): Promise<ReplyDTO | null> {
    // 智能客服系统：禁止 BYOK，一律走运营方 LLM Gateway
    try {
      const { gatewayChat, loadGatewayAuth } = await import('./gatewayClient');
      const auth = await loadGatewayAuth();
      if (!auth?.gatewayUrl || !auth.username) {
        this.log.warn('未配置网关登录，跳过智能回复');
        return null;
      }
      await this.ensureShopContext(ctx);
      const data = await gatewayChat({ auth, ctx, messages, signal });
      if (data?.content) {
        // 成功扣点后允许再次触发耗尽逻辑（充值后可能再耗尽）
        this.creditExhaustHandled = false;
        this.log.success(
          `网关回复成功${
            data.creditCharged != null ? `，扣 ${data.creditCharged} 点` : ''
          }`,
        );
        return {
          type: 'TEXT',
          content: data.content,
        };
      }
      this.log.warn('网关未返回正文');
      return null;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const msg = error instanceof Error ? error.message : String(error);
      if (
        name === 'AbortError' ||
        /aborted|AbortError/i.test(msg) ||
        signal?.aborted
      ) {
        this.log.info('智能回复已取消（超时或会话已切换）');
        return null;
      }
      console.error(`Error in getLLMResponse (gateway): ${error}`);
      this.log.error(`网关呼叫失败: ${msg}`);
      await this.handleCreditExhaustion(error);
      return null;
    }
  }

  /**
   * 创建 LLM 客户端
   * @param cfg
   * @param llmName
   * @returns
   */
  private createLLMClient(cfg: LLMConfig | Config, llmName: string) {
    let key;
    let baseUrl;

    console.log('Creating LLM client:', llmName, cfg);

    if ('baseUrl' in cfg) {
      key = cfg.key;
      baseUrl = cfg.baseUrl;
    } else {
      key = cfg.key;
      baseUrl = cfg.base_url;
    }

    const options = { apiKey: key, baseURL: baseUrl };
    if (!options.baseURL || !options.apiKey) {
      throw new Error('Missing required API key or base URL');
    }

    if (llmName === 'ernie') {
      return new ErnieAI(options);
    }
    if (llmName === 'gemini') {
      return new GeminiAI(options);
    }
    if (llmName === 'hunyuan') {
      return new HunYuanAI(options);
    }
    if (llmName === 'minimax') {
      return new MinimaxAI(options);
    }
    if (llmName === 'qwen') {
      return new QWenAI(options);
    }
    if (llmName === 'spark') {
      return new SparkAI(options);
    }
    if (llmName === 'vyro') {
      return new VYroAI(options);
    }
    if (llmName === 'dify') {
      return new DifyAI(options);
    }

    return new OpenAI(options);
  }

  toLLMMessages(ctx: Context, messages: MessageDTO[]) {
    // 先过滤 system 消息
    const f_messages = messages.filter((msg) => msg.role !== 'SYSTEM');
    const msgs = f_messages.map((msg) => ({
      role: msg.role === 'SELF' ? 'assistant' : 'user',
      content: msg.content,
    }));

    return msgs;
  }

  /**
   * 提取消息中的信息
   * @param cfg
   * @param ctx
   * @param messages
   * @returns
   */
  public async extractMsgInfo(
    cfg: Config,
    ctx: Context,
    messages: MessageDTO[],
  ) {
    if (!cfg.extract_phone && !cfg.extract_product) return;
    if (cfg.save_path === '') return;

    console.log('开始提取用户消息中的数据....');

    const dataExtracted: { [key: string]: string } = {};
    const fileName = `${cfg.save_path}/${new Date().toISOString().split('T')[0]}.txt`;

    // 检查 save_path 是否存在
    try {
      await fs.access(cfg.save_path);
    } catch (error) {
      await fs.mkdir(cfg.save_path);
    }

    if (cfg.extract_phone) {
      const phoneNumbers = messages
        .map((msg) => msg.content.match(/\b1[3-9]\d{9}\b/g))
        .filter((pns) => pns)
        .flat();

      if (phoneNumbers.length)
        dataExtracted.phone_numbers = phoneNumbers.join(', ');
    }

    if (cfg.extract_product) {
      // 从 ctx 中获取商品信息
      const goods = ctx.get(CTX_CURRENT_GOODS);
      if (goods) {
        dataExtracted.goods = goods;
      }

      // 从 ctx 中获取商品 ID
      const goodsId = ctx.get(CTX_CURRENT_GOODS_ID);
      if (goodsId) {
        dataExtracted.goods_id = goodsId;
      }

      // 从 ctx 中获取会员标签
      const memberTag = ctx.get(CTX_MEMBER_TAG);
      if (memberTag) {
        dataExtracted.member_tag = memberTag;
      }

      // 从 ctx 中获取粉丝标签
      const fanTag = ctx.get(CTX_FAN_TAG);
      if (fanTag) {
        dataExtracted.fan_tag = fanTag;
      }

      // 从 ctx 中获取新客标签
      const newCustomerTag = ctx.get(CTX_NEW_CUSTOMER_TAG);
      if (newCustomerTag) {
        dataExtracted.new_customer_tag = newCustomerTag;
      }
    }

    await fs.appendFile(
      fileName,
      `${Object.entries(dataExtracted)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')}\n`,
    );
  }
}
