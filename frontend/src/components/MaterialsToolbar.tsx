import { Button, Input, Upload } from 'antd'
import {
  PlusOutlined, SearchOutlined, UploadOutlined, DownloadOutlined,
} from '@ant-design/icons'

interface Props {
  importing: boolean
  onSearch: (kw: string) => void
  onCreate: () => void
  onImport: (file: File) => Promise<boolean>
  onDownloadTemplate: () => void
}

/** 物料库工具栏：搜索框 + 新增 + Excel 导入 + 下载模板 */
function MaterialsToolbar({ importing, onSearch, onCreate, onImport, onDownloadTemplate }: Props) {
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
      <Button icon={<DownloadOutlined />} onClick={onDownloadTemplate}>下载模板</Button>
    </div>
  )
}

export default MaterialsToolbar
