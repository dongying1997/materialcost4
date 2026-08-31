import { Button, Divider } from 'antd'
import {
  PlusOutlined, SaveOutlined, FolderOpenOutlined,
  DeleteOutlined, ReloadOutlined,
} from '@ant-design/icons'
import type { MultiStepResult } from '../types'

interface Props {
  result: MultiStepResult | null
  calculating: boolean
  onAddStep: () => void
  onSave: () => void
  onLoad: () => void
  onRecalculate: () => void
  onClear: () => void
}

/** 计算工具栏：操作按钮 + 汇总统计 */
function CalcToolbar({ calculating, onAddStep, onSave, onLoad, onRecalculate, onClear }: Props) {
  return (
    <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button type="primary" icon={<PlusOutlined />} onClick={onAddStep}>添加步骤</Button>
      <Button icon={<SaveOutlined />} onClick={onSave}>保存方案</Button>
      <Button icon={<FolderOpenOutlined />} onClick={onLoad}>载入方案</Button>
      <Button icon={<ReloadOutlined />} onClick={onRecalculate} loading={calculating}>重新计算</Button>
      <Button icon={<DeleteOutlined />} onClick={onClear}>清空</Button>
      <Divider type="vertical" />
      {/* <Statistic title="总成本 (元)" value={totalCost} precision={2} prefix="¥" style={{ minWidth: 130 }} />
      <Statistic title="总产量 (kg)" value={totalYield} precision={4} style={{ minWidth: 110 }} />
      <Statistic title="总单位成本 (元/kg)" value={totalUnitCost} precision={2} style={{ minWidth: 140 }} /> */}
    </div>
  )
}

export default CalcToolbar
