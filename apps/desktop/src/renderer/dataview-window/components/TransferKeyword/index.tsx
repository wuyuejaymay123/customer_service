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
  Alert,
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
import EditKeyword from '../EditTransferKeyword';
import {
  getTransferList,
  deleteTransferKeyword,
} from '../../../common/services/platform/controller';
import { TransferKeyword as TransferKeywordType } from '../../../common/services/platform/platform';

const TransferKeyword = () => {
  const [keywords, setKeywords] = useState<TransferKeywordType[]>([]);
  const [editKeyword, setEditKeyword] = useState<TransferKeywordType | null>(
    null,
  );
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [updated, setUpdated] = useState(false);

  const { data, isLoading, refetch } = useQuery(
    ['transferList'],
    () => {
      return getTransferList({
        page: 1,
        pageSize: 100,
        appId: '',
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
      setKeywords(data?.data);
    }
  }, [data]);

  if (isLoading) {
    return (
      <Stack>
        <Skeleton height="20px" />
        <Skeleton height="20px" />
        <Skeleton height="20px" />
      </Stack>
    );
  }

  const handleDoubleClick = (keyword: TransferKeywordType) => {
    setEditKeyword(keyword);
    onOpen();
  };

  const handleEdit = () => {
    refetch();
    onClose();
  };

  const handleDelete = async (id: number) => {
    await deleteTransferKeyword(id);
    refetch();
  };

  const handleAddKeyword = () => {
    const newKeyword: TransferKeywordType = {
      keyword: '',
      has_regular: false,
      fuzzy: true,
    };
    setKeywords([...keywords, newKeyword]);
    setEditKeyword(newKeyword);
    onOpen();
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" mb={2}>
        <Alert status="info" mr={'20px'}>
          匹配用户的输入，当用户输入的内容包含关键词时，自动转移会话给人工客服
        </Alert>
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

export default TransferKeyword;
