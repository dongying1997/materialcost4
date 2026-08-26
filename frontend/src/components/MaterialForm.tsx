import { Form, Input, InputNumber } from 'antd'
import type { FormInstance } from 'antd'

function MaterialForm({ form }: { form: FormInstance }) {
  return (
    <Form form={form} layout="vertical">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Form.Item name="code" label="编码">
          <Input placeholder="例如 M-001" />
        </Form.Item>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="例如 甲醇" />
        </Form.Item>
        <Form.Item name="cas" label="CAS 号">
          <Input placeholder="例如 67-56-1" />
        </Form.Item>
        <Form.Item name="formula" label="化学式">
          <Input placeholder="例如 CH4O" />
        </Form.Item>
        <Form.Item name="molWeight" label="分子量">
          <InputNumber style={{ width: '100%' }} min={0} placeholder="例如 32.04" />
        </Form.Item>
        <Form.Item name="content" label="含量(%)">
          <InputNumber style={{ width: '100%' }} min={0} max={100} placeholder="例如 99.5" />
        </Form.Item>
        <Form.Item name="recoveryRate" label="回收率(%)">
          <InputNumber style={{ width: '100%' }} min={0} max={100} placeholder="默认 0" />
        </Form.Item>
      </div>
      <Form.Item name="note" label="备注">
        <Input.TextArea rows={2} />
      </Form.Item>
    </Form>
  )
}

export default MaterialForm
