import React from 'react';
import {
  Box,
  Button,
  Text,
  VStack,
  Stack,
} from '@chakra-ui/react';
import PageContainer from '../../../common/components/PageContainer';
import Markdown from '../../../common/components/Markdown';
import { trackPageView } from '../../../common/services/analytics';

const AboutPage: React.FC = () => {
  const currentVersion = window.electron.ipcRenderer.get('get-version');

  React.useEffect(() => {
    trackPageView('AboutPage');
  }, []);

  return (
    <PageContainer>
      <VStack>
        <Markdown
          content={`
本产品为商户智能客服客户端：智能回复经运营方网关扣点数，不支持自行配置接口密钥。

## 已支持渠道
* 拼多多商家客服

千牛及其他社交／电商平台本版不提供。

## 使用说明
请先在“设置 → 网关账户”登录，再在主窗口创建对应平台实例并开启自动回复。

如需更新客户端，请联系运营方获取安装包（见 docs/RELEASE.md）。
生产部署请遵循 docs/PRODUCTION.md（必须设置 JWT_SECRET）。
      `}
        />
      </VStack>

      <br />

      <Box p={5}>
        <Stack spacing={3}>
          <Text fontWeight="bold">版本信息</Text>
          <Text>智能客服 {currentVersion}</Text>
          <Text fontSize="sm" color="gray.600">
            本客户端不自动检查远程更新。获取新版本请联系运营方。
          </Text>
        </Stack>
      </Box>
    </PageContainer>
  );
};

export default AboutPage;
