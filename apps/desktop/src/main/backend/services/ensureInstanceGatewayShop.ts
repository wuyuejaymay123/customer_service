import { Instance } from '../entities/instance';
import {
  createShop,
  listShops,
  loadGatewayAuth,
  updateShop,
} from './gatewayClient';

function channelForAppId(
  appId: string,
): 'pinduoduo' | 'qianniu' | null {
  if (appId === 'pinduoduo') return 'pinduoduo';
  if (appId === 'win_qianniu') return 'qianniu';
  return null;
}

/**
 * 扫码拿到店名后：自动在网关建店（若无）并绑定到本实例。
 * 已绑定则直接返回；未登录网关／尚无店名则跳过。
 */
export async function ensureInstanceGatewayShop(
  instanceId: string | number,
): Promise<{
  gatewayShopId: string | null;
  shopName: string | null;
  created: boolean;
  reason?: string;
}> {
  const inst = await Instance.findByPk(instanceId);
  if (!inst) {
    return {
      gatewayShopId: null,
      shopName: null,
      created: false,
      reason: 'no_instance',
    };
  }

  const shopName = (inst.shop_name || '').trim();

  if (inst.gateway_shop_id) {
    return {
      gatewayShopId: inst.gateway_shop_id,
      shopName: shopName || null,
      created: false,
    };
  }

  if (!shopName) {
    return {
      gatewayShopId: null,
      shopName: null,
      created: false,
      reason: 'no_shop_name',
    };
  }

  const auth = await loadGatewayAuth();
  if (!auth?.token) {
    return {
      gatewayShopId: null,
      shopName,
      created: false,
      reason: 'gateway_not_logged_in',
    };
  }

  const channel = channelForAppId(inst.app_id);
  if (!channel) {
    return {
      gatewayShopId: null,
      shopName,
      created: false,
      reason: 'unsupported_channel',
    };
  }

  let shops: Awaited<ReturnType<typeof listShops>> = [];
  try {
    shops = await listShops(auth);
  } catch (e) {
    return {
      gatewayShopId: null,
      shopName,
      created: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  const match = shops.find(
    (s) =>
      s.channel === channel &&
      (s.display_name === shopName ||
        (s.external_keys || []).includes(shopName)),
  );

  let gatewayShopId: string;
  let created = false;

  if (match) {
    gatewayShopId = match.id;
    const keys = new Set(match.external_keys || []);
    if (!keys.has(shopName)) {
      try {
        await updateShop(auth, match.id, {
          displayName: match.display_name,
          channel: match.channel as 'pinduoduo' | 'qianniu',
          externalKeys: [...keys, shopName],
        });
      } catch {
        // 别名补写失败不阻断绑定
      }
    }
  } else {
    try {
      const createdShop = await createShop(auth, {
        displayName: shopName,
        channel,
        externalKeys: [shopName],
      });
      gatewayShopId = createdShop.id;
      created = true;
    } catch (e) {
      return {
        gatewayShopId: null,
        shopName,
        created: false,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }

  inst.gateway_shop_id = gatewayShopId;
  await inst.save();

  return { gatewayShopId, shopName, created };
}
