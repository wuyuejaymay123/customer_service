import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  HStack,
  Text,
  useToast,
  VStack,
} from '@chakra-ui/react';
import {
  ackHandoff,
  focusShopTask,
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
  const toast = useToast();

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

  const goServe = async (item: HandoffAlertItem) => {
    const shopLabel = item.shopHint || channelLabel(item.appId);
    try {
      const r = await focusShopTask(item.instanceId);
      if (r?.success) {
        toast({
          title: '已尝试打开店铺窗口',
          description: r.shopName || shopLabel,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({
          title: '请手动切换窗口',
          description:
            r?.error || `请手动切到「${shopLabel}」窗口接待该买家`,
          status: 'warning',
          duration: 8000,
          isClosable: true,
        });
      }
    } catch {
      toast({
        title: '请手动切换窗口',
        description: `请手动切到「${shopLabel}」窗口接待该买家`,
        status: 'warning',
        duration: 8000,
        isClosable: true,
      });
    }
  };

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
      {items.length === 0 ? (
        <Text fontSize="sm" color="gray.600" py={2}>
          目前没有待接管
        </Text>
      ) : (
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
                    colorScheme="orange"
                    onClick={() => goServe(item)}
                  >
                    去接待
                  </Button>
                  <Button
                    size="xs"
                    colorScheme="teal"
                    variant="outline"
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
      )}
    </Box>
  );
};

export default React.memo(HandoffQueue);
