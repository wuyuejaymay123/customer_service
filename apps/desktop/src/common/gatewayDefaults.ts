/** 正式安装包内置网关；本地开发可设环境变量 GATEWAY_URL 覆盖 */
export const DEFAULT_GATEWAY_URL =
  (typeof process !== 'undefined' && process.env?.GATEWAY_URL?.trim()) ||
  'http://gateway.customerser.online:8787';
