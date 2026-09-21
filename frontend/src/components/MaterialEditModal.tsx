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
      // 新增时表单多出「初始价格」一段，在小屏幕上会顶到窗口边缘；
      // 给内容区滚动而不是让弹窗继续长高
      styles={{ body: { maxHeight: '64vh', overflowY: 'auto', paddingInlineEnd: 8 } }}
      destroyOnClose
    >
      {/* 价格表单只在新增时出现：编辑已有物料的价格走「价格」抽屉的历史列表 */}
      <MaterialForm form={form} withPrice={!editing} />
    </Modal>
  )
}

export default MaterialEditModal
