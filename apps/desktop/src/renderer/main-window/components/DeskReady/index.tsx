import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Heading,
  Text,
  VStack,
  OrderedList,
  ListItem,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { getTasks } from '../../../common/services/platform/controller';

type Props = {
  children: React.ReactNode;
};

/**
 * DeskReady：未登录网关时阻塞；无店铺实例时提示添加（仍可进入 DutyDesk 操作加店）。
 */
const DeskReady = ({ children }: Props) => {
  const [gatewayOk, setGatewayOk] = useState<boolean | null>(null);

  const probeGateway = useCallback(async () => {
    try {
      const result = await window.electron?.ipcRenderer?.invoke('gateway:me');
      setGatewayOk(Boolean(result?.ok));
    } catch {
      setGatewayOk(false);
    }
  }, []);

  const { data: tasksData } = useQuery(['tasks'], () => getTasks(), {
    refetchInterval: 4000,
  });
  const taskCount = tasksData?.data?.length || 0;

  useEffect(() => {
    probeGateway();
    const id = setInterval(probeGateway, 5000);
    return () => clearInterval(id);
  }, [probeGateway]);

  if (gatewayOk === null) {
    return (
      <Box p={8} textAlign="center">
        <Text color="gray.500">正在检查网关登录状态…</Text>
      </Box>
    );
  }

  if (!gatewayOk) {
    return (
      <Box
        borderWidth="1px"
        borderColor="orange.300"
        bg="orange.50"
        borderRadius="md"
        p={6}
        maxW="520px"
        mx="auto"
        mt={8}
      >
        <VStack align="stretch" spacing={4}>
          <Heading size="md">开始值班前请先就绪</Heading>
          <Text fontSize="sm" color="gray.700">
            请按顺序完成：登录商户账号 → 添加拼多多店并扫码 →（可选）开启自动回复总开关。
          </Text>
          <OrderedList spacing={2} fontSize="sm" pl={4}>
            <ListItem>登录网关商户账号（账户与点数）</ListItem>
            <ListItem>添加拼多多店铺并在浏览器扫码</ListItem>
            <ListItem>开启自动回复总开关与本店开关</ListItem>
          </OrderedList>
          <Button
            colorScheme="teal"
            onClick={() => {
              window.electron?.ipcRenderer?.sendMessage?.(
                'open-settings-window',
                {},
              );
            }}
          >
            去登录网关
          </Button>
          <Button variant="ghost" size="sm" onClick={() => probeGateway()}>
            我已登录，重新检查
          </Button>
        </VStack>
      </Box>
    );
  }

  return (
    <>
      {taskCount === 0 && (
        <Box
          mb={3}
          p={3}
          borderWidth="1px"
          borderColor="teal.200"
          bg="teal.50"
          borderRadius="md"
        >
          <Text fontSize="sm">
            已登录网关。请选择拼多多并点「+」添加店铺，在弹出的浏览器中扫码登录。
          </Text>
        </Box>
      )}
      {children}
    </>
  );
};

export default DeskReady;
