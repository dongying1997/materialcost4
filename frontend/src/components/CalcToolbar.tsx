import { Button } from 'antd'
import {
  PlusOutlined, SaveOutlined, FolderOpenOutlined,
  DeleteOutlined, ReloadOutlined, PictureOutlined, ClearOutlined,
} from '@ant-design/icons'
import ToolbarStrip from './ToolbarStrip'

interface Props {
  calculating: boolean
  onAddStep: () => void
  onSave: () => void
  onLoad: () => void
  onRecalculate: () => void
  onClear: () => void
  /** 请求粘贴图片：点击后提示用户按 Ctrl/⌘+V */
  onPasteImage: () => void
  /** 移除附图 */
  onRemoveImage: () => void
  /** 是否已有附图：有图才显示「移除图片」 */
  hasImage: boolean
}

/** 计算工具栏：步骤与方案的增删改操作（汇总统计在 StepCard 标题栏里） */
function CalcToolbar({
  calculating, onAddStep, onSave, onLoad, onRecalculate, onClear, onPasteImage, onRemoveImage, hasImage,
}: Props) {
  return (
    <ToolbarStrip>
      <Button type="primary" icon={<PlusOutlined />} onClick={onAddStep}>添加步骤</Button>
      <Button icon={<SaveOutlined />} onClick={onSave}>保存方案</Button>
      <Button icon={<FolderOpenOutlined />} onClick={onLoad}>载入方案</Button>
      <Button icon={<ReloadOutlined />} onClick={onRecalculate} loading={calculating}>计算补全</Button>
      <Button icon={<PictureOutlined />} onClick={onPasteImage}>
        {hasImage ? '替换图片' : '粘贴图片'}
      </Button>
      {/* 移除只对有图的方案有意义，没图时不占位 */}
      {hasImage && (
        <Button icon={<ClearOutlined />} onClick={onRemoveImage}>移除图片</Button>
      )}
      <Button danger icon={<DeleteOutlined />} onClick={onClear} style={{ marginLeft: 'auto' }}>
        清空数据
      </Button>
    </ToolbarStrip>
  )
}

export default CalcToolbar
