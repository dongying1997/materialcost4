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
      <Button icon={<ReloadOutlined />} onClick={onRecalculate} loading={calculating}>计算补全</Button>
      <Button danger icon={<DeleteOutlined />} onClick={onClear} style={{ marginLeft: 'auto' }}>
        清空数据
      </Button>      
    </div>
  )
}

export default CalcToolbar
