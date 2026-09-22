import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Form, message } from 'antd'
import { useSchemes } from '@/shared/hooks/useSchemes'
import SchemesPanel from '@/pages/schemes/components/SchemesPanel'
import SchemesToolbar from '@/pages/schemes/components/SchemesToolbar'
import SchemeRenameModal from '@/pages/schemes/components/SchemeRenameModal'
import type { StepRow } from '@/types'

/** 方案管理页：列出已保存的方案，载入后跳转到反应计算页 */
function SchemesPage() {
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm()

  // 载入方案到编辑器，并通过路由 state 把步骤与附图一起传给反应计算页
  const handleLoaded = (rows: StepRow[], image: string) => {
    navigate('/reaction', { state: { loadRows: rows, loadImage: image } })
  }
  const schemes = useSchemes(messageApi, handleLoaded)

  // 改名弹窗打开时把当前名称灌进表单。放在这里而不是点击回调里，
  // 是为了让「打开 → 预填」始终成对发生，弹窗不会被上一次的名称污染。
  useEffect(() => {
    if (schemes.renaming) form.setFieldsValue({ name: schemes.renaming.name })
  }, [schemes.renaming, form])

  const exportSelected = () => schemes.exportSchemes(schemes.selectedIds)
  const exportAll = () => schemes.exportSchemes([])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {contextHolder}
      <div style={{ flexShrink: 0 }}>
        <SchemesToolbar
          selectedCount={schemes.selectedIds.length}
          exporting={schemes.exporting}
          importing={schemes.importing}
          onExportSelected={exportSelected}
          onExportAll={exportAll}
          onImport={schemes.importSchemes}
          onDeleteSelected={schemes.deleteSelected}
        />
      </div>
      <div style={{ overflow: 'auto', minHeight: 0 }}>
        <SchemesPanel
          schemes={schemes.schemes}
          selectedIds={schemes.selectedIds}
          onToggleSelect={schemes.toggleSelect}
          onLoad={schemes.loadSchemeById}
          onRename={schemes.openRename}
          onDelete={schemes.deleteSchemeById}
        />
      </div>
      <SchemeRenameModal
        open={!!schemes.renaming}
        form={form}
        saving={schemes.renamingSaving}
        onOk={() => schemes.renameScheme(form)}
        onCancel={schemes.closeRename}
      />
    </div>
  )
}

export default SchemesPage
