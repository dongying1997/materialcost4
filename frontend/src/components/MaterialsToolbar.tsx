import { Button, Input, Upload } from 'antd'
import {
  PlusOutlined, SearchOutlined, UploadOutlined, DownloadOutlined, ExportOutlined,
  DeleteOutlined,
} from '@ant-design/icons'

interface Props {
  importing: boolean
  exporting: boolean
  onSearch: (kw: string) => void
  onCreate: () => void
  onImport: (file: File) => Promise<boolean>
  onDownloadTemplate: () => void
  onExport: () => void
  onClear: () => void
}

/** 物料库工具栏：搜索框 + 新增 + Excel 导入 / 导出 + 下载模板 + 清空 */
function MaterialsToolbar({ importing, exporting, onSearch, onCreate, onImport, onDownloadTemplate, onExport, onClear }: Props) {
  return (
    <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Input.Search
        placeholder="搜索编码/名称/CAS/化学式"
        allowClear style={{ width: 280 }}
        onSearch={onSearch}
        enterButton={<SearchOutlined />}
      />
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>新增物料</Button>
      <Upload
        accept=".xlsx,.xls"
        showUploadList={false}
        beforeUpload={onImport}
        disabled={importing}
      >
        <Button icon={<UploadOutlined />} loading={importing}>Excel 导入</Button>
      </Upload>
      <Button icon={<ExportOutlined />} loading={exporting} onClick={onExport}>导出物料</Button>
      <Button icon={<DownloadOutlined />} onClick={onDownloadTemplate}>下载模板</Button>
      {/* 破坏性操作用 auto 外边距推到最右侧，与其它按钮拉开距离 */}
      <Button danger icon={<DeleteOutlined />} onClick={onClear} style={{ marginLeft: 'auto' }}>
        清空物料
      </Button>
    </div>
  )
}

export default MaterialsToolbar
