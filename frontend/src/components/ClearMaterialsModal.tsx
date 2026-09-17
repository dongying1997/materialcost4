import { useEffect, useState } from 'react'
import { Modal, Input, Typography, Alert, Space } from 'antd'
import { MaterialService } from '../bindings'
import type { MaterialWithPrice } from '../types'

const CONFIRM_WORD = '清空'

interface Props {
  open: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}

/**
 * 清空物料库确认弹窗：先展示将删除的条数，再要求手动输入「清空」才放行。
 * 操作不可恢复，因此不提供一键确认。
 */
function ClearMaterialsModal({ open, onCancel, onConfirm }: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<{ materials: number; prices: number } | null>(null)

  // 每次打开重新统计并清空输入框，避免上一次的残留
  useEffect(() => {
    if (!open) return
    setInput('')
    setStats(null)
    let cancelled = false
    MaterialService.ListMaterials('')
      .then((data) => {
        if (cancelled) return
        const list = (data || []) as MaterialWithPrice[]
        setStats({
          materials: list.length,
          prices: list.reduce((sum, m) => sum + (m.priceCount || 0), 0),
        })
      })
      .catch(() => { if (!cancelled) setStats({ materials: 0, prices: 0 }) })
    return () => { cancelled = true }
  }, [open])

  const confirmed = input.trim() === CONFIRM_WORD

  const handleOk = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="清空物料库"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确认清空"
      cancelText="取消"
      okButtonProps={{ danger: true, disabled: !confirmed, loading }}
      destroyOnClose
    >
      <Alert
        type="error"
        showIcon
        message="此操作不可恢复"
        description={
          stats
            ? `将删除全部 ${stats.materials} 条物料及其 ${stats.prices} 条价格记录。`
            : '正在统计将删除的数据…'
        }
        style={{ marginBottom: 16 }}
      />
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        反应方案不受影响，无需重新保存。若要留底，请先「导出物料」。
      </Typography.Paragraph>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text>
          请输入 <Typography.Text code>{CONFIRM_WORD}</Typography.Text> 以确认：
        </Typography.Text>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={CONFIRM_WORD}
          allowClear
        />
      </Space>
    </Modal>
  )
}

export default ClearMaterialsModal
