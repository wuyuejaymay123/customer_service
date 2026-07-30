import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  HStack,
  Text,
  VStack,
} from '@chakra-ui/react';
import {
  ackHandoff,
  getHandoffList,
  HandoffAlertItem,
  resumeHandoffSession,
} from '../../../common/services/platform/controller';

function reasonLabel(code: string): string {
  if (code === 'timeout') return '超时';
  if (code === 'rule_transfer') return '规则转人工';
  if (code === 'transfer_failed') return '转接失败';
  return '回复失败';
}

function channelLabel(appId: string): string {
  if (appId === 'pinduoduo') return '拼多多';
  if (appId === 'win_qianniu') return '千牛';
  return appId || '未知渠道';
}

const HandoffQueue = () => {
  const [items, setItems] = useState<HandoffAlertItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await getHandoffList();
      setItems(res?.data || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    const onUpdate = (list: HandoffAlertItem[]) => {
      if (Array.isArray(list)) setItems(list);
    };
    const unsub = window.electron?.ipcRenderer?.on(
      'handoff-updated',
      onUpdate,
    );
    return () => {
      clearInterval(timer);
      if (typeof unsub === 'function') unsub();
    };
  }, [refresh]);

  if (items.length === 0) {
    return null;
  }

  return (
    <Box
      borderWidth="1px"
      borderColor="orange.300"
      bg="orange.50"
      borderRadius="md"
      p={3}
    >
      <HStack justify="space-between" mb={2}>
        <Text fontWeight="bold" color="orange.800">
          待接管（{items.length}）
        </Text>
        <Button size="xs" variant="ghost" onClick={() => refresh()}>
          刷新
        </Button>
      </HStack>
      <VStack align="stretch" spacing={2} maxH="220px" overflowY="auto">
        {items.map((item) => (
          <Box
            key={item.id}
            bg="white"
            borderRadius="md"
            p={2}
            borderWidth="1px"
            borderColor="orange.100"
          >
            <HStack justify="space-between" align="start">
              <Box flex="1" minW={0}>
                <HStack spacing={2} mb={1} flexWrap="wrap">
                  <Badge colorScheme="orange">
                    {reasonLabel(item.reasonCode)}
                  </Badge>
                  <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                    {item.buyer}
                  </Text>
                  {(item.shopHint || item.appId) && (
                    <Text fontSize="xs" color="gray.500" noOfLines={1}>
                      {item.shopHint || channelLabel(item.appId)}
                    </Text>
                  )}
                </HStack>
                <Text fontSize="xs" color="gray.700">
                  {item.reason}
                </Text>
                <Text fontSize="xs" color="gray.400">
                  {new Date(item.createdAt).toLocaleTimeString()} · 冷却至{' '}
                  {new Date(item.cooldownUntil).toLocaleTimeString()}
                </Text>
              </Box>
              <VStack spacing={1}>
                <Button
                  size="xs"
                  colorScheme="teal"
                  onClick={async () => {
                    await resumeHandoffSession(item.sessionKey);
                    await refresh();
                  }}
                >
                  已接手／恢复
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={async () => {
                    await ackHandoff(item.id);
                    await refresh();
                  }}
                >
                  关闭提醒
                </Button>
              </VStack>
            </HStack>
          </Box>
        ))}
      </VStack>
    </Box>
  );
};

export default React.memo(HandoffQueue);
