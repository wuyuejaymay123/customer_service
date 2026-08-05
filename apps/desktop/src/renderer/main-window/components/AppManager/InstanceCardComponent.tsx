import React, { useMemo, useState } from 'react';
import { Box, HStack, Switch, Text, Tooltip, useToast } from '@chakra-ui/react';
import { SettingsIcon, DeleteIcon } from '@chakra-ui/icons';
import {
  reopenTaskBrowser,
  setShopAutoReply,
} from '../../../common/services/platform/controller';
import { platformLabel } from './AppManagerContext';

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
  masterOn: boolean;
  selectedInstanceId: string | null;
  setSelectedInstanceId: React.Dispatch<React.SetStateAction<string | null>>;
  handleDelete: (taskId: string) => void;
  openSettings: () => void;
  onShopAutoReplyChanged?: () => void;
  /** 运营台列表：只保留自动回开关，不展示设置／删除 */
  hideManageActions?: boolean;
};

function shopNameOnly(instance: InstanceCardComponentProps['instance']): string {
  if (instance.app_id === 'win_qianniu') {
    return instance.shop_name?.trim()
      ? instance.shop_name
      : '千牛（多店铺模式）';
  }
  if (instance.app_id === 'pinduoduo') {
    return instance.shop_name?.trim()
      ? instance.shop_name
      : `#${instance.task_id}`;
  }
  return instance.shop_name?.trim() || `#${instance.task_id}`;
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
  connection: { label: string; tone: string };
  autoReply: { label: string; tone: string };
} {
  let connection: { label: string; tone: string };
  if (opts.loginStatus === 'logged_in') {
    connection = { label: '已连接', tone: 'ok' };
  } else if (opts.loginStatus === 'pending') {
    connection = { label: '待扫码', tone: 'warn' };
  } else if (opts.loginStatus === 'closed') {
    connection = { label: '已关闭', tone: 'bad' };
  } else {
    connection = { label: '未知', tone: 'muted' };
  }

  let autoReply: { label: string; tone: string };
  if (
    opts.loginStatus === 'pending' ||
    opts.loginStatus === 'unknown' ||
    !opts.loginStatus
  ) {
    autoReply = { label: '未就绪', tone: 'muted' };
  } else if (!opts.masterOn) {
    autoReply = { label: '总开关已关', tone: 'warn' };
  } else if (!opts.shopEnabled) {
    if (opts.haltReason) {
      const reason = haltReasonLabel(opts.haltReason);
      autoReply = {
        label: reason ? `已停用·${reason}` : '已停用',
        tone: 'bad',
      };
    } else {
      autoReply = { label: '人工接待', tone: 'warn' };
    }
  } else if (opts.loginStatus === 'logged_in') {
    autoReply = { label: '自动回复中', tone: 'ok' };
  } else {
    autoReply = { label: '未就绪', tone: 'muted' };
  }

  return { connection, autoReply };
}

function platformDotClass(appId: string): string {
  if (appId === 'pinduoduo') return 'pdd';
  if (appId === 'win_qianniu') return 'qn';
  return 'other';
}

const InstanceCardComponent = ({
  instance,
  masterOn,
  selectedInstanceId,
  setSelectedInstanceId,
  handleDelete,
  openSettings,
  onShopAutoReplyChanged,
  hideManageActions = false,
}: InstanceCardComponentProps) => {
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
    instance.app_id === 'pinduoduo' && instance.login_status === 'logged_in';
  const halted = Boolean(instance.auto_reply_halt_reason) && !shopEnabled;
  const needsReopenBrowser =
    instance.app_id === 'pinduoduo' &&
    (instance.login_status === 'closed' ||
      instance.auto_reply_halt_reason === 'browser_closed');
  const title = `${platformLabel(instance.app_id)}-${shopNameOnly(instance)}`;

  const onReopenBrowser = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await reopenTaskBrowser(instance.task_id);
      onShopAutoReplyChanged?.();
      toast({
        title: '已重新打开浏览器',
        description: '若会话失效请重新扫码；登录成功后可再开「本店自动回」。',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: '无法打开浏览器',
        description: e instanceof Error ? e.message : String(e),
        status: 'error',
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };

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

  const selected = selectedInstanceId === instance.task_id;

  return (
    <Box
      className={`cs-lane${selected ? ' selected' : ''}${
        halted ? ' halted' : ''
      }`}
      onClick={() => setSelectedInstanceId(instance.task_id)}
    >
      <div className="cs-lane-body">
        <div className="cs-lane-row1">
          <span className={`cs-lane-dot ${platformDotClass(instance.app_id)}`} />
          <div className="cs-lane-name-wrap" title={title}>
            <span className="cs-lane-name">{title}</span>
          </div>
          <div
            className="cs-lane-actions"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            {instance.app_id === 'pinduoduo' && needsReopenBrowser && (
              <button
                type="button"
                className="cs-reopen-browser"
                disabled={busy}
                onClick={onReopenBrowser}
              >
                {busy ? '打开中…' : '重新打开浏览器'}
              </button>
            )}
            {instance.app_id === 'pinduoduo' && (
              <Tooltip
                label={
                  canToggle
                    ? shopEnabled
                      ? '关闭后本店改由人工接待（不关浏览器）'
                      : '开启本店自动回复（需总开关开启）'
                    : needsReopenBrowser
                      ? '请先点「重新打开浏览器」并完成扫码'
                      : '请先扫码登录并保持浏览器连接'
                }
              >
                <HStack spacing={1}>
                  <Text fontSize="11px" color="gray.500" whiteSpace="nowrap">
                    本店自动回
                  </Text>
                  <Switch
                    size="sm"
                    colorScheme="green"
                    isChecked={shopEnabled}
                    isDisabled={!canToggle || busy}
                    onChange={(e) => onToggleShop(e.target.checked)}
                  />
                </HStack>
              </Tooltip>
            )}
            {!hideManageActions && (
              <>
                <Tooltip label="本店设置">
                  <button
                    type="button"
                    className="cs-lane-icon"
                    aria-label="本店设置"
                    onClick={openSettings}
                  >
                    <SettingsIcon />
                  </button>
                </Tooltip>
                <Tooltip label="删除">
                  <button
                    type="button"
                    className="cs-lane-icon danger"
                    aria-label="Delete instance"
                    onClick={() => handleDelete(instance.task_id)}
                  >
                    <DeleteIcon />
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        </div>
        <div className="cs-lane-row2">
          <div className="cs-lane-pills">
            <span className={`cs-pill ${status.connection.tone}`}>
              {status.connection.label}
            </span>
            <span className={`cs-pill ${status.autoReply.tone}`}>
              {status.autoReply.label}
            </span>
            {instance.gateway_shop_id ? (
              <span className="cs-pill teal">知识已就绪</span>
            ) : instance.shop_name ? (
              <span className="cs-pill warn">待同步知识库</span>
            ) : null}
          </div>
        </div>
      </div>
    </Box>
  );
};

export default InstanceCardComponent;
