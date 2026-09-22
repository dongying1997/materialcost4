import { Button, Tooltip, Dropdown, Space } from 'antd'
import {
  PlusOutlined, SaveOutlined, FolderOpenOutlined, CopyOutlined,
  DeleteOutlined, ReloadOutlined, PictureOutlined, ClearOutlined, EditOutlined,
  DownOutlined, ExperimentOutlined,
} from '@ant-design/icons'
import ToolbarStrip from '@/shared/components/ToolbarStrip'

interface Props {
  calculating: boolean
  onAddStep: () => void
  /** 新增物料入库。物料库中没有的原料，在这里补建，不必切到物料库页 */
  onAddMaterial: () => void
  onSave: () => void
  /** 已落库时：打开名称/备注弹窗，改完写回原行 */
  onRenameSave: () => void
  /** 另存为新方案。当前方案尚未落库时无从另存，按钮禁用 */
  onSaveAs: () => void
  /** 已落库方案的名称；空串表示尚未保存，用于提示当前在编辑哪一个 */
  savedName: string
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
  calculating, onAddStep, onAddMaterial, onSave, onRenameSave, onSaveAs, savedName, onLoad,
  onRecalculate, onClear, onPasteImage, onRemoveImage, hasImage,
}: Props) {
  return (
    <ToolbarStrip>
      <Button type="primary" icon={<PlusOutlined />} onClick={onAddStep}>添加步骤</Button>
      {/* 紧挨「添加步骤」：两者都是「新建」动作，挨着放最容易找。
          新物料落进物料库，名称列与「选物料」列的下拉随即就能选到它。 */}
      <Tooltip title='物料库中没有的物料，在这里直接新增'>
        <Button icon={<ExperimentOutlined />} onClick={onAddMaterial}>新增物料</Button>
      </Tooltip>
      {/* 分裂按钮：主体是「保存」这个动作本身（已落库的写回原行，未落库的开弹窗命名），
          右侧箭头才展开菜单里的「重命名并保存」——那是唯一还能改到方案名称的入口。
          不用 Dropdown.Button：antd 6 已废弃它，官方替代就是 Space.Compact 这套。 */}
      <Space.Compact>
        <Tooltip title={savedName ? `保存到「${savedName}」` : '该方案尚未保存，需要先命名'}>
          <Button icon={<SaveOutlined />} onClick={onSave}>保存方案</Button>
        </Tooltip>
        {savedName && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [{ key: 'rename', icon: <EditOutlined />, label: '重命名并保存' }],
              onClick: onRenameSave,
            }}
          >
            <Button icon={<DownOutlined />} aria-label='更多保存方式' />
          </Dropdown>
        )}
      </Space.Compact>
      <Tooltip title={savedName ? '另存为一条新方案（需另起名称）' : '尚未保存，无从另存'}>
        <Button icon={<CopyOutlined />} onClick={onSaveAs} disabled={!savedName}>另存方案</Button>
      </Tooltip>
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
