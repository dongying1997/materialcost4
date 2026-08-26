import { message } from 'antd'
import { useMaterials } from '../hooks/useMaterials'
import MaterialsToolbar from '../components/MaterialsToolbar'
import MaterialsTable from '../components/MaterialsTable'
import MaterialEditModal from '../components/MaterialEditModal'
import PriceDrawer from '../components/PriceDrawer'
import ExportModal from '../components/ExportModal'

/** 物料库页：组合工具栏、列表、编辑弹窗与价格抽屉 */
function MaterialsPage() {
  const [messageApi, contextHolder] = message.useMessage()
  const m = useMaterials(messageApi)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {contextHolder}
      <MaterialsToolbar
        importing={m.importing}
        exporting={m.exporting}
        onSearch={m.search}
        onCreate={m.openCreate}
        onImport={m.onImport}
        onDownloadTemplate={m.downloadTemplate}
        onExport={m.openExport}
      />
      <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <MaterialsTable
          list={m.list}
          loading={m.loading}
          onEdit={m.openEdit}
          onDelete={m.deleteMaterial}
          onPrice={m.openPrice}
        />
      </div>
      <MaterialEditModal
        open={m.editOpen}
        editing={m.editing}
        form={m.form}
        onOk={m.saveMaterial}
        onCancel={m.closeEdit}
      />
      <PriceDrawer
        material={m.drawerMaterial}
        open={!!m.drawerMaterial}
        onClose={() => m.openPrice(null)}
        onChanged={m.refresh}
      />
      <ExportModal
        open={m.exportOpen}
        onCancel={m.closeExport}
        onExport={m.doExport}
      />
    </div>
  )
}

export default MaterialsPage
