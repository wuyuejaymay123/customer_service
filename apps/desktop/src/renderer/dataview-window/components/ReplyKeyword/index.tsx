import React, { useState, useEffect } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Flex,
  TableContainer,
  useDisclosure,
  Text,
  Button,
  IconButton,
  Box,
  Skeleton,
  Stack,
  Tooltip,
  HStack,
  Grid,
} from '@chakra-ui/react';
import { DeleteIcon, AddIcon, EditIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import EditKeyword from '../EditKeyword';
import {
  getReplyList,
  deleteReplyKeyword,
} from '../../../common/services/platform/controller';
import { Keyword } from '../../../common/services/platform/platform';

const ReplyKeyword = ({ shopId }: { shopId?: string }) => {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [editKeyword, setEditKeyword] = useState<Keyword | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [updated, setUpdated] = useState(false);

  const { data, isLoading, refetch } = useQuery(
    ['replyList', shopId],
    () => {
      return getReplyList({
        page: 1,
        pageSize: 100,
        ptfId: '',
      });
    },
    {
      retry: () => {
        return true;
      },
      retryDelay: () => {
        return 1000;
      },
    },
  );

  useEffect(() => {
    if (data) {
      const all = data?.data || [];
      if (!shopId) {
        setKeywords([]);
        return;
      }
      setKeywords(
        all.filter((k) => !k.shop_id || k.shop_id === shopId),
      );
    }
  }, [data, shopId]);

  if (isLoading) {
    return (
      <Stack>
        <Skeleton height="20px" />
        <Skeleton height="20px" />
        <Skeleton height="20px" />
      </Stack>
    );
  }

  const handleDoubleClick = (keyword: Keyword) => {
    setEditKeyword(keyword);
    onOpen();
  };

  const handleEdit = () => {
    refetch();
    onClose();
    setUpdated(false);
  };

  const handleDelete = async (id: number) => {
    await deleteReplyKeyword(id);
    refetch();
  };

  const handleAddKeyword = () => {
    if (!shopId) return;
    const newKeyword: Keyword = {
      keyword: '',
      reply: '',
      mode: 'fuzzy',
      shop_id: shopId,
    };
    setKeywords([...keywords, newKeyword]);
    setEditKeyword(newKeyword);
    onOpen();
  };

  if (!shopId) {
    return (
      <Text fontSize="sm" color="gray.500">
        请先在上方选择店铺。
      </Text>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" mb={2}>
        <Text>编辑回复关键词（当前店）</Text>
        <Flex alignItems="center">
          <HStack>
            <Button
              size="sm"
              leftIcon={<AddIcon />}
              color="white"
              bgGradient="linear(to-r, teal.500, green.500)"
              _hover={{
                bgGradient: 'linear(to-r, teal.300, green.300)',
              }}
              variant="solid"
              onClick={handleAddKeyword}
              isLoading={updated}
            >
              新增关键词
            </Button>
          </HStack>
        </Flex>
      </Box>
      <TableContainer maxH={'70vh'} overflowY="scroll">
        <Table variant="striped" size="sm" className="table-tiny">
          <Thead>
            <Tr>
              <Th>平台</Th>
              <Th>关键词</Th>
              <Th>回复内容</Th>
              <Th>模糊匹配</Th>
              <Th>正则</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {keywords.map((keyword) => (
              <Tr
                sx={{ height: '30px' }}
                key={keyword.id}
                onDoubleClick={() => handleDoubleClick(keyword)}
              >
                <Td>{keyword.app_name}</Td>
                <Td
                  maxW="80px"
                  whiteSpace="nowrap"
                  overflow="hidden"
                  textOverflow="ellipsis"
                >
                  {keyword.keyword}
                </Td>
                <Td
                  maxW="150px"
                  whiteSpace="nowrap"
                  overflow="hidden"
                  textOverflow="ellipsis"
                >
                  {keyword.reply}
                </Td>
                <Td>{keyword.fuzzy ? '是' : '否'}</Td>
                <Td>{keyword.has_regular ? '是' : '否'}</Td>
                <Td>
                  <Grid templateColumns="repeat(2, 1fr)" gap={2}>
                    <Tooltip label="删除">
                      <IconButton
                        size="xs"
                        fontSize="13px"
                        colorScheme="red"
                        aria-label="Delete keyword"
                        icon={<DeleteIcon />}
                        onClick={() => keyword.id && handleDelete(keyword.id)}
                      />
                    </Tooltip>

                    <Tooltip label="编辑">
                      <IconButton
                        size="xs"
                        fontSize="13px"
                        colorScheme="blue"
                        aria-label="Edit keyword"
                        icon={<EditIcon />}
                        onClick={() => {
                          setEditKeyword(keyword);
                          onOpen();
                        }}
                      />
                    </Tooltip>
                  </Grid>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      <EditKeyword
        isOpen={isOpen}
        onClose={onClose}
        editKeyword={editKeyword}
        handleEdit={handleEdit}
      />
    </Box>
  );
};

export default ReplyKeyword;
