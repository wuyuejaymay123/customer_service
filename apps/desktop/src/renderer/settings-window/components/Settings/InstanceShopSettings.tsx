import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import {
  ensureInstanceShop,
  getTasks,
} from '../../../common/services/platform/controller';

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

type NoteFormState = {
  goodsId: string;
  titleAliases: string;
  sellingPoints: string;
  specsNotes: string;
  objections: string;
};

const EMPTY_NOTE_FORM: NoteFormState = {
  goodsId: '',
  titleAliases: '',
  sellingPoints: '',
  specsNotes: '',
  objections: '',
};

function splitCsv(s: string): string[] {
  return s
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function aliasesOf(n: GoodsNote): string[] {
  return Array.isArray(n.title_aliases) ? n.title_aliases : [];
}

/**
 * 本店设置：优先用扫码店名自动建／绑网关店，打开即可编辑本店资料。
 */
const InstanceShopSettings = ({
  instanceId,
}: {
  appId?: string;
  instanceId: string;
}) => {
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'info' | 'warning' | 'error' | 'success'>(
    'info',
  );
  const [loading, setLoading] = useState(true);
  const [savingShop, setSavingShop] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [gatewayLoggedIn, setGatewayLoggedIn] = useState(false);
  const [boundShopId, setBoundShopId] = useState('');
  const [scanShopName, setScanShopName] = useState<string | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [form, setForm] = useState({
    positioning: '',
    logistics: '',
    afterSales: '',
    forbidden: '',
    transferRules: '',
  });
  const [dirty, setDirty] = useState(false);
  const [notes, setNotes] = useState<GoodsNote[]>([]);
  const [noteForm, setNoteForm] = useState<NoteFormState>(EMPTY_NOTE_FORM);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const {
    isOpen: isNoteModalOpen,
    onOpen: onNoteModalOpen,
    onClose: onNoteModalClose,
  } = useDisclosure();

  const isAdmin = role === 'tenant_admin';
  const canEditNotes = role === 'tenant_admin' || role === 'operator';

  const flash = useCallback(
    (msg: string, tone: 'info' | 'warning' | 'error' | 'success' = 'info') => {
      setStatus(msg);
      setStatusTone(tone);
    },
    [],
  );

  const patchForm = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const loadShop = useCallback(
    async (shopId: string): Promise<boolean> => {
      if (!shopId) {
        setShop(null);
        setNotes([]);
        return false;
      }
      const res = await window.electron?.ipcRenderer?.invoke('gateway:list-shops');
      if (!res?.ok) {
        flash(res?.message || '加载店铺资料失败（请确认已登录网关）', 'error');
        setShop(null);
        setNotes([]);
        return false;
      }
      const found = ((res?.data || []) as Shop[]).find((s) => s.id === shopId);
      if (!found) {
        flash(
          '实例已绑定店铺，但当前网关账号下找不到该店。请确认登录的是同一商户。',
          'error',
        );
        setShop(null);
        setNotes([]);
        return false;
      }
      setShop(found);
      setForm({
        positioning: found.positioning || '',
        logistics: found.logistics || '',
        afterSales: found.after_sales || '',
        forbidden: found.forbidden || '',
        transferRules: found.transfer_rules || '',
      });
      setDirty(false);

      const notesRes = await window.electron?.ipcRenderer?.invoke(
        'gateway:list-goods-notes',
        shopId,
      );
      if (!notesRes?.ok) {
        flash(notesRes?.message || '加载商品说明失败', 'error');
        setNotes([]);
        return false;
      }
      setNotes(notesRes.data || []);
      return true;
    },
    [flash],
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const me = await window.electron?.ipcRenderer?.invoke('gateway:me');
      const loggedIn = Boolean(me?.ok && me?.me?.user);
      setGatewayLoggedIn(loggedIn);
      if (loggedIn) {
        setRole(me.me?.user?.role || null);
      } else {
        setRole(null);
      }

      const tasks = await getTasks();
      const inst = (tasks?.data || []).find(
        (t: { task_id?: string }) => String(t.task_id) === String(instanceId),
      );
      setScanShopName(inst?.shop_name || null);

      const ensured = await ensureInstanceShop(instanceId);
      const shopId =
        ensured?.data?.gatewayShopId || inst?.gateway_shop_id || '';
      setBoundShopId(shopId || '');

      if (!loggedIn) {
        flash(
          '请先在右上角「设置 → 网关账户」登录。未登录时无法读取／保存本店资料与商品卖点。',
          'warning',
        );
        return;
      }

      if (shopId) {
        const ok = await loadShop(shopId);
        if (ok) {
          if (ensured?.data?.created) {
            flash(
              `已根据扫码店名「${ensured.data.shopName}」自动创建并绑定。请编辑后点「保存本店资料」。`,
              'success',
            );
          } else {
            flash(
              `当前店铺：${ensured?.data?.shopName || shopId}。修改本店政策后请点「保存本店资料」。`,
              'info',
            );
          }
        }
      } else if (ensured?.data?.reason === 'gateway_not_logged_in') {
        flash(
          '请先在右上角「设置 → 网关账户」登录，登录后将自动绑定扫码店铺',
          'warning',
        );
      } else if (ensured?.data?.reason === 'no_shop_name') {
        flash(
          '尚未从拼多多页面读到店名。请确认浏览器已扫码登录成功，稍等几秒后再打开本店设置。',
          'warning',
        );
      } else if (ensured?.data?.reason) {
        flash(`自动绑定未完成：${ensured.data.reason}`, 'warning');
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : '加载本店设置失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [flash, instanceId, loadShop]);

  useEffect(() => {
    bootstrap().catch(() => undefined);
  }, [bootstrap]);

  const closeNoteModal = () => {
    onNoteModalClose();
    setEditingNoteId(null);
    setNoteForm(EMPTY_NOTE_FORM);
  };

  const openCreateNote = () => {
    setEditingNoteId(null);
    setNoteForm(EMPTY_NOTE_FORM);
    onNoteModalOpen();
  };

  const openEditNote = (note: GoodsNote) => {
    setEditingNoteId(note.id);
    setNoteForm({
      goodsId: note.goods_id || '',
      titleAliases: aliasesOf(note).join(', '),
      sellingPoints: note.selling_points || '',
      specsNotes: note.specs_notes || '',
      objections: note.objections || '',
    });
    onNoteModalOpen();
  };

  const handleSaveShop = async () => {
    if (!isAdmin) {
      flash('仅商户管理员可保存本店资料', 'warning');
      return;
    }
    if (!boundShopId) {
      flash('尚未绑定店铺，无法保存', 'error');
      return;
    }
    if (!gatewayLoggedIn) {
      flash('请先登录网关账户', 'warning');
      return;
    }

    let target = shop;
    if (!target) {
      const ok = await loadShop(boundShopId);
      if (!ok) return;
      // loadShop 已 setShop，但闭包里的 shop 仍旧；再读一次列表拿元数据
      const res = await window.electron?.ipcRenderer?.invoke('gateway:list-shops');
      target = ((res?.data || []) as Shop[]).find((s) => s.id === boundShopId) || null;
    }
    if (!target) {
      flash('找不到店铺资料，无法保存', 'error');
      return;
    }

    setSavingShop(true);
    try {
      const res = await window.electron?.ipcRenderer?.invoke('gateway:update-shop', {
        id: target.id,
        displayName: target.display_name,
        channel: target.channel,
        externalKeys: target.external_keys || [],
        positioning: form.positioning,
        logistics: form.logistics,
        afterSales: form.afterSales,
        forbidden: form.forbidden,
        transferRules: form.transferRules,
      });
      if (res?.ok) {
        flash('已保存本店资料', 'success');
        setDirty(false);
        await loadShop(target.id);
      } else {
        flash(res?.message || '保存失败', 'error');
      }
    } finally {
      setSavingShop(false);
    }
  };

  const handleSaveNote = async () => {
    if (!boundShopId || !canEditNotes) return;
    setSavingNote(true);
    try {
      if (editingNoteId) {
        const res = await window.electron?.ipcRenderer?.invoke(
          'gateway:update-goods-note',
          {
            id: editingNoteId,
            goodsId: noteForm.goodsId || null,
            titleAliases: splitCsv(noteForm.titleAliases),
            sellingPoints: noteForm.sellingPoints,
            specsNotes: noteForm.specsNotes,
            objections: noteForm.objections,
          },
        );
        if (res?.ok) {
          flash('已更新商品说明', 'success');
          closeNoteModal();
          await loadShop(boundShopId);
        } else {
          flash(res?.message || '更新失败', 'error');
        }
      } else {
        const res = await window.electron?.ipcRenderer?.invoke(
          'gateway:create-goods-note',
          {
            shopId: boundShopId,
            goodsId: noteForm.goodsId || null,
            titleAliases: splitCsv(noteForm.titleAliases),
            sellingPoints: noteForm.sellingPoints,
            specsNotes: noteForm.specsNotes,
            objections: noteForm.objections,
          },
        );
        if (res?.ok) {
          flash('已新增商品说明', 'success');
          closeNoteModal();
          await loadShop(boundShopId);
        } else {
          flash(res?.message || '新增失败', 'error');
        }
      }
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    const res = await window.electron?.ipcRenderer?.invoke(
      'gateway:delete-goods-note',
      id,
    );
    if (res?.ok) {
      flash('已删除商品说明', 'success');
      await loadShop(boundShopId);
    } else {
      flash(res?.message || '删除失败', 'error');
    }
  };

  if (loading) {
    return (
      <Text fontSize="sm" color="gray.500">
        正在根据扫码店铺准备设置…
      </Text>
    );
  }

  return (
    <VStack align="stretch" spacing={4} maxW="720px">
      <Text fontSize="sm" color="gray.600">
        扫码登录后会自动识别店铺并绑定。物流／售后等改完后请点「保存本店资料」；商品说明在对话框里点「新增／保存」即写入网关。
      </Text>

      {status && (
        <Alert status={statusTone} borderRadius="md">
          <AlertIcon />
          {status}
        </Alert>
      )}

      {!gatewayLoggedIn ? (
        <Alert status="warning" borderRadius="md">
          <AlertIcon />
          <Box>
            <Text>未登录网关，无法读取已保存的本店资料与商品卖点。</Text>
            <Button size="sm" mt={2} onClick={() => bootstrap()}>
              重新检测登录
            </Button>
          </Box>
        </Alert>
      ) : !boundShopId ? (
        <Alert status="warning" borderRadius="md">
          <AlertIcon />
          <Box>
            <Text>
              还不能编辑本店资料。
              {scanShopName
                ? `已识别扫码店名「${scanShopName}」，请确认网关已用商户管理员账号登录。`
                : '请先完成拼多多扫码登录，等待卡片显示店名后再打开。'}
            </Text>
            <Button size="sm" mt={2} onClick={() => bootstrap()}>
              重试自动绑定
            </Button>
          </Box>
        </Alert>
      ) : (
        <>
          <HStack justify="space-between" align="center">
            <Heading size="sm">
              本店资料：{shop?.display_name || scanShopName || boundShopId}
            </Heading>
            {isAdmin && (
              <Button
                colorScheme="teal"
                isLoading={savingShop}
                onClick={handleSaveShop}
              >
                {dirty ? '保存本店资料 *' : '保存本店资料'}
              </Button>
            )}
          </HStack>
          {!isAdmin && (
            <Text fontSize="sm" color="gray.500">
              本店政策仅商户管理员可改；客服账号可维护下方商品卖点。
            </Text>
          )}
          {dirty && isAdmin && (
            <Alert status="warning" borderRadius="md" py={2}>
              <AlertIcon />
              本店资料有未保存修改，关闭窗口前请先点「保存本店资料」。
            </Alert>
          )}
          <FormControl>
            <FormLabel>店铺定位</FormLabel>
            <Textarea
              value={form.positioning}
              isDisabled={!isAdmin}
              onChange={(e) => patchForm({ positioning: e.target.value })}
            />
          </FormControl>
          <FormControl>
            <FormLabel>物流／发货</FormLabel>
            <Textarea
              value={form.logistics}
              isDisabled={!isAdmin}
              onChange={(e) => patchForm({ logistics: e.target.value })}
            />
          </FormControl>
          <FormControl>
            <FormLabel>售后政策</FormLabel>
            <Textarea
              value={form.afterSales}
              isDisabled={!isAdmin}
              onChange={(e) => patchForm({ afterSales: e.target.value })}
            />
          </FormControl>
          <FormControl>
            <FormLabel>禁答</FormLabel>
            <Textarea
              value={form.forbidden}
              isDisabled={!isAdmin}
              onChange={(e) => patchForm({ forbidden: e.target.value })}
            />
          </FormControl>
          <FormControl>
            <FormLabel>转人工条件</FormLabel>
            <Textarea
              value={form.transferRules}
              isDisabled={!isAdmin}
              onChange={(e) => patchForm({ transferRules: e.target.value })}
            />
          </FormControl>
          {isAdmin && (
            <Button
              colorScheme="teal"
              alignSelf="flex-start"
              isLoading={savingShop}
              onClick={handleSaveShop}
            >
              {dirty ? '保存本店资料 *' : '保存本店资料'}
            </Button>
          )}

          <Divider />
          <HStack justify="space-between" align="center">
            <Box>
              <Heading size="sm">商品卖点</Heading>
              <Text fontSize="sm" color="gray.600" mt={1}>
                按商品维护；在对话框确认后立即写入网关，下次打开会从网关重新加载。
              </Text>
            </Box>
            {canEditNotes && (
              <Button size="sm" colorScheme="teal" onClick={openCreateNote}>
                新增商品
              </Button>
            )}
          </HStack>

          <Box
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="md"
            overflow="hidden"
          >
            <Table size="sm">
              <Thead bg="gray.50">
                <Tr>
                  <Th>商品 ID</Th>
                  <Th>标题别名</Th>
                  <Th>卖点摘要</Th>
                  {canEditNotes && <Th width="120px">操作</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {notes.map((n) => (
                  <Tr key={n.id}>
                    <Td>{n.goods_id || '—'}</Td>
                    <Td>
                      <Text fontSize="xs" noOfLines={2}>
                        {aliasesOf(n).join(', ') || '—'}
                      </Text>
                    </Td>
                    <Td>
                      <Text fontSize="xs" noOfLines={2}>
                        {n.selling_points || '—'}
                      </Text>
                    </Td>
                    {canEditNotes && (
                      <Td>
                        <HStack spacing={1}>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => openEditNote(n)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            colorScheme="red"
                            onClick={() => handleDeleteNote(n.id)}
                          >
                            删除
                          </Button>
                        </HStack>
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {notes.length === 0 && (
              <Box py={8} textAlign="center">
                <Text fontSize="sm" color="gray.500">
                  暂无商品说明
                </Text>
                {canEditNotes && (
                  <Button
                    mt={3}
                    size="sm"
                    variant="outline"
                    colorScheme="teal"
                    onClick={openCreateNote}
                  >
                    新增商品
                  </Button>
                )}
              </Box>
            )}
          </Box>

          <Modal
            isOpen={isNoteModalOpen}
            onClose={closeNoteModal}
            size="lg"
            isCentered
          >
            <ModalOverlay />
            <ModalContent>
              <ModalHeader>
                {editingNoteId ? '编辑商品说明' : '新增商品'}
              </ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <VStack align="stretch" spacing={3}>
                  <FormControl>
                    <FormLabel fontSize="sm">平台商品 ID</FormLabel>
                    <Input
                      placeholder="优先用于匹配当前咨询商品"
                      value={noteForm.goodsId}
                      onChange={(e) =>
                        setNoteForm((f) => ({ ...f, goodsId: e.target.value }))
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm">标题别名</FormLabel>
                    <Input
                      placeholder="逗号分隔；无商品 ID 时用标题匹配"
                      value={noteForm.titleAliases}
                      onChange={(e) =>
                        setNoteForm((f) => ({
                          ...f,
                          titleAliases: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm">卖点</FormLabel>
                    <Textarea
                      rows={4}
                      placeholder="该商品的核心卖点"
                      value={noteForm.sellingPoints}
                      onChange={(e) =>
                        setNoteForm((f) => ({
                          ...f,
                          sellingPoints: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm">规格说明</FormLabel>
                    <Textarea
                      rows={2}
                      value={noteForm.specsNotes}
                      onChange={(e) =>
                        setNoteForm((f) => ({
                          ...f,
                          specsNotes: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm">常见异议</FormLabel>
                    <Textarea
                      rows={2}
                      value={noteForm.objections}
                      onChange={(e) =>
                        setNoteForm((f) => ({
                          ...f,
                          objections: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                </VStack>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" mr={3} onClick={closeNoteModal}>
                  取消
                </Button>
                <Button
                  colorScheme="teal"
                  isLoading={savingNote}
                  onClick={handleSaveNote}
                >
                  {editingNoteId ? '保存' : '新增'}
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        </>
      )}
    </VStack>
  );
};

export default InstanceShopSettings;
