import { Card, Space, List, Empty, Button, Popconfirm, Checkbox, Tooltip } from 'antd'
import { FolderOpenOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons'
import { fmtDateTime, fmtMoney } from '@/shared/utils/format'
import type { SchemeSummary } from '@/types'

interface Props {
  schemes: SchemeSummary[]
  selectedIds: number[]
  onToggleSelect: (id: number) => void
  /** 载入时才按 id 拉取完整方案，列表项本身不再携带 steps */
  onLoad: (id: number) => void
  onDelete: (id: number) => void
}

/**
 * 结果摘要：最终产物名 + 单位成本。
 * 算不出结果（参数不全）时标出「-」并说明原因，避免用户以为是 bug。
 */
function ResultSummary({ s }: { s: SchemeSummary }) {
  const name = s.productName || '产物'
  if (!s.hasResult) {
    const reasons = [...(s.blockingErrors || []), ...(s.errors || [])]
    return (
      <Tooltip title={reasons.length ? reasons.join('；') : '缺少可计算的数据'}>
        <span style={{ color: '#999' }}>
          <WarningOutlined style={{ color: '#faad14', marginInlineEnd: 4 }} />
          {name} · -
        </span>
      </Tooltip>
    )
  }
  return (
    <Tooltip title={`总成本 ${fmtMoney(s.totalCost)} 元 ÷ 总产量 ${fmtMoney(s.totalYieldKg)} kg`}>
      <span>{name} · <span style={{ fontWeight: 500 }}>{fmtMoney(s.unitCost)} 元/kg</span></span>
    </Tooltip>
  )
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
                    onClick={() => onLoad(s.id)}>载入</Button>,
                  <Popconfirm key="del" title="删除该方案？" onConfirm={() => onDelete(s.id)}>
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
                  description={
                    <Space size={8} wrap>
                      <span>{s.stepCount} 步</span>
                      <span style={{ color: '#d9d9d9' }}>|</span>
                      <ResultSummary s={s} />
                      <span style={{ color: '#d9d9d9' }}>|</span>
                      <span>更新于 {fmtDateTime(s.updatedAt || s.createdAt)}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />}
      </Space>
    </Card>
  )
}

export default SchemesPanel
