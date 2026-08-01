/**
 * 正式安装包内置网关。
 * 大陆机房未备案域名会被阿里云拦截（访问域名返回备案阻断页 / 403），
 * 因此默认走公网 IP；备案并上 HTTPS 后再改回域名。
 * 本地开发可设环境变量 GATEWAY_URL 覆盖。
 */
export const DEFAULT_GATEWAY_URL =
  (typeof process !== 'undefined' && process.env?.GATEWAY_URL?.trim()) ||
  'http://120.26.199.25:8787';
