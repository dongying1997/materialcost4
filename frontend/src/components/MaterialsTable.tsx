import { useMemo } from 'react'
import { Table, Space, Button, Tooltip, Popconfirm } from 'antd'
import { HistoryOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { MaterialWithPrice } from '../types'
import { fmtMoney } from '../utils/file'

interface Props {
  list: MaterialWithPrice[]
  loading: boolean
  onEdit: (m: MaterialWithPrice) => void
  onDelete: (m: MaterialWithPrice) => void
  onPrice: (m: MaterialWithPrice) => void
}

/** 物料列表表格：含当前价格与操作列 */
function MaterialsTable({ list, loading, onEdit, onDelete, onPrice }: Props) {
  const columns = useMemo<ColumnsType<MaterialWithPrice>>(() => [
    { title: '编码', dataIndex: 'code', width: 70, align: 'center',render: v => v || '-' },
    { title: '名称', dataIndex: 'name', width: 130, render: v => v || '-' },
    { title: 'CAS', dataIndex: 'cas', width: 100, render: v => v || '-' },
    { title: '化学式', dataIndex: 'formula', width: 100, render: v => v || '-' },
    { title: '分子量', dataIndex: 'molWeight', width: 100, render: v => v || '-' },
    {
      title: '当前价格', width: 100,
      render: (_, r) => r.priceCount ? (
        <Tooltip title={`供应商：${r.supplier || '-'}　日期：${r.priceDate || '-'}`}>
          <span>{fmtMoney(r.price)} <span style={{ color: '#999', fontSize: 12 }}>{r.priceUnit}</span></span>
        </Tooltip>
      ) : <span style={{ color: '#999' }}>暂无</span>,
    },
    {
      title: '操作', width: 200, fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => onEdit(r)}>编辑</Button>
          <Button size="small" type="link" icon={<HistoryOutlined />} onClick={() => onPrice(r)}>价格</Button>
          <Popconfirm title="确认删除该物料？" description="其所有价格记录将一并删除" onConfirm={() => onDelete(r)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [onEdit, onDelete, onPrice])

  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={list}
      columns={columns}
      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      size="middle"
    />
  )
}

export default MaterialsTable
