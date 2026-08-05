import React, { useEffect, useState } from 'react';
import {
  Flex,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Heading,
} from '@chakra-ui/react';
import ReplyKeyword from './components/ReplyKeyword';
import SessionHistory from './components/SessionHistory';
import ReplaceKeyword from './components/ReplaceKeyword';
import TransferKeyword from './components/TransferKeyword';

type Props = {
  /** 初始／受控页签：0 匹配 1 替换 2 转人工 3 历史 */
  initialTab?: number;
  /** 主壳已按领域拆入口时隐藏左侧页签，避免重复导航 */
  hideSidebar?: boolean;
};

const DataViewBody = ({ initialTab = 0, hideSidebar = false }: Props) => {
  const [tabIndex, setTabIndex] = useState(initialTab);

  useEffect(() => {
    setTabIndex(initialTab);
  }, [initialTab]);

  return (
    <Flex
      direction="column"
      height={hideSidebar ? '100%' : '99vh'}
      p={hideSidebar ? 0 : 2}
      minH={0}
    >
      <Flex direction="row" flex="1" minH={0}>
        <Tabs
          variant="enclosed"
          orientation="vertical"
          flex="1"
          index={tabIndex}
          onChange={setTabIndex}
        >
          {!hideSidebar && (
            <TabList
              p={4}
              width="200px"
              bg="gray.100"
              borderRight="1px solid"
              borderColor="gray.200"
            >
              <Tab
                _selected={{ bg: 'gray.200' }}
                _hover={{ bg: 'gray.300' }}
                textAlign="left"
              >
                编辑关键词
              </Tab>
              <Tab
                _selected={{ bg: 'gray.200' }}
                _hover={{ bg: 'gray.300' }}
                textAlign="left"
              >
                替换关键词
              </Tab>
              <Tab
                _selected={{ bg: 'gray.200' }}
                _hover={{ bg: 'gray.300' }}
                textAlign="left"
              >
                转人工关键词
              </Tab>
            </TabList>
          )}
          <TabPanels flex="1" overflowY="auto" p={4}>
            <TabPanel>
              <Heading as="h3" size="md" mb={4}>
                关键词匹配
              </Heading>
              <ReplyKeyword />
            </TabPanel>
            <TabPanel>
              <Heading as="h3" size="md" mb={4}>
                替换关键词
              </Heading>
              <ReplaceKeyword />
            </TabPanel>
            <TabPanel>
              <Heading as="h3" size="md" mb={4}>
                转人工关键词
              </Heading>
              <TransferKeyword />
            </TabPanel>
            {!hideSidebar && (
              <TabPanel>
                <Heading as="h3" size="md" mb={4}>
                  历史聊天记录
                </Heading>
                <SessionHistory />
              </TabPanel>
            )}
          </TabPanels>
        </Tabs>
      </Flex>
    </Flex>
  );
};

export default DataViewBody;
