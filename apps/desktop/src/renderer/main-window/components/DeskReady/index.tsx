import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { getTasks } from '../../../common/services/platform/controller';

type Props = {
  children: React.ReactNode;
};

/**
 * 登录闸道已在 App 层处理；此处仅在无店铺时给出轻提示。
 */
const DeskReady = ({ children }: Props) => {
  const { data: tasksData } = useQuery(['tasks'], () => getTasks(), {
    refetchInterval: 4000,
  });
  const taskCount = tasksData?.data?.length || 0;

  return (
    <>
      {taskCount === 0 && (
        <Box
          mb={3}
          p={3}
          borderWidth="1px"
          borderColor="teal.200"
          bg="teal.50"
          borderRadius="md"
        >
          <Text fontSize="sm">
            请到左侧「单店管理」添加拼多多店铺，并在弹出的浏览器中扫码登录。
          </Text>
        </Box>
      )}
      {children}
    </>
  );
};

export default DeskReady;
