import React, { useEffect, useState } from 'react';
import {
  Box,
  VStack,
  Text,
  Flex,
  IconButton,
  Tooltip,
  Spinner,
  useToast,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import InstanceCardComponent from './InstanceCardComponent';
import { useAppManager } from './AppManagerContext';
import { trackButtonClick } from '../../../common/services/analytics';
import {
  getConfig,
} from '../../../common/services/platform/controller';
import { DriverConfig } from '../../../common/services/platform/platform';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';

const tipForApp = (appId: string | null): string => {
  if (appId === 'pinduoduo') {
    return '拼多多：每个实例对应一家店。点 + 会开独立 Chrome，请分别扫码登录。关「本店自动回」不关浏览器；手动关窗或掉登会停用该店自动回。总开关开启后不会自动恢复已停用的店。';
  }
  if (appId === 'win_qianniu') {
    return '千牛：请在千牛客户端用「多店铺模式」登录并开气泡模式；此处只能建 1 个实例即可覆盖多店。';
  }
  return '';
};

const InstanceListComponent = () => {
  const {
    filteredInstances,
    selectedInstanceId,
    selectedAppId,
    isTasksLoading,
    setSelectedInstanceId,
    handleDelete,
    handleAddTask,
    refetchTasks,
  } = useAppManager();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentAppId, setCurrentAppId] = useState(selectedAppId);
  const toast = useToast();
  const { registerEventHandler } = useWebSocketContext();

  const { data: driverData } = useQuery(['config', 'driver'], async () => {
    const resp = await getConfig({ type: 'driver' });
    return resp;
  });
  const masterOn = !(
    (driverData?.data as DriverConfig | undefined)?.hasPaused ?? true
  );

  useEffect(() => {
    setCurrentAppId(selectedAppId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId]);

  useEffect(() => {
    const handler = (message: { event: string; data?: any }) => {
      if (message.event === 'shop_auto_reply_halt') {
        const shop = message.data?.shopName || '某店铺';
        const reason = message.data?.reasonLabel || '已停用';
        toast({
          title: `${shop} 已停用自动回复`,
          description: reason,
          status: 'warning',
          position: 'top',
          duration: 8000,
          isClosable: true,
        });
        refetchTasks();
      }
      if (message.event === 'has_paused' || message.event === 'credit_exhausted') {
        refetchTasks();
      }
    };
    return registerEventHandler(handler);
  }, [registerEventHandler, toast, refetchTasks]);

  const handleAddTaskWrapper = async () => {
    try {
      if (
        selectedAppId === 'win_qianniu' &&
        filteredInstances.length >= 1
      ) {
        toast({
          title: '无法重复创建千牛实例',
          description:
            '多店请在千牛「多店铺模式」内切换；此处只需 1 个实例即可覆盖多店。',
          position: 'top',
          status: 'warning',
          duration: 6000,
          isClosable: true,
        });
        return;
      }
      trackButtonClick(`add_task_${selectedAppId || ''}`);
      await handleAddTask();
      if (selectedAppId === 'pinduoduo') {
        toast({
          title: '已创建拼多多实例',
          description: '请在弹出的 Chrome 窗口扫码登录对应店铺（一实例一店）。',
          position: 'top',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      toast({
        title: '添加失败',
        description: (error as Error).message || '未知错误',
        position: 'top',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  let content;

  if (!selectedAppId) {
    return (
      <Flex justifyContent="center" alignItems="center" w="60%" h="100%">
        <Text fontSize="xl" color="gray.500">
          请先选择一个应用
        </Text>
      </Flex>
    );
  }

  if (filteredInstances.length > 0) {
    content = filteredInstances.map((instance) => (
      <InstanceCardComponent
        key={instance.task_id}
        instance={instance}
        masterOn={masterOn}
        selectedInstanceId={selectedInstanceId}
        setSelectedInstanceId={setSelectedInstanceId}
        handleDelete={handleDelete}
        onShopAutoReplyChanged={() => refetchTasks()}
        openSettings={async () => {
          setSelectedInstanceId(instance.task_id);
          const payload = {
            appId: instance.app_id || selectedAppId || undefined,
            instanceId: String(instance.task_id),
          };
          try {
            if (window.electron?.ipcRenderer?.invoke) {
              await window.electron.ipcRenderer.invoke(
                'open-settings-window',
                payload,
              );
            } else {
              window.electron.ipcRenderer.sendMessage(
                'open-settings-window',
                payload,
              );
            }
          } catch (e) {
            toast({
              title: '无法打开本店设置',
              description:
                e instanceof Error ? e.message : '请重启客户端后再试',
              status: 'error',
              duration: 5000,
              isClosable: true,
            });
          }
        }}
      />
    ));
  } else {
    content = (
      <Text fontSize="md" color="gray.500">
        没有启动该应用的客服
      </Text>
    );
  }

  const tip = tipForApp(selectedAppId);

  return (
    <Box w="60%" p={4} bg="gray.50" overflowY="auto">
      <VStack spacing={4} align="stretch">
        {tip ? (
          <Text fontSize="xs" color="gray.600" lineHeight="short">
            {tip}
          </Text>
        ) : null}
        {content}
        {isTasksLoading ? (
          <Flex justifyContent="center" alignItems="center" w="100%" h="50px">
            <Spinner size="md" />
          </Flex>
        ) : (
          <Tooltip
            label={
              selectedAppId === 'pinduoduo'
                ? '新增一家拼多多店铺（独立扫码）'
                : '新增一个客服账户'
            }
          >
            <Flex
              w="100%"
              h="50px"
              bg="gray.100"
              borderRadius="md"
              align="center"
              p={3}
              justify="center"
              cursor="pointer"
              onClick={handleAddTaskWrapper}
              _hover={{ bg: 'gray.200' }}
            >
              <IconButton
                aria-label="Add instance"
                variant="unstyled"
                icon={<AddIcon />}
              />
            </Flex>
          </Tooltip>
        )}
      </VStack>
    </Box>
  );
};

export default InstanceListComponent;
