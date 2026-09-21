import { Button } from 'antd'
import {
  PlusOutlined, SaveOutlined, FolderOpenOutlined,
  DeleteOutlined, ReloadOutlined,
} from '@ant-design/icons'
import ToolbarStrip from './ToolbarStrip'

interface Props {
  calculating: boolean
  onAddStep: () => void
  onSave: () => void
  onLoad: () => void
  onRecalculate: () => void
  onClear: () => void
}

/** 计算工具栏：步骤与方案的增删改操作（汇总统计在 StepCard 标题栏与 CalcAlerts 里） */
function CalcToolbar({ calculating, onAddStep, onSave, onLoad, onRecalculate, onClear }: Props) {
  return (
    <ToolbarStrip>
      <Button type="primary" icon={<PlusOutlined />} onClick={onAddStep}>添加步骤</Button>
      <Button icon={<SaveOutlined />} onClick={onSave}>保存方案</Button>
      <Button icon={<FolderOpenOutlined />} onClick={onLoad}>载入方案</Button>
      <Button icon={<ReloadOutlined />} onClick={onRecalculate} loading={calculating}>计算补全</Button>
      <Button danger icon={<DeleteOutlined />} onClick={onClear} style={{ marginLeft: 'auto' }}>
        清空数据
      </Button>
    </ToolbarStrip>
  )
}

export default CalcToolbar
