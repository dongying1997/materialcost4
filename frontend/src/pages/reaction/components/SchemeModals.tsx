import { Modal, Form, Input, List, Button, Popconfirm } from 'antd'
import { FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons'
import type { FormInstance } from 'antd'
import type { SchemeSummary } from '@/types'

interface Props {
  saveOpen: boolean
  loadOpen: boolean
  form: FormInstance
  schemes: SchemeSummary[]
  onSaveCancel: () => void
  onSaveOk: () => void
  onLoadClose: () => void
  onLoad: (id: number) => void
  onDelete: (id: number) => void
}

/** 保存方案与载入方案两个弹窗 */
function SchemeModals({ saveOpen, loadOpen, form, schemes, onSaveCancel, onSaveOk, onLoadClose, onLoad, onDelete }: Props) {
  return (
    <>
      <Modal title="保存方案" open={saveOpen} onOk={onSaveOk} onCancel={onSaveCancel} width={420}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="方案名称" rules={[{ required: true, message: '请输入方案名称' }]}>
            <Input placeholder="例如：化合物 X 的合成" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="载入方案" open={loadOpen} onCancel={onLoadClose} footer={null} width={480}>
        <List
          dataSource={schemes}
          renderItem={(s) => (
            <List.Item actions={[
              <Button key="l" type="primary" size="small" icon={<FolderOpenOutlined />}
                onClick={() => onLoad(s.id)}>载入</Button>,
              <Popconfirm key="d" title="删除？" onConfirm={() => onDelete(s.id)}>
                <Button size="small" danger type="link" icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>,
            ]}>
              <List.Item.Meta title={s.name} description={`${s.stepCount} 步`} />
            </List.Item>
          )}
        />
      </Modal>
    </>
  )
}

export default SchemeModals
