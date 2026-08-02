import React, { useMemo, useState } from 'react';
import {
  Flex,
  Image,
  Badge,
  HStack,
  IconButton,
  Text,
  VStack,
  Tooltip,
  Switch,
  useToast,
} from '@chakra-ui/react';
import { SettingsIcon, DeleteIcon } from '@chakra-ui/icons';
import defaultPlatformIcon from '../../../../../assets/base/default-platform-icon.png';
import { setShopAutoReply } from '../../../common/services/platform/controller';

type InstanceCardComponentProps = {
  instance: {
    task_id: string;
    app_id: string;
    env_id: string;
    avatar?: string;
    shop_name?: string | null;
    login_status?: string | null;
    gateway_shop_id?: string | null;
    auto_reply_enabled?: boolean;
    auto_reply_halt_reason?: string | null;
  };
  /** AutoReplyMaster 是否开启（!hasPaused） */
  masterOn: boolean;
  selectedInstanceId: string | null;
  setSelectedInstanceId: React.Dispatch<React.SetStateAction<string | null>>;
  handleDelete: (taskId: string) => void;
  openSettings: () => void;
  onShopAutoReplyChanged?: () => void;
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

function haltReasonLabel(reason: string | null | undefined): string {
  if (reason === 'browser_closed') return '浏览器已关闭';
  if (reason === 'logged_out') return '已掉登';
  if (reason === 'drive_failures') return '连续驱动失败';
  if (reason === 'duplicate_shop') return '店铺重复';
  return reason || '';
}

function shopCardStatus(opts: {
  loginStatus: string | null | undefined;
  masterOn: boolean;
  shopEnabled: boolean;
  haltReason?: string | null;
}): {
  connection: { label: string; color: string };
  autoReply: { label: string; color: string };
} {
  let connection: { label: string; color: string };
  if (opts.loginStatus === 'logged_in') {
    connection = { label: '已连接', color: 'green' };
  } else if (opts.loginStatus === 'pending') {
    connection = { label: '待扫码', color: 'orange' };
  } else if (opts.loginStatus === 'closed') {
    connection = { label: '已关闭', color: 'red' };
  } else {
    connection = { label: '未知', color: 'gray' };
  }

  let autoReply: { label: string; color: string };
  if (
    opts.loginStatus === 'pending' ||
    opts.loginStatus === 'unknown' ||
    !opts.loginStatus
  ) {
    autoReply = { label: '未就绪', color: 'gray' };
  } else if (!opts.masterOn) {
    autoReply = { label: '总开关已关', color: 'orange' };
  } else if (!opts.shopEnabled) {
    if (opts.haltReason) {
      const reason = haltReasonLabel(opts.haltReason);
      autoReply = {
        label: reason ? `已停用·${reason}` : '已停用',
        color: 'red',
      };
    } else {
      autoReply = { label: '人工接待', color: 'orange' };
    }
  } else if (opts.loginStatus === 'logged_in') {
    autoReply = { label: '自动回复中', color: 'green' };
  } else {
    autoReply = { label: '未就绪', color: 'gray' };
  }

  return { connection, autoReply };
}

const InstanceCardComponent = ({
  instance,
  masterOn,
  selectedInstanceId,
  setSelectedInstanceId,
  handleDelete,
  openSettings,
  onShopAutoReplyChanged,
}: InstanceCardComponentProps) => {
  const title = displayTitle(instance);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const shopEnabled = instance.auto_reply_enabled !== false;
  const status = useMemo(
    () =>
      shopCardStatus({
        loginStatus: instance.login_status,
        masterOn,
        shopEnabled,
        haltReason: instance.auto_reply_halt_reason,
      }),
    [
      instance.login_status,
      instance.auto_reply_halt_reason,
      masterOn,
      shopEnabled,
    ],
  );
  const canToggle =
    instance.app_id === 'pinduoduo' &&
    instance.login_status === 'logged_in';
  const halted = Boolean(instance.auto_reply_halt_reason) && !shopEnabled;

  const onToggleShop = async (checked: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await setShopAutoReply(instance.task_id, checked);
      onShopAutoReplyChanged?.();
      toast({
        title: checked ? '已开启本店自动回复' : '已暂停本店自动回复',
        description: checked
          ? '总开关开启且本店已连接时才会自动回；若曾因故障停用，原因已清除'
          : '浏览器窗口保留，可人工接待；若曾因故障停用，原因仍会显示在卡片上',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: '无法更新本店自动回复',
        description: e instanceof Error ? e.message : String(e),
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex
      w="100%"
      minH="56px"
      bg={halted ? 'red.50' : 'gray.200'}
      borderRadius="md"
      borderWidth={halted ? '1px' : '0'}
      borderColor={halted ? 'red.300' : 'transparent'}
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
            <Badge colorScheme={status.connection.color} fontSize="0.65rem">
              {status.connection.label}
            </Badge>
            <Badge colorScheme={status.autoReply.color} fontSize="0.65rem">
              {status.autoReply.label}
            </Badge>
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
      <HStack spacing={2} onClick={(e) => e.stopPropagation()}>
        {instance.app_id === 'pinduoduo' && (
          <Tooltip
            label={
              canToggle
                ? shopEnabled
                  ? '关闭后本店改由人工接待（不关浏览器）'
                  : '开启本店自动回复（需总开关开启）'
                : '请先扫码登录并保持浏览器连接'
            }
          >
            <HStack spacing={1}>
              <Text fontSize="xs" color="gray.600" whiteSpace="nowrap">
                本店自动回
              </Text>
              <Switch
                size="sm"
                colorScheme="teal"
                isChecked={shopEnabled}
                isDisabled={!canToggle || busy}
                onChange={(e) => onToggleShop(e.target.checked)}
              />
            </HStack>
          </Tooltip>
        )}
        <IconButton
          fontSize="15px"
          aria-label="本店设置"
          icon={<SettingsIcon />}
          onClick={openSettings}
        />
        <IconButton
          color="red.500"
          aria-label="Delete instance"
          icon={<DeleteIcon />}
          onClick={() => handleDelete(instance.task_id)}
        />
      </HStack>
    </Flex>
  );
};

export default InstanceCardComponent;
