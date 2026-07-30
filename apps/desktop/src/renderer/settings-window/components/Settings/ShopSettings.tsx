import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Select,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';

type Shop = {
  id: string;
  display_name: string;
  channel: string;
  external_keys: string[];
  positioning?: string;
  logistics?: string;
  after_sales?: string;
  forbidden?: string;
  transfer_rules?: string;
};

type GoodsNote = {
  id: string;
  shop_id: string;
  goods_id: string | null;
  title_aliases: string[];
  selling_points: string;
  specs_notes: string;
  objections: string;
};

function splitCsv(s: string): string[] {
  return s
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const emptyShopForm = {
  displayName: '',
  channel: 'pinduoduo' as 'pinduoduo' | 'qianniu',
  externalKeys: '',
  positioning: '',
  logistics: '',
  afterSales: '',
  forbidden: '',
  transferRules: '',
};

const ShopSettings = () => {
  const [status, setStatus] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shopForm, setShopForm] = useState(emptyShopForm);

  const [policy, setPolicy] = useState({
    logistics: '',
    afterSales: '',
    forbidden: '',
    transferRules: '',
  });

  const [noteShopId, setNoteShopId] = useState('');
  const [notes, setNotes] = useState<GoodsNote[]>([]);
  const [noteForm, setNoteForm] = useState({
    goodsId: '',
    titleAliases: '',
    sellingPoints: '',
    specsNotes: '',
    objections: '',
  });

  const isAdmin = role === 'tenant_admin';
  const canEditNotes = role === 'tenant_admin' || role === 'operator';

  const refreshShops = useCallback(async () => {
    const res = await window.electron?.ipcRenderer?.invoke('gateway:list-shops');
    if (res?.ok) {
      setShops(res.data || []);
      if (!noteShopId && res.data?.[0]?.id) {
        setNoteShopId(res.data[0].id);
      }
    } else {
      setStatus(res?.message || '无法加载店铺（请先在“网关账户”登录）');
    }
  }, [noteShopId]);

  const refreshPolicy = useCallback(async () => {
    const res = await window.electron?.ipcRenderer?.invoke('gateway:get-policy');
    if (res?.ok && res.data) {
      setPolicy({
        logistics: res.data.logistics || '',
        afterSales: res.data.after_sales || '',
        forbidden: res.data.forbidden || '',
        transferRules: res.data.transfer_rules || '',
      });
    }
  }, []);

  const refreshNotes = useCallback(async (shopId: string) => {
    if (!shopId) {
      setNotes([]);
      return;
    }
    const res = await window.electron?.ipcRenderer?.invoke(
      'gateway:list-goods-notes',
      shopId,
    );
    if (res?.ok) setNotes(res.data || []);
  }, []);

  useEffect(() => {
    window.electron?.ipcRenderer
      ?.invoke('gateway:me')
      .then((res: { ok?: boolean; me?: { user?: { role?: string } } }) => {
        if (res?.ok) setRole(res.me?.user?.role || null);
      })
      .catch(() => undefined);
    refreshShops().catch(() => undefined);
    refreshPolicy().catch(() => undefined);
  }, [refreshShops, refreshPolicy]);

  useEffect(() => {
    refreshNotes(noteShopId).catch(() => undefined);
  }, [noteShopId, refreshNotes]);

  const loadShopIntoForm = (s: Shop) => {
    setEditingId(s.id);
    setShopForm({
      displayName: s.display_name,
      channel: (s.channel as 'pinduoduo' | 'qianniu') || 'pinduoduo',
      externalKeys: (s.external_keys || []).join(','),
      positioning: s.positioning || '',
      logistics: s.logistics || '',
      afterSales: s.after_sales || '',
      forbidden: s.forbidden || '',
      transferRules: s.transfer_rules || '',
    });
  };

  const resetShopForm = () => {
    setEditingId(null);
    setShopForm(emptyShopForm);
  };

  const handleSaveShop = async () => {
    if (!shopForm.displayName.trim()) {
      setStatus('店铺显示名不可为空');
      return;
    }
    const payload = {
      displayName: shopForm.displayName.trim(),
      channel: shopForm.channel,
      externalKeys: splitCsv(shopForm.externalKeys),
      positioning: shopForm.positioning,
      logistics: shopForm.logistics,
      afterSales: shopForm.afterSales,
      forbidden: shopForm.forbidden,
      transferRules: shopForm.transferRules,
    };
    const res = editingId
      ? await window.electron?.ipcRenderer?.invoke('gateway:update-shop', {
          id: editingId,
          ...payload,
        })
      : await window.electron?.ipcRenderer?.invoke(
          'gateway:create-shop',
          payload,
        );
    if (res?.ok) {
      setStatus(editingId ? '已更新店铺' : '已创建店铺');
      resetShopForm();
      await refreshShops();
    } else {
      setStatus(res?.message || '保存店铺失败');
    }
  };

  const handleDeleteShop = async (id: string) => {
    const res = await window.electron?.ipcRenderer?.invoke(
      'gateway:delete-shop',
      id,
    );
    if (res?.ok) {
      setStatus('已删除店铺');
      if (editingId === id) resetShopForm();
      if (noteShopId === id) setNoteShopId('');
      await refreshShops();
    } else {
      setStatus(res?.message || '删除失败');
    }
  };

  const handleSavePolicy = async () => {
    const res = await window.electron?.ipcRenderer?.invoke(
      'gateway:save-policy',
      policy,
    );
    setStatus(res?.ok ? '已保存公司政策' : res?.message || '保存政策失败');
  };

  const handleAddNote = async () => {
    if (!noteShopId) {
      setStatus('请先选择店铺');
      return;
    }
    const res = await window.electron?.ipcRenderer?.invoke(
      'gateway:create-goods-note',
      {
        shopId: noteShopId,
        goodsId: noteForm.goodsId || null,
        titleAliases: splitCsv(noteForm.titleAliases),
        sellingPoints: noteForm.sellingPoints,
        specsNotes: noteForm.specsNotes,
        objections: noteForm.objections,
      },
    );
    if (res?.ok) {
      setStatus('已新增商品卖点');
      setNoteForm({
        goodsId: '',
        titleAliases: '',
        sellingPoints: '',
        specsNotes: '',
        objections: '',
      });
      await refreshNotes(noteShopId);
    } else {
      setStatus(res?.message || '新增卖点失败');
    }
  };

  const handleDeleteNote = async (id: string) => {
    const res = await window.electron?.ipcRenderer?.invoke(
      'gateway:delete-goods-note',
      id,
    );
    if (res?.ok) {
      setStatus('已删除卖点');
      await refreshNotes(noteShopId);
    } else {
      setStatus(res?.message || '删除失败');
    }
  };

  if (!role) {
    return (
      <Container maxW="760px">
        <Alert status="warning">
          <AlertIcon />
          请先在“网关账户”登录后再维护店铺。
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxW="760px" pb={10}>
      <VStack spacing={4} align="stretch">
        <Text fontSize="sm" color="gray.600">
          按店维护政策与商品卖点；扫码登录后自动绑定对应店铺。与运营方管理后台共用同一网关资料。
        </Text>

        {status && (
          <Alert
            status={
              status.includes('已') && !status.includes('失败')
                ? 'success'
                : 'error'
            }
          >
            <AlertIcon />
            {status}
          </Alert>
        )}

        {isAdmin && (
          <>
            <Heading size="sm">公司共用政策</Heading>
            <Text fontSize="xs" color="gray.500">
              店铺未覆写的字段会回落至此（不含单品卖点）。
            </Text>
            <FormControl>
              <FormLabel fontSize="sm">物流／发货</FormLabel>
              <Textarea
                rows={2}
                value={policy.logistics}
                onChange={(e) =>
                  setPolicy({ ...policy, logistics: e.target.value })
                }
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">售后</FormLabel>
              <Textarea
                rows={2}
                value={policy.afterSales}
                onChange={(e) =>
                  setPolicy({ ...policy, afterSales: e.target.value })
                }
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">禁答</FormLabel>
              <Textarea
                rows={2}
                value={policy.forbidden}
                onChange={(e) =>
                  setPolicy({ ...policy, forbidden: e.target.value })
                }
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">转人工条件</FormLabel>
              <Textarea
                rows={2}
                value={policy.transferRules}
                onChange={(e) =>
                  setPolicy({ ...policy, transferRules: e.target.value })
                }
              />
            </FormControl>
            <Button
              colorScheme="teal"
              size="sm"
              alignSelf="flex-start"
              onClick={handleSavePolicy}
            >
              保存政策
            </Button>
            <Divider />
          </>
        )}

        {isAdmin && (
          <>
            <Heading size="sm">
              {editingId ? '编辑店铺' : '新增店铺'}
            </Heading>
            <HStack align="start">
              <FormControl>
                <FormLabel fontSize="sm">显示名</FormLabel>
                <Input
                  value={shopForm.displayName}
                  onChange={(e) =>
                    setShopForm({ ...shopForm, displayName: e.target.value })
                  }
                />
              </FormControl>
              <FormControl maxW="180px">
                <FormLabel fontSize="sm">渠道</FormLabel>
                <Select
                  value={shopForm.channel}
                  onChange={(e) =>
                    setShopForm({
                      ...shopForm,
                      channel: e.target.value as 'pinduoduo' | 'qianniu',
                    })
                  }
                >
                  <option value="pinduoduo">拼多多</option>
                  <option value="qianniu">千牛</option>
                </Select>
              </FormControl>
            </HStack>
            <FormControl>
              <FormLabel fontSize="sm">
                对照键（逗号分隔：店名／店 ID／气泡别名）
              </FormLabel>
              <Input
                placeholder="海圆企业店,123456"
                value={shopForm.externalKeys}
                onChange={(e) =>
                  setShopForm({ ...shopForm, externalKeys: e.target.value })
                }
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">店铺定位（可选）</FormLabel>
              <Input
                value={shopForm.positioning}
                onChange={(e) =>
                  setShopForm({ ...shopForm, positioning: e.target.value })
                }
              />
            </FormControl>
            <HStack align="start">
              <FormControl>
                <FormLabel fontSize="sm">物流（覆写）</FormLabel>
                <Textarea
                  rows={2}
                  value={shopForm.logistics}
                  onChange={(e) =>
                    setShopForm({ ...shopForm, logistics: e.target.value })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">售后（覆写）</FormLabel>
                <Textarea
                  rows={2}
                  value={shopForm.afterSales}
                  onChange={(e) =>
                    setShopForm({ ...shopForm, afterSales: e.target.value })
                  }
                />
              </FormControl>
            </HStack>
            <HStack>
              <Button colorScheme="teal" size="sm" onClick={handleSaveShop}>
                {editingId ? '更新' : '创建'}
              </Button>
              {editingId && (
                <Button size="sm" variant="ghost" onClick={resetShopForm}>
                  取消编辑
                </Button>
              )}
            </HStack>
            <Divider />
          </>
        )}

        <Heading size="sm">店铺列表</Heading>
        <Button
          size="xs"
          variant="outline"
          alignSelf="flex-start"
          onClick={() => refreshShops()}
        >
          刷新
        </Button>
        <Table size="sm">
          <Thead>
            <Tr>
              <Th>名称</Th>
              <Th>渠道</Th>
              <Th>对照键</Th>
              <Th width="140px" />
            </Tr>
          </Thead>
          <Tbody>
            {shops.map((s) => (
              <Tr key={s.id}>
                <Td>{s.display_name}</Td>
                <Td>{s.channel === 'qianniu' ? '千牛' : '拼多多'}</Td>
                <Td>
                  <Text fontSize="xs" noOfLines={2}>
                    {(s.external_keys || []).join(', ') || '—'}
                  </Text>
                </Td>
                <Td>
                  {isAdmin && (
                    <HStack spacing={1}>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => loadShopIntoForm(s)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        onClick={() => handleDeleteShop(s.id)}
                      >
                        删除
                      </Button>
                    </HStack>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {shops.length === 0 && (
          <Text fontSize="sm" color="gray.500">
            尚无店铺。商户管理员可在上方创建。
          </Text>
        )}

        <Divider />
        <Heading size="sm">商品卖点</Heading>
        <FormControl maxW="280px">
          <FormLabel fontSize="sm">选择店铺</FormLabel>
          <Select
            value={noteShopId}
            onChange={(e) => setNoteShopId(e.target.value)}
            placeholder="选择店铺"
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </Select>
        </FormControl>

        {canEditNotes && (
          <Box>
            <HStack align="start">
              <FormControl>
                <FormLabel fontSize="sm">平台商品编号</FormLabel>
                <Input
                  value={noteForm.goodsId}
                  onChange={(e) =>
                    setNoteForm({ ...noteForm, goodsId: e.target.value })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">标题别名（逗号分隔）</FormLabel>
                <Input
                  value={noteForm.titleAliases}
                  onChange={(e) =>
                    setNoteForm({ ...noteForm, titleAliases: e.target.value })
                  }
                />
              </FormControl>
            </HStack>
            <FormControl mt={2}>
              <FormLabel fontSize="sm">卖点</FormLabel>
              <Textarea
                rows={3}
                value={noteForm.sellingPoints}
                onChange={(e) =>
                  setNoteForm({ ...noteForm, sellingPoints: e.target.value })
                }
              />
            </FormControl>
            <FormControl mt={2}>
                <FormLabel fontSize="sm">规格说明</FormLabel>
              <Textarea
                rows={2}
                value={noteForm.specsNotes}
                onChange={(e) =>
                  setNoteForm({ ...noteForm, specsNotes: e.target.value })
                }
              />
            </FormControl>
            <FormControl mt={2}>
              <FormLabel fontSize="sm">常见异议</FormLabel>
              <Textarea
                rows={2}
                value={noteForm.objections}
                onChange={(e) =>
                  setNoteForm({ ...noteForm, objections: e.target.value })
                }
              />
            </FormControl>
            <Button
              mt={2}
              colorScheme="teal"
              size="sm"
              variant="outline"
              onClick={handleAddNote}
            >
              新增商品说明
            </Button>
          </Box>
        )}

        <Table size="sm">
          <Thead>
            <Tr>
              <Th>商品 ID</Th>
              <Th>别名</Th>
              <Th>卖点摘要</Th>
              <Th width="70px" />
            </Tr>
          </Thead>
          <Tbody>
            {notes.map((n) => (
              <Tr key={n.id}>
                <Td>{n.goods_id || '—'}</Td>
                <Td>
                  <Text fontSize="xs" noOfLines={2}>
                    {(n.title_aliases || []).join(', ') || '—'}
                  </Text>
                </Td>
                <Td>
                  <Text fontSize="xs" noOfLines={2}>
                    {n.selling_points || '—'}
                  </Text>
                </Td>
                <Td>
                  {canEditNotes && (
                    <Button
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => handleDeleteNote(n.id)}
                    >
                      删除
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {noteShopId && notes.length === 0 && (
          <Text fontSize="sm" color="gray.500">
            此店尚无商品卖点。
          </Text>
        )}
      </VStack>
    </Container>
  );
};

export default ShopSettings;
