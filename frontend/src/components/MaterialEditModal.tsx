import { Modal } from 'antd'
import type { FormInstance } from 'antd'
import type { Material } from '../types'
import MaterialForm from './MaterialForm'

interface Props {
  open: boolean
  editing: Material | null
  form: FormInstance
  onOk: () => void
  onCancel: () => void
}

/** 新增 / 编辑物料弹窗 */
function MaterialEditModal({ open, editing, form, onOk, onCancel }: Props) {
  return (
    <Modal
      title={editing ? '编辑物料' : '新增物料'}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      width={560}
      destroyOnClose
    >
      <MaterialForm form={form} />
    </Modal>
  )
}

export default MaterialEditModal
