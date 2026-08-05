import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Text,
  useToast,
  VStack,
} from '@chakra-ui/react';
import InstanceShopSettings from '../../settings-window/components/Settings/InstanceShopSettings';
import {
  addTask,
  getTasks,
  removeTask,
} from '../services/platform/controller';
import { Instance } from '../services/platform/platform';
import { platformLabel } from '../../main-window/components/AppManager/AppManagerContext';
import '../shell/appShell.css';

function shopTitle(inst: Instance): string {
  const platform = platformLabel(inst.app_id);
  const name =
    inst.shop_name?.trim() ||
    (inst.app_id === 'win_qianniu' ? '多店铺模式' : `#${inst.task_id}`);
  return `${platform}-${name}`;
}

type Props = {
  appId?: string;
  instanceId?: string;
  onShopContextChange?: (next: {
    appId?: string;
    instanceId?: string;
  }) => void;
};

/**
 * 单店管理：左店铺列表（新增）+ 右本店资料（含删除店铺）。
 */
const ShopManagePanel = ({
  appId,
  instanceId,
  onShopContextChange,
}: Props) => {
  const toast = useToast();
  const [shops, setShops] = useState<Instance[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await getTasks();
      setShops(res?.data || []);
    } catch {
      setShops([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!instanceId && shops.length > 0) {
      const first = shops[0];
      onShopContextChange?.({
        appId: first.app_id,
        instanceId: String(first.task_id),
      });
    }
  }, [shops, instanceId, onShopContextChange]);

  const select = (inst: Instance) => {
    onShopContextChange?.({
      appId: inst.app_id,
      instanceId: String(inst.task_id),
    });
  };

  const addPdd = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await addTask('pinduoduo');
      if (error) throw new Error(error);
      await refresh();
      toast({
        title: '已创建拼多多实例',
        description: '请在弹出的 Chrome 窗口扫码登录对应店铺。',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: '添加失败',
        description: e instanceof Error ? e.message : String(e),
        status: 'error',
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const deleteShop = async () => {
    if (!instanceId || busy) return;
    const ok = window.confirm('确定删除该店铺实例？浏览器窗口将关闭。');
    if (!ok) return;
    setBusy(true);
    try {
      await removeTask(instanceId);
      await refresh();
      const next = (await getTasks())?.data || [];
      if (next.length > 0) {
        onShopContextChange?.({
          appId: next[0].app_id,
          instanceId: String(next[0].task_id),
        });
      } else {
        onShopContextChange?.({ appId: undefined, instanceId: undefined });
      }
      toast({
        title: '已删除店铺',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: '删除失败',
        description: e instanceof Error ? e.message : String(e),
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const current = shops.find((s) => String(s.task_id) === String(instanceId));

  return (
    <Flex className="cs-shop-manage" h="100%" minH={0} align="stretch">
      <aside className="cs-shop-manage-side">
        <div className="cs-shop-manage-side-h">店铺列表</div>
        <div className="cs-shop-manage-list">
          {shops.length === 0 ? (
            <Text fontSize="sm" color="gray.500" p={3} textAlign="center">
              尚未添加店铺
            </Text>
          ) : (
            shops.map((s) => {
              const active = String(s.task_id) === String(instanceId);
              return (
                <button
                  type="button"
                  key={s.task_id}
                  className={`cs-shop-manage-item${active ? ' active' : ''}`}
                  onClick={() => select(s)}
                >
                  {shopTitle(s)}
                </button>
              );
            })
          )}
        </div>
        <div className="cs-shop-manage-add">
          <Button
            colorScheme="blue"
            size="sm"
            w="100%"
            isLoading={busy}
            onClick={addPdd}
          >
            + 新增店铺
          </Button>
        </div>
      </aside>
      <Box className="cs-shop-manage-main" flex="1" minW={0} overflow="auto">
        {current && instanceId ? (
          <VStack align="stretch" spacing={4} p={6}>
            <HStack justify="space-between" align="flex-start">
              <Heading size="md">{shopTitle(current)}</Heading>
              <Button
                size="sm"
                variant="outline"
                colorScheme="red"
                isLoading={busy}
                onClick={deleteShop}
              >
                删除店铺
              </Button>
            </HStack>
            <InstanceShopSettings
              appId={appId || current.app_id}
              instanceId={String(instanceId)}
            />
          </VStack>
        ) : (
          <Flex h="100%" align="center" justify="center" p={8}>
            <Text color="gray.500">
              请在左侧选择店铺，或点击「新增店铺」添加拼多多店并扫码。
            </Text>
          </Flex>
        )}
      </Box>
    </Flex>
  );
};

export default ShopManagePanel;
