import React, { useCallback, useEffect, useState } from 'react';
import {
  FormControl,
  FormLabel,
  FormHelperText,
  Textarea,
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  Divider,
  Heading,
  HStack,
  Input,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { DEFAULT_GATEWAY_URL } from '../../../../common/gatewayDefaults';

type MeData = {
  user?: { role?: string; username?: string };
  wallet?: { available?: number; balance?: number; reserved?: number };
  lowBalance?: boolean;
  tenant?: { name?: string; status?: string };
};

const statusLabel = (s?: string) =>
  s === 'active' ? '正常' : s === 'suspended' ? '已停用' : s || '-';

const roleLabel = (r?: string) =>
  r === 'tenant_admin'
    ? '商户管理员'
    : r === 'operator'
      ? '客服账号'
      : r || '-';

const AccountSettings = () => {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [me, setMe] = useState<MeData | null>(null);
  const [savedUsername, setSavedUsername] = useState('');
  const [ops, setOps] = useState<
    Array<{
      id: string;
      username: string;
      quota_limit: string | null;
      quota_used: string;
    }>
  >([]);
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newQuota, setNewQuota] = useState('');
  const [checking, setChecking] = useState(true);
  const [curPass, setCurPass] = useState('');
  const [newOwnPass, setNewOwnPass] = useState('');
  const [recharges, setRecharges] = useState<
    Array<{
      id: string;
      amount_credit: string;
      note: string | null;
      created_at: string;
    }>
  >([]);
  const [usage, setUsage] = useState<
    Array<{
      id: string;
      credit_charged: string;
      created_at: string;
    }>
  >([]);
  const [tenantVoice, setTenantVoice] = useState('');
  const [voiceMax, setVoiceMax] = useState(2000);
  const [voiceCanEdit, setVoiceCanEdit] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);

  const isLoggedIn = Boolean(me?.user);

  const refreshMe = useCallback(async () => {
    const result = await window.electron?.ipcRenderer?.invoke('gateway:me');
    if (result?.ok) {
      setMe(result.me);
      if (result.me?.user?.role === 'tenant_admin') {
        const list = await window.electron?.ipcRenderer?.invoke(
          'gateway:list-operators',
        );
        if (list?.ok) setOps(list.data || []);
      } else {
        setOps([]);
      }
      const voice = await window.electron?.ipcRenderer?.invoke(
        'gateway:get-tenant-voice',
      );
      if (voice?.ok && voice.data) {
        setTenantVoice(voice.data.content || '');
        setVoiceMax(voice.data.maxChars || 2000);
        setVoiceCanEdit(Boolean(voice.data.canEdit));
      }
      return true;
    }
    setMe(null);
    setOps([]);
    setTenantVoice('');
    setVoiceCanEdit(false);
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = await window.electron?.ipcRenderer?.invoke(
          'gateway:get-auth',
        );
        if (!cancelled && auth) {
          setGatewayUrl(DEFAULT_GATEWAY_URL);
          setUsername(auth.username || '');
          setSavedUsername(auth.username || '');
        }
        if (!cancelled) {
          await refreshMe();
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })().catch(() => {
      if (!cancelled) setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  const handleLogin = async () => {
    try {
      const result = await window.electron?.ipcRenderer?.invoke(
        'gateway:login',
        { gatewayUrl: DEFAULT_GATEWAY_URL, username, password },
      );
      setGatewayUrl(DEFAULT_GATEWAY_URL);
      if (result?.ok) {
        setMe(result.me);
        setSavedUsername(username.trim());
        setPassword('');
        setStatus(
          result.me?.lowBalance
            ? '登录成功（点数偏低，请联系运营充值）'
            : '登录成功，下次打开将自动保持登录',
        );
        await refreshMe();
      } else {
        setStatus(result?.message || '登录失败');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const handleLogout = async () => {
    const result = await window.electron?.ipcRenderer?.invoke('gateway:logout');
    if (result?.ok) {
      setMe(null);
      setOps([]);
      setPassword('');
      setStatus('已退出登录');
    } else {
      setStatus(result?.message || '退出失败');
    }
  };

  const handleCreateOp = async () => {
    const result = await window.electron?.ipcRenderer?.invoke(
      'gateway:create-operator',
      {
        username: newUser,
        password: newPass,
        quotaLimit: newQuota ? Number(newQuota) : null,
      },
    );
    if (result?.ok) {
      setNewUser('');
      setNewPass('');
      setNewQuota('');
      setStatus('已创建客服账号');
      await refreshMe();
    } else {
      setStatus(result?.message || '创建失败');
    }
  };

  const isTenantAdmin = me?.user?.role === 'tenant_admin';

  return (
    <Container maxW="720px">
      <VStack spacing="4" align="stretch" mt="6" mb="10">
        <Heading size="md">网关账户</Heading>
        <Text fontSize="sm" color="gray.600">
          智能回复须经运营方网关扣点数；不可自行配置接口密钥。登录一次后会记住，下次打开自动保持登录。
        </Text>
        <Text fontSize="xs" color="gray.500">
          点数参考：100 点 ≈ ¥1；按约 3 点／次估算，¥100 ≈ 约 3,000
          次智能回复。约值，视对话长短与知识注入浮动，以实际扣点为准。
        </Text>

        {checking && (
          <Text fontSize="sm" color="gray.500">
            正在检查登录状态…
          </Text>
        )}

        {!checking && isLoggedIn && (
          <>
            {me?.lowBalance && (
              <Alert status="warning">
                <AlertIcon />
                点数余额偏低，请联系运营方充值，否则智能回复将停止。
              </Alert>
            )}

            <Box
              fontSize="sm"
              p={3}
              borderWidth="1px"
              borderColor="gray.200"
              borderRadius="md"
              bg="gray.50"
            >
              <Text>
                已登录：{savedUsername || me?.user?.username || '-'}（
                {roleLabel(me?.user?.role)}）
              </Text>
              <Text mt={1}>
                商户：{me?.tenant?.name || '-'}（
                {statusLabel(me?.tenant?.status)}）
              </Text>
              <Text mt={1}>
                可用点数：{me?.wallet?.available ?? '-'}（余额{' '}
                {me?.wallet?.balance ?? '-'}／冻结 {me?.wallet?.reserved ?? '-'}
                ）
              </Text>
              <Text mt={1} color="gray.500" fontSize="xs">
                网关：{gatewayUrl}
              </Text>
            </Box>

            <HStack>
              <Button variant="outline" onClick={() => refreshMe()}>
                刷新余额
              </Button>
              <Button variant="ghost" colorScheme="red" onClick={handleLogout}>
                退出登录
              </Button>
            </HStack>

            <Divider />
            <Heading size="sm">商户补充规则（TenantVoice）</Heading>
            <Text fontSize="sm" color="gray.600">
              作用于本账号下全部店铺的口吻与补充说明。可留空。平台硬规则（禁编造商品、禁说转人工等）始终生效，此处不能覆盖。
            </Text>
            <FormControl>
              <FormLabel fontSize="sm">
                补充规则（{tenantVoice.length}/{voiceMax}）
              </FormLabel>
              <Textarea
                rows={8}
                value={tenantVoice}
                isDisabled={!voiceCanEdit}
                onChange={(e) => setTenantVoice(e.target.value)}
                placeholder="例如：称呼用「亲」；偏简洁；售后先问订单号…"
              />
              <FormHelperText>
                {voiceCanEdit
                  ? '不可包含「转人工」「机器人」「AI」等词；保存后立即对智能回复生效。'
                  : '仅商户管理员可编辑。'}
              </FormHelperText>
            </FormControl>
            {voiceCanEdit && (
              <Button
                colorScheme="teal"
                alignSelf="flex-start"
                isLoading={voiceSaving}
                onClick={async () => {
                  setVoiceSaving(true);
                  try {
                    const res = await window.electron?.ipcRenderer?.invoke(
                      'gateway:save-tenant-voice',
                      tenantVoice,
                    );
                    if (res?.ok) {
                      setTenantVoice(res.data?.content ?? tenantVoice);
                      setStatus('已保存商户补充规则');
                    } else {
                      setStatus(res?.message || '保存失败');
                    }
                  } finally {
                    setVoiceSaving(false);
                  }
                }}
              >
                保存补充规则
              </Button>
            )}

            <Divider />
            <Heading size="sm">修改登录密码</Heading>
            <Input
              placeholder="当前密码"
              type="password"
              value={curPass}
              onChange={(e) => setCurPass(e.target.value)}
            />
            <Input
              placeholder="新密码（至少 6 位）"
              type="password"
              value={newOwnPass}
              onChange={(e) => setNewOwnPass(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const result = await window.electron?.ipcRenderer?.invoke(
                  'gateway:change-password',
                  {
                    currentPassword: curPass,
                    newPassword: newOwnPass,
                  },
                );
                if (result?.ok) {
                  setCurPass('');
                  setNewOwnPass('');
                  setStatus('密码已修改，请牢记新密码');
                } else {
                  setStatus(result?.message || '修改失败');
                }
              }}
            >
              保存新密码
            </Button>
          </>
        )}

        {!checking && !isLoggedIn && (
          <>
            <Text fontSize="xs" color="gray.500">
              请使用运营方提供的商户账号登录（网关已内置，无需填写地址）。
            </Text>
            <Input
              placeholder="账号"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
            <Input
              placeholder="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <HStack>
              <Button colorScheme="teal" onClick={handleLogin}>
                登录
              </Button>
            </HStack>
          </>
        )}

        {status && (
          <Alert
            status={
              status.includes('成功') ||
              status.includes('已创建') ||
              status.includes('已新增') ||
              status.includes('已删除') ||
              status.includes('已退出') ||
              status.includes('已修改') ||
              status.includes('已保存') ||
              status.includes('已更新') ||
              status.includes('已重置')
                ? 'success'
                : 'error'
            }
          >
            <AlertIcon />
            {status}
          </Alert>
        )}

        {isLoggedIn && (
          <>
            <Divider />
            <Heading size="sm">对账与用量</Heading>
            <HStack>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const [r, u] = await Promise.all([
                    window.electron?.ipcRenderer?.invoke(
                      'gateway:list-recharges',
                    ),
                    window.electron?.ipcRenderer?.invoke('gateway:list-usage'),
                  ]);
                  if (r?.ok) setRecharges(r.data || []);
                  if (u?.ok) setUsage(u.data || []);
                  if (!r?.ok && !u?.ok) {
                    setStatus(r?.message || u?.message || '加载失败');
                  }
                }}
              >
                刷新流水
              </Button>
            </HStack>
            <Text fontSize="sm" fontWeight="medium">
              最近充值
            </Text>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>时间</Th>
                  <Th>点数</Th>
                  <Th>备注</Th>
                </Tr>
              </Thead>
              <Tbody>
                {recharges.slice(0, 20).map((x) => (
                  <Tr key={x.id}>
                    <Td>{x.created_at}</Td>
                    <Td>{x.amount_credit}</Td>
                    <Td>{x.note || '-'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {recharges.length === 0 && (
              <Text fontSize="xs" color="gray.500">
                暂无充值记录（点上方刷新）
              </Text>
            )}
            <Text fontSize="sm" fontWeight="medium" mt={2}>
              点数流水
            </Text>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>时间</Th>
                  <Th>用量</Th>
                </Tr>
              </Thead>
              <Tbody>
                {usage.slice(0, 50).map((x) => (
                  <Tr key={x.id}>
                    <Td>{x.created_at}</Td>
                    <Td>{x.credit_charged}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {usage.length === 0 && (
              <Text fontSize="xs" color="gray.500">
                暂无扣点记录（点上方刷新）
              </Text>
            )}
          </>
        )}

        {isTenantAdmin && (
          <>
            <Divider />
            <Heading size="sm">客服账号管理</Heading>
            <Text fontSize="sm" color="gray.600">
              为同事开通账号，并可设置／重置用量上限。
            </Text>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>账号</Th>
                  <Th>已用／上限</Th>
                  <Th>操作</Th>
                </Tr>
              </Thead>
              <Tbody>
                {ops.map((o) => (
                  <Tr key={o.id}>
                    <Td>{o.username}</Td>
                    <Td>
                      {o.quota_used} / {o.quota_limit ?? '不限'}
                    </Td>
                    <Td>
                      <HStack>
                        <Button
                          size="xs"
                          onClick={async () => {
                            const v = window.prompt(
                              '新用量上限（留空＝不限）',
                              o.quota_limit ?? '',
                            );
                            if (v === null) return;
                            const result =
                              await window.electron?.ipcRenderer?.invoke(
                                'gateway:update-operator-quota',
                                {
                                  operatorId: o.id,
                                  quotaLimit: v.trim() === '' ? null : Number(v),
                                },
                              );
                            if (result?.ok) {
                              setStatus('已更新用量上限');
                              await refreshMe();
                            } else {
                              setStatus(result?.message || '更新失败');
                            }
                          }}
                        >
                          改上限
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={async () => {
                            const result =
                              await window.electron?.ipcRenderer?.invoke(
                                'gateway:reset-operator-quota',
                                { operatorId: o.id },
                              );
                            if (result?.ok) {
                              setStatus('已重置已用用量');
                              await refreshMe();
                            } else {
                              setStatus(result?.message || '重置失败');
                            }
                          }}
                        >
                          重置已用
                        </Button>
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            <Input
              placeholder="新客服账号"
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
            />
            <Input
              placeholder="密码"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
            <Input
              placeholder="用量上限（可留空）"
              value={newQuota}
              onChange={(e) => setNewQuota(e.target.value)}
            />
            <Button
              colorScheme="teal"
              variant="outline"
              onClick={handleCreateOp}
            >
              新增客服账号
            </Button>
          </>
        )}
      </VStack>
    </Container>
  );
};

export default AccountSettings;
