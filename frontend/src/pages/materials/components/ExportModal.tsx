import { Modal, Button, Space, Typography } from 'antd'

interface Props {
  open: boolean
  onCancel: () => void
  onExport: (allPrices: boolean) => void
}

/** 导出物料模式选择弹窗：最新价格 / 全部价格 */
function ExportModal({ open, onCancel, onExport }: Props) {
  return (
    <Modal
      title="导出物料"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={400}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        选择价格导出方式。导出内容与导入模板表头一致，可直接回导。
      </Typography.Paragraph>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button block onClick={() => { onCancel(); onExport(false) }}>
          仅最新价格（每物料一行）
        </Button>
        <Button block type="primary" onClick={() => { onCancel(); onExport(true) }}>
          所有价格（每价格一行）
        </Button>
      </Space>
    </Modal>
  )
}

export default ExportModal
