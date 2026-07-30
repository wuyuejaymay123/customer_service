import React from 'react';
import { Alert, AlertIcon, Box, Text, VStack } from '@chakra-ui/react';

/**
 * 原 BYOK／第三方 Key 设定已停用。
 * AI 一律走运营方网关；请到“账户／网关”页登录。
 */
const LLMSettings: React.FC<{ appId?: string; instanceId?: string }> = () => {
  return (
    <Box p={6}>
      <VStack align="stretch" spacing={4}>
        <Alert status="info">
          <AlertIcon />
          已禁止自行配置接口密钥。智能回复由运营方网关统一提供并扣点数。
        </Alert>
        <Text>
          请在设置中的「网关账户」页填写网关地址并登录商户管理员或客服
          账号。回复风格与模型由运营后台配置。
        </Text>
        <Text fontSize="sm" color="gray.600">
          店内话术与政策请继续使用本机「关键词」；网关会附带当前咨询的商品信息。
        </Text>
      </VStack>
    </Box>
  );
};

export default LLMSettings;
