import React from 'react';
import {
  Flex,
  Image,
  Badge,
  HStack,
  IconButton,
  Text,
  VStack,
  Tooltip,
} from '@chakra-ui/react';
import { SettingsIcon, DeleteIcon } from '@chakra-ui/icons';
import defaultPlatformIcon from '../../../../../assets/base/default-platform-icon.png';

type InstanceCardComponentProps = {
  instance: {
    task_id: string;
    app_id: string;
    env_id: string;
    avatar?: string;
    shop_name?: string | null;
    login_status?: string | null;
    gateway_shop_id?: string | null;
  };
  selectedInstanceId: string | null;
  setSelectedInstanceId: React.Dispatch<React.SetStateAction<string | null>>;
  handleDelete: (taskId: string) => void;
  openSettings: () => void;
};

function displayTitle(instance: InstanceCardComponentProps['instance']): string {
  if (instance.app_id === 'win_qianniu') {
    return instance.shop_name?.trim()
      ? instance.shop_name
      : '千牛（多店铺模式）';
  }
  if (instance.app_id === 'pinduoduo') {
    return instance.shop_name?.trim()
      ? instance.shop_name
      : `拼多多 #${instance.task_id}`;
  }
  return `#${instance.task_id}`;
}

function loginBadge(
  instance: InstanceCardComponentProps['instance'],
): { label: string; color: string } | null {
  if (instance.app_id === 'win_qianniu') {
    return { label: '客户端多店', color: 'purple' };
  }
  if (instance.app_id !== 'pinduoduo') return null;
  if (instance.login_status === 'logged_in') {
    return { label: '已登录', color: 'green' };
  }
  if (instance.login_status === 'pending') {
    return { label: '待扫码', color: 'orange' };
  }
  if (instance.login_status === 'closed') {
    return { label: '已关闭', color: 'red' };
  }
  return { label: '未知', color: 'gray' };
}

const InstanceCardComponent = ({
  instance,
  selectedInstanceId,
  setSelectedInstanceId,
  handleDelete,
  openSettings,
}: InstanceCardComponentProps) => {
  const title = displayTitle(instance);
  const badge = loginBadge(instance);

  return (
    <Flex
      w="100%"
      minH="50px"
      bg="gray.200"
      borderRadius="md"
      align="center"
      p={3}
      justify="space-between"
      outline={
        selectedInstanceId === instance.task_id
          ? '3px solid var(--chakra-colors-teal-300)'
          : 'none'
      }
      onClick={() => setSelectedInstanceId(instance.task_id)}
    >
      <HStack spacing={3} flex="1" minW={0}>
        <Image
          src={instance.avatar}
          fallbackSrc={defaultPlatformIcon}
          boxSize="25px"
        />
        <VStack align="start" spacing={1} minW={0} flex="1">
          <Tooltip label={title}>
            <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
              {title}
            </Text>
          </Tooltip>
          <HStack spacing={1} flexWrap="wrap">
            <Badge colorScheme="gray" fontSize="0.65rem">
              #{instance.task_id}
            </Badge>
            {badge && (
              <Badge colorScheme={badge.color} fontSize="0.65rem">
                {badge.label}
              </Badge>
            )}
            {instance.gateway_shop_id ? (
              <Badge colorScheme="teal" fontSize="0.65rem">
                知识已就绪
              </Badge>
            ) : instance.shop_name ? (
              <Badge colorScheme="orange" fontSize="0.65rem">
                待同步知识库
              </Badge>
            ) : null}
          </HStack>
        </VStack>
      </HStack>
      <HStack spacing={3}>
        <IconButton
          fontSize="15px"
          aria-label="本店设置"
          icon={<SettingsIcon />}
          onClick={(e) => {
            e.stopPropagation();
            openSettings();
          }}
        />
        <IconButton
          color="red.500"
          aria-label="Delete instance"
          icon={<DeleteIcon />}
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(instance.task_id);
          }}
        />
      </HStack>
    </Flex>
  );
};

export default InstanceCardComponent;
