export enum StrategyServiceStatusEnum {
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
}

export enum PlatformTypeEnum {
  HOT = 'HOT',
  E_COMMERCE = 'E_COMMERCE',
  RECRUIT = 'RECRUIT',
  LAW = 'LAW',
  OTHER = 'OTHER',
  ME_MEDIA = 'ME_MEDIA',
}

export type RoleType = 'SELF' | 'OTHER' | 'SYSTEM';
export type MessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'FILE'
  | 'NO_REPLY'
  | 'TRANSFER';

export enum RoleTypeEnum {
  SELF = 'SELF',
  OTHER = 'OTHER',
  SYSTEM = 'SYSTEM',
}

export enum MsgTypeEnum {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  FILE = 'FILE',
  NO_REPLY = 'NO_REPLY',
  TRANSFER = 'TRANSFER',
}

export enum LifecycleStateEnum {
  START = 'START',
  INIT = 'INIT',
  RUN = 'RUN',
  DESTROY = 'DESTROY',
}

export enum EnvironmentTypeEnum {
  WEB = 'WEB',
  DESKTOP = 'DESKTOP',
}

export type Context = Map<string, string>;

export interface MessageDTO {
  sender: string;
  content: string;
  role: RoleType; // assistant, user
  type: MessageType;
}

export interface ReplyDTO {
  content: string;
  type: MessageType;
}

export interface Platform {
  id: string;
  name: string;
  type?: string;
  avatar?: string;
  desc?: string;
  env?: string;
}

export interface StrategyInfo {
  id: string;
  type: PlatformTypeEnum;
  name: string;
  avatar: string;
  desc: string;
  env: EnvironmentTypeEnum;
  impl: boolean;
}

export interface LogInstance {
  id: string;
  app_id: string;
  avatar?: string;
}

export interface ILogger {
  log: (msg: string, instance?: LogInstance) => void;
  info: (msg: string, instance?: LogInstance) => void;
  warn: (msg: string, instance?: LogInstance) => void;
  error: (msg: string, instance?: LogInstance) => void;
  debug?: (msg: string, instance?: LogInstance) => void;
  success?: (msg: string, instance?: LogInstance) => void;
}

export type IGetReplyFunc = (
  ctx: Context,
  msgs: MessageDTO[],
) => Promise<ReplyDTO>;

export type IGetDefaultReplyFunc = (ctx: Context) => Promise<ReplyDTO>;

export type IGetGenericConfigFunc = (
  appId: string,
  instanceId: number,
) => Promise<GenericConfig>;

export interface GenericConfig {
  appId: string;
  instanceId: string;
  extractPhone: boolean;
  extractProduct: boolean;
  savePath: string;
  replySpeed: number;
  replyRandomSpeed: number;
  contextCount: number;
  waitHumansTime: number;
  defaultReply: string;
  truncateWordCount: number;
  truncateWordKey: string;
  jinritemaiDefaultReplyMatch: string;
  failureHandoffReply?: string;
  handoffCooldownSeconds?: number;
  chromePath?: string;
  hasTransferReply?: boolean;
  defaultTransferReply?: string;
  transferReplyMatch?: string;
}

export interface LLMConfig {
  appId: string;
  instanceId: string;
  baseUrl: string;
  key: string;
  llmType: string;
  model: string;
}

export interface AccountConfig {
  activationCode: string;
}

export interface PluginConfig {
  appId: string;
  instanceId: string;
  usePlugin: boolean;
  pluginId: number;
}

export interface DriverConfig {
  hasPaused: boolean;
  hasKeywordMatch: boolean;
  hasUseGpt: boolean;
  hasMouseClose: boolean;
  hasEscClose: boolean;
  hasTransfer: boolean;
  hasReplace: boolean;
}
