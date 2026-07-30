import React, { useEffect, useState } from 'react';
import { FormControl, FormLabel, HStack, Select, Text } from '@chakra-ui/react';

const STORAGE_KEY = 'cs_keyword_workbench_shop_id';

type Shop = { id: string; display_name: string; channel: string };

/** 关键词工作台：进门须选当前 Shop（G27） */
export function useKeywordShopScope() {
  const [shopId, setShopId] = useState(
    () => localStorage.getItem(STORAGE_KEY) || '',
  );
  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    window.electron?.ipcRenderer
      ?.invoke('gateway:list-shops')
      .then((res: { ok?: boolean; data?: Shop[] }) => {
        if (res?.ok) setShops(res.data || []);
      })
      .catch(() => undefined);
  }, []);

  const selectShop = (id: string) => {
    setShopId(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  return { shopId, shops, selectShop };
}

export function KeywordShopScopeBar({
  shopId,
  shops,
  onChange,
}: {
  shopId: string;
  shops: Shop[];
  onChange: (id: string) => void;
}) {
  return (
    <FormControl mb={4} maxW="420px">
      <FormLabel fontSize="sm">当前店铺（关键词按店维护）</FormLabel>
      <HStack>
        <Select
          size="sm"
          bg="white"
          value={shopId}
          placeholder={shops.length ? '请选择店铺' : '请先登录网关并创建店铺'}
          onChange={(e) => onChange(e.target.value)}
        >
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name}（{s.channel}）
            </option>
          ))}
        </Select>
      </HStack>
      {!shopId && (
        <Text fontSize="xs" color="orange.600" mt={1}>
          请先选择店铺，再编辑关键词，避免串到其他店。
        </Text>
      )}
    </FormControl>
  );
}
