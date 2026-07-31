import { Platform } from '../types';

/**
 * SupportedChannel：本版仅拼多多。
 */
export const LOCAL_PLATFORMS: Platform[] = [
  {
    id: 'pinduoduo',
    name: '拼多多',
    type: 'E_COMMERCE',
    env: 'WEB',
    desc:
      '拼多多商家后台（网页）。一实例一店：每建一个实例会开独立 Chrome 会话，请分别扫码登录；可同时挂多家店。',
  },
];
