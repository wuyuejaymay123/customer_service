import { Platform } from '../types';

/**
 * SupportedChannel：仅 千牛 + 拼多多。
 */
export const LOCAL_PLATFORMS: Platform[] = [
  {
    id: 'win_qianniu',
    name: '千牛',
    type: 'E_COMMERCE',
    env: 'DESKTOP',
    desc:
      '淘宝／天猫千牛。多店请在千牛登录选“多店铺模式”，开启讲述人+气泡模式，并关闭千牛自带自动回复；本客户端建 1 个实例即可覆盖客户端内多店。',
    avatar: 'https://qianniu.1688.com/favicon.ico',
  },
  {
    id: 'pinduoduo',
    name: '拼多多',
    type: 'E_COMMERCE',
    env: 'WEB',
    desc:
      '拼多多商家后台（网页）。一实例一店：每建一个实例会开独立 Chrome 会话，请分别扫码登录；可同时挂多家店。',
  },
];
