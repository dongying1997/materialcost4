import { Button, Typography, Upload } from 'antd'
import { ExportOutlined, ImportOutlined, DeleteOutlined } from '@ant-design/icons'

interface Props {
  selectedCount: number
  exporting: boolean
  importing: boolean
  onExportSelected: () => void
  onExportAll: () => void
  onImport: (file: File) => Promise<boolean>
  onDeleteSelected: () => void
}

/** 方案管理工具栏：批量导出 / 导入方案 JSON */
function SchemesToolbar({
  selectedCount, exporting, importing,
  onExportSelected, onExportAll, onImport, onDeleteSelected,
}: Props) {
  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Typography.Text style={{ marginRight: 4 }}>
        {selectedCount > 0 && <span style={{ color: '#1677ff' }}>：已选 {selectedCount} 个方案</span>}
      </Typography.Text>
      <Button
        type="primary"
        icon={<ExportOutlined />}
        loading={exporting}
        disabled={selectedCount === 0}
        onClick={onExportSelected}
      >
        导出选中方案
      </Button>
      <Button icon={<ExportOutlined />} loading={exporting} onClick={onExportAll}>导出全部</Button>
      <Upload
        accept=".json"
        showUploadList={false}
        beforeUpload={onImport}
        disabled={importing}
      >
        <Button icon={<ImportOutlined />} loading={importing}>导入 JSON 方案</Button>
      </Upload>
      <Button
        icon={<DeleteOutlined />}
        danger
        disabled={selectedCount === 0}
        onClick={onDeleteSelected}
      >
        删除选中
      </Button>
    </div>
  )
}

export default SchemesToolbar
