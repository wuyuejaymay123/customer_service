import React, { useState } from 'react';
import {
  Box,
  Button,
  Heading,
  Input,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { DEFAULT_GATEWAY_URL } from '../../../common/gatewayDefaults';

type Props = {
  onSuccess: () => void;
};

/**
 * 未登录时唯一可见页：账号密码登录网关。
 */
const LoginPage = ({ onSuccess }: Props) => {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      toast({
        title: '请输入账号和密码',
        status: 'warning',
        position: 'top',
        duration: 3000,
      });
      return;
    }
    setBusy(true);
    try {
      const result = await window.electron?.ipcRenderer?.invoke(
        'gateway:login',
        {
          gatewayUrl: DEFAULT_GATEWAY_URL,
          username: username.trim(),
          password,
        },
      );
      if (result?.ok) {
        toast({
          title: '登录成功',
          status: 'success',
          position: 'top',
          duration: 2000,
        });
        onSuccess();
      } else {
        toast({
          title: '登录失败',
          description: result?.message || '账号或密码错误',
          status: 'error',
          position: 'top',
          duration: 5000,
        });
      }
    } catch (e) {
      toast({
        title: '登录失败',
        description: e instanceof Error ? e.message : String(e),
        status: 'error',
        position: 'top',
        duration: 5000,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="#eef2f7"
      px={4}
    >
      <Box
        w="100%"
        maxW="380px"
        bg="#fff"
        borderRadius="12px"
        border="1px solid #e2e8f0"
        p={8}
        boxShadow="0 8px 28px rgba(20,30,50,0.08)"
      >
        <VStack spacing={5} align="stretch">
          <Heading size="md" textAlign="center">
            智能客服
          </Heading>
          <Text fontSize="sm" color="gray.500" textAlign="center">
            请使用运营方提供的商户账号登录
          </Text>
          <Input
            placeholder="账号"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLogin();
            }}
          />
          <Input
            placeholder="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLogin();
            }}
          />
          <Button
            colorScheme="teal"
            isLoading={busy}
            onClick={handleLogin}
            h="42px"
          >
            登录
          </Button>
        </VStack>
      </Box>
    </Box>
  );
};

export default LoginPage;
