import { useEffect, useState, useCallback } from 'react'
import { Drawer, Table, Button, Space, Modal, Form, Input, InputNumber, DatePicker, Select, Tooltip, Popconfirm, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { MaterialService } from '@/lib/bindings'
import type { Price, PricePayload, MaterialWithPrice } from '@/types'
import { fmtMoney } from '@/shared/utils/format'
import { PRICE_SCALE_OPTIONS } from '@/shared/utils/priceScale'

interface Props {
  material: MaterialWithPrice | null
  open: boolean
  onClose: () => void
  onChanged: () => void
}

function PriceDrawer({ material, open, onClose, onChanged }: Props) {
  const [prices, setPrices] = useState<Price[]>([])
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Price | null>(null)
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    if (!material) return
    setLoading(true)
    try {
      const data = await MaterialService.ListPrices(material.id, '')
      setPrices((data || []) as Price[])
    } catch (e) {
      messageApi.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [material, messageApi])

  useEffect(() => {
    if (open && material) load()
    else setPrices([])
  }, [open, material, load])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ unit: '元/kg', date: dayjs() })
    setEditOpen(true)
  }

  const openEdit = (p: Price) => {
    setEditing(p)
    form.setFieldsValue({
      price: p.price, unit: p.unit, priceScale: p.priceScale || undefined,
      supplier: p.supplier,
      date: dayjs(p.date), spec: p.spec, content: p.content, note: p.note,
    })
    setEditOpen(true)
  }

  const save = async () => {
    if (!material) return
    const v = await form.validateFields()
    const payload: PricePayload = {
      id: editing?.id || 0,
      materialId: material.id,
      price: v.price, unit: v.unit || '元/kg',
      priceScale: v.priceScale || '',
      supplier: v.supplier || '',
      // 后端 time.Time 需要完整 RFC3339（本地时区偏移），纯日期会解析失败
      date: v.date ? v.date.format('YYYY-MM-DDTHH:mm:ssZ') : '',
      spec: v.spec || '', content: v.content || 0, note: v.note || '',
    }
    try {
      await MaterialService.SavePrice(payload as Price)
      messageApi.success('价格已保存')
      setEditOpen(false)
      load()
      onChanged()
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  const del = async (p: Price) => {
    try {
      await MaterialService.DeletePrice(p.id)
      messageApi.success('已删除')
      load()
      onChanged()
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  return (
    <>
      {contextHolder}
      <Drawer
        title={material ? `价格历史 — ${material.name}（${material.cas || '无 CAS'}）` : '价格历史'}
        open={open}
        onClose={onClose}
        width={880}
      >
        <div style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增价格</Button>
        </div>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={prices}
          pagination={false}
          columns={[
            { title: '价格', dataIndex: 'price', width: 50, align: 'center', render: v => fmtMoney(v) },
            { title: '单位', dataIndex: 'unit', width: 80, align: 'center' },
            { title: '数量级', dataIndex: 'priceScale', width: 76, align: 'center', render: v => v || '-' },
            { title: '供应商', dataIndex: 'supplier', width: 120, align: 'center', render: v => v || '-' },
            { title: '日期', dataIndex: 'date', width: 120 , align: 'center',render: v => dayjs(v).format('YYYY-MM-DD') },
            { title: '规格', dataIndex: 'spec', width: 100, align: 'center',render: v => v || '-' },
            { title: '含量%', dataIndex: 'content', width: 70, align: 'center', render: v => (v ? `${v}%` : '-') },
            {
              title: '价格备注', dataIndex: 'note', width: 140,align: 'center',
              render: v => v ? <Tooltip title={v}>{v}</Tooltip> : '-',
            },
            {
              title: '操作', width: 110,align: 'center',
              render: (_, r) => (
                <Space size={0}>
                  <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
                  <Popconfirm title="删除该价格记录？" onConfirm={() => del(r)}>
                    <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Drawer>

      <Modal
        title={editing ? '编辑价格' : '新增价格'}
        open={editOpen}
        onOk={save}
        onCancel={() => setEditOpen(false)}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="price" label="价格" rules={[{ required: true, message: '请输入价格' }]}>
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
            </Form.Item>
            <Form.Item name="unit" label="单位">
              <Input placeholder="元/kg | 元/g | 元/mol" />
            </Form.Item>
            <Form.Item name="priceScale" label="数量级">
              <Select style={{ width: '100%' }} allowClear placeholder="可选"
                options={PRICE_SCALE_OPTIONS} />
            </Form.Item>
            <Form.Item name="supplier" label="供应商">
              <Input />
            </Form.Item>
            <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="spec" label="规格">
              <Input placeholder="例如 AR 500g" />
            </Form.Item>
            <Form.Item name="content" label="含量(%)">
              <InputNumber style={{ width: '100%' }} min={0} max={100} />
            </Form.Item>
          </div>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default PriceDrawer
