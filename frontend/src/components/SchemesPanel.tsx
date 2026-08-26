import { Card, Space, List, Empty, Button, Popconfirm, Checkbox } from 'antd'
import { FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons'
import type { Scheme } from '../types'

interface Props {
  schemes: Scheme[]
  selectedIds: number[]
  onToggleSelect: (id: number) => void
  onLoad: (sch: Scheme) => void
  onDelete: (sch: Scheme) => void
}

/** 方案管理面板：列出已保存的方案，支持勾选多个方案批量操作 */
function SchemesPanel({ schemes, selectedIds, onToggleSelect, onLoad, onDelete }: Props) {
  const isSelected = (id: number) => selectedIds.includes(id)
  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        {schemes.length === 0 ? <Empty description="暂无保存的方案" /> :
          <List
            dataSource={schemes}
            renderItem={(s) => (
              <List.Item
                style={isSelected(s.id) ? { background: '#e6f4ff', borderRadius: 8, paddingLeft: 8, paddingRight: 8 } : { paddingLeft: 8, paddingRight: 8 }}
                actions={[
                  <Button key="load" size="small" type="link" icon={<FolderOpenOutlined />}
                    onClick={() => onLoad(s)}>载入</Button>,
                  <Popconfirm key="del" title="删除该方案？" onConfirm={() => onDelete(s)}>
                    <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>,
                ]}
              >
                <Checkbox
                  checked={isSelected(s.id)}
                  onChange={() => onToggleSelect(s.id)}
                  style={{ marginRight: 8 }}
                />
                <List.Item.Meta
                  title={<Space><span>{s.name}</span>
                    {s.note && <span style={{ color: '#999', fontSize: 12 }}>{s.note}</span>}</Space>}
                  description={`${s.steps?.length || 0} 步 · 更新于 ${s.updatedAt || s.createdAt || '-'}`}
                />
              </List.Item>
            )}
          />}
      </Space>
    </Card>
  )
}

export default SchemesPanel
