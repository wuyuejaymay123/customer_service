import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Box, HStack, Text, Tooltip } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../../../common/services/platform/controller';
import { DriverConfig } from '../../../common/services/platform/platform';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';

type MePayload = {
  user?: { username?: string; role?: string };
  tenant?: { name?: string };
  lowBalance?: boolean;
  wallet?: { available?: number; balance?: number };
};

/** 保留组件：顶栏已由 AppShell 承接 DeskStatus；此处供需要内嵌状态条时复用。 */
const DeskStatus = () => {
  const navigate = useNavigate();
  const [me, setMe] = useState<MePayload | null>(null);
  const { registerEventHandler } = useWebSocketContext();

  const refreshMe = useCallback(async () => {
    try {
      const result = await window.electron?.ipcRenderer?.invoke('gateway:me');
      if (result?.ok) {
        setMe(result.me || null);
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    }
  }, []);

  const { data: driverData, refetch: refetchDriver } = useQuery(
    ['config', 'driver'],
    async () => getConfig({ type: 'driver' }),
    { refetchInterval: 8000 },
  );
  const masterOn = !(
    (driverData?.data as DriverConfig | undefined)?.hasPaused ?? true
  );

  useEffect(() => {
    refreshMe();
    const id = setInterval(refreshMe, 60 * 1000);
    return () => clearInterval(id);
  }, [refreshMe]);

  useEffect(() => {
    const handler = (message: { event: string }) => {
      if (
        message.event === 'has_paused' ||
        message.event === 'credit_exhausted'
      ) {
        refetchDriver();
        refreshMe();
      }
    };
    return registerEventHandler(handler);
  }, [registerEventHandler, refetchDriver, refreshMe]);

  const openAccountSettings = () => {
    navigate('/settings/account');
  };

  const identity =
    me?.user?.username || me?.tenant?.name || '未登录网关';
  const balance = me?.wallet?.available ?? me?.wallet?.balance;
  const low = Boolean(me?.lowBalance);

  return (
    <Box
      borderWidth="1px"
      borderColor="gray.200"
      bg="white"
      borderRadius="md"
      px={3}
      py={2}
    >
      <HStack justify="space-between" flexWrap="wrap" spacing={3}>
        <HStack spacing={3} flexWrap="wrap">
          <Text fontSize="sm" fontWeight="medium">
            {identity}
          </Text>
          <Tooltip label="点击打开设置 → 账户">
            <Badge
              colorScheme={low ? 'red' : 'teal'}
              cursor="pointer"
              onClick={openAccountSettings}
            >
              点数{' '}
              {balance != null && Number.isFinite(Number(balance))
                ? Number(balance)
                : '—'}
              {low ? ' · 偏低' : ''}
            </Badge>
          </Tooltip>
        </HStack>
        <Badge colorScheme={masterOn ? 'green' : 'orange'}>
          总开关：{masterOn ? '开' : '关'}
        </Badge>
      </HStack>
    </Box>
  );
};

export default React.memo(DeskStatus);
