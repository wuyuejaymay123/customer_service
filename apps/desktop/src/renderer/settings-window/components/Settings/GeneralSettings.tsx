import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { FiHelpCircle } from 'react-icons/fi';
import {
  Box,
  Icon,
  Flex,
  FormControl,
  FormLabel,
  Input,
  VStack,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  RangeSlider,
  RangeSliderTrack,
  RangeSliderFilledTrack,
  RangeSliderThumb,
  Text,
  Tooltip,
  useToast,
  Stack,
  Skeleton,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import {
  getConfig,
  updateConfig,
} from '../../../common/services/platform/controller';
import { GenericConfig } from '../../../common/services/platform/platform.d';

export type GeneralSettingsHandle = {
  save: () => Promise<void>;
};

const GeneralSettings = forwardRef<
  GeneralSettingsHandle,
  {
    appId?: string;
    instanceId?: string;
    style?: React.CSSProperties;
  }
>(({ appId, instanceId, style }, ref) => {
  const toast = useToast();

  const { data, isLoading } = useQuery(
    ['config', 'generic', appId, instanceId],
    async () => {
      try {
        const resp = await getConfig({
          appId,
          instanceId,
          type: 'generic',
        });
        return resp;
      } catch (error) {
        const errormsg =
          error instanceof Error ? error.message : JSON.stringify(error);
        toast({
          title: '获取配置失败',
          description: errormsg,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });

        return null;
      }
    },
  );

  const [config, setConfig] = useState<GenericConfig | null>(null);

  useEffect(() => {
    if (data) {
      const obj = data.data as GenericConfig;
      setConfig(obj);
    }
  }, [data]);

  const handleUpdateConfig = async (newConfig: Partial<GenericConfig>) => {
    if (!config) return;
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    try {
      await updateConfig({
        appId,
        instanceId,
        type: 'generic',
        cfg: updatedConfig,
      });
    } catch (error) {
      const errormsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      toast({
        title: '更新配置失败',
        description: errormsg,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const getReplySpeedStr = () => {
    if (!config) return '0 秒';
    if (config.replyRandomSpeed === 0) {
      // 保留两位小数
      return `${config.replySpeed.toFixed(2)} 秒`;
    }

    return `${config.replySpeed.toFixed(2)} 秒 ~ ${(config.replySpeed + config.replyRandomSpeed).toFixed(2)} 秒`;
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      await updateConfig({
        appId,
        instanceId,
        type: 'generic',
        cfg: config,
      });
      toast({
        title: '已保存',
        status: 'success',
        position: 'top',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      const errormsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      toast({
        title: '保存失败',
        description: errormsg,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  useImperativeHandle(ref, () => ({ save: handleSave }), [
    config,
    appId,
    instanceId,
  ]);

  if (isLoading || !data || !config) {
    return (
      <Stack>
        <Skeleton height="20px" />
        <Skeleton height="20px" />
        <Skeleton height="20px" />
      </Stack>
    );
  }

  return (
    <VStack spacing="4" align="start" style={style}>
      <Tooltip label="回复等待时间，当设置了随机时间则，等待时间为 “固定等待时间” + “随机等待时间”">
        <Text mb="8px">回复等待时间（单位秒）: {` ${getReplySpeedStr()}`}</Text>
      </Tooltip>
      <RangeSlider
        min={0}
        max={5}
        step={0.1}
        colorScheme="pink"
        defaultValue={[
          config.replySpeed !== undefined ? config.replySpeed : 0,
          config.replyRandomSpeed !== undefined ? config.replyRandomSpeed : 0,
        ]}
        onChangeEnd={([replySpeed, replyRandomSpeed]) =>
          handleUpdateConfig({ replySpeed, replyRandomSpeed })
        }
      >
        <RangeSliderTrack>
          <RangeSliderFilledTrack />
        </RangeSliderTrack>
        <Tooltip label="固定等待时间">
          <RangeSliderThumb index={0} />
        </Tooltip>
        <Tooltip label="随机等待时间">
          <RangeSliderThumb index={1} />
        </Tooltip>
      </RangeSlider>

      <Flex mt={3}>
        <Text mb="8px" mr={3}>
          聊天记录条数: {config.contextCount}
        </Text>
        <Tooltip label="开启智能回复时，会把最近若干条聊天记录传给系统生成回复；条数越多速度越慢">
          <Box color={'gray.500'}>
            <Icon as={FiHelpCircle} w={6} h={6} />
          </Box>
        </Tooltip>
      </Flex>
      <Slider
        min={1}
        max={20}
        step={1}
        value={config.contextCount}
        onChange={(contextCount) => handleUpdateConfig({ contextCount })}
      >
        <SliderTrack>
          <SliderFilledTrack />
        </SliderTrack>
        <SliderThumb />
      </Slider>

      <Flex mt={3}>
        <Text mb="8px" mr={3}>
          回复超时接管: {config.waitHumansTime || 60}秒
        </Text>
        <Tooltip label="买家发话后，自动回复超过此时长仍未成功发出，则发送安抚语、转接人工，并加入待接管提醒">
          <Box color={'gray.500'}>
            <Icon as={FiHelpCircle} w={6} h={6} />
          </Box>
        </Tooltip>
      </Flex>
      <Slider
        min={15}
        max={180}
        step={5}
        value={config.waitHumansTime || 60}
        onChange={(waitHumansTime) => handleUpdateConfig({ waitHumansTime })}
      >
        <SliderTrack>
          <SliderFilledTrack />
        </SliderTrack>
        <SliderThumb />
      </Slider>

      <Flex mt={3}>
        <Text mb="8px" mr={3}>
          接管冷却: {config.handoffCooldownSeconds || 900}秒
        </Text>
        <Tooltip label="转人工接管后，该买家会话暂停自动回复的时长，可在待接管列表手动提前恢复">
          <Box color={'gray.500'}>
            <Icon as={FiHelpCircle} w={6} h={6} />
          </Box>
        </Tooltip>
      </Flex>
      <Slider
        min={60}
        max={3600}
        step={60}
        value={config.handoffCooldownSeconds || 900}
        onChange={(handoffCooldownSeconds) =>
          handleUpdateConfig({ handoffCooldownSeconds })
        }
      >
        <SliderTrack>
          <SliderFilledTrack />
        </SliderTrack>
        <SliderThumb />
      </Slider>

      <FormControl mt={3}>
        <FormLabel>
          <Tooltip label="自动回复失败或超时时发给买家的短句，勿写「智能」「系统」「机器人」等露馅词；与默认回复分开">
            <Text mb="8px">失败转人工安抚语</Text>
          </Tooltip>
        </FormLabel>
        <Input
          placeholder="稍等，我帮您找同事看一下"
          value={config.failureHandoffReply || ''}
          onChange={(e) =>
            handleUpdateConfig({ failureHandoffReply: e.target.value })
          }
        />
      </FormControl>

      <Flex mt={3}>
        <Text mb="8px" mr={3}>
          字数截断设置: {config.truncateWordCount}
        </Text>
        <Tooltip label="当回复的字数超过设置的字数时，将会截断回复内容，并转为新发一条回复">
          <Box color={'gray.500'}>
            <Icon as={FiHelpCircle} w={6} h={6} />
          </Box>
        </Tooltip>
      </Flex>
      <Slider
        min={50}
        max={4000}
        step={5}
        value={config.truncateWordCount}
        onChange={(truncateWordCount) =>
          handleUpdateConfig({ truncateWordCount })
        }
      >
        <SliderTrack>
          <SliderFilledTrack />
        </SliderTrack>
        <SliderThumb />
      </Slider>

      <FormControl mt={3}>
        <FormLabel>
          {' '}
          <Tooltip label="当匹配到这个关键词时，自动截断消息，转为新发一条回复，不写则不根据关键词截断">
            <Text mb="8px">截断关键词</Text>
          </Tooltip>
        </FormLabel>
        <Flex>
          <Input
            placeholder="截断关键词"
            max={5}
            value={config.truncateWordKey}
            onChange={(e) =>
              handleUpdateConfig({ truncateWordKey: e.target.value })
            }
          />
        </Flex>
      </FormControl>
    </VStack>
  );
});

GeneralSettings.displayName = 'GeneralSettings';

export default GeneralSettings;
