import { Modal, Form, Input } from 'antd'
import type { FormInstance } from 'antd'

interface Props {
  open: boolean
  form: FormInstance
  saving: boolean
  onOk: () => void
  onCancel: () => void
}

/**
 * 方案改名弹窗。
 *
 * 只提交名称：方案内容（步骤、附图）仍以编辑器里的为准，从列表改名不该
 * 把库里的旧 steps 盖回去。旧的 note 一并提交，避免后端整行更新时把它清空。
 */
function SchemeRenameModal({ open, form, saving, onOk, onCancel }: Props) {
  return (
    <Modal
      title="重命名方案"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      confirmLoading={saving}
      width={420}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="方案名称" rules={[{ required: true, message: '请输入方案名称' }]}>
          <Input placeholder="例如：化合物 X 的合成" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default SchemeRenameModal
