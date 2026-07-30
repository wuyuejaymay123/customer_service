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
import InstanceCardComponent from './InstanceCardComponent';
import { useAppManager } from './AppManagerContext';
import { trackButtonClick } from '../../../common/services/analytics';

const tipForApp = (appId: string | null): string => {
  if (appId === 'pinduoduo') {
    return '拼多多：每个实例对应一家店。点 + 会开独立 Chrome，请分别扫码登录。若手动关闭浏览器，卡片会显示「已关闭」；暂停后再开自动回复可重新打开。';
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

  useEffect(() => {
    setCurrentAppId(selectedAppId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId]);

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
        selectedInstanceId={selectedInstanceId}
        setSelectedInstanceId={setSelectedInstanceId}
        handleDelete={handleDelete}
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
