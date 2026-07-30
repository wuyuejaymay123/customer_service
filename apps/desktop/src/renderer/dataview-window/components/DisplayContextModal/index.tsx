import React from 'react';
import {
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  VStack,
  Text,
} from '@chakra-ui/react';

interface DisplayContextModalProps {
  data: string;
  isOpen: boolean;
  onClose: () => void;
}

type ParsedData = [string, string | boolean][];

const DisplayContextModal: React.FC<DisplayContextModalProps> = ({
  data,
  isOpen,
  onClose,
}) => {
  const parseData = (
    // eslint-disable-next-line @typescript-eslint/no-shadow
    data: string | [string, string | boolean][] | null,
  ): ParsedData | null => {
    if (!data) return null;

    if (Array.isArray(data)) {
      return data;
    }
    try {
      const parsedData = JSON.parse(data);
      if (Array.isArray(parsedData)) {
        return parsedData;
      }
      return null;
    } catch {
      return null;
    }
  };

  const renderContent = (
    parsedData: ParsedData | null,
    rawData: string,
  ): React.ReactNode => {
    if (parsedData) {
      return (
        <VStack align="start">
          {parsedData.map(([key, value], index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text key={index}>
              <strong>{key}:</strong> {String(value)}
            </Text>
          ))}
        </VStack>
      );
    }
    return <Text>{rawData}</Text>;
  };

  const parsedData = parseData(data);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>详情</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {data ? renderContent(parsedData, data) : <Text>暂无数据</Text>}
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={onClose}>
            关闭
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DisplayContextModal;
