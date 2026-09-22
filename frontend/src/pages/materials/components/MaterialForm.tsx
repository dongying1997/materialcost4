import { Form, Input, InputNumber, DatePicker, Space } from 'antd'
import type { FormInstance } from 'antd'

interface Props {
  form: FormInstance
  /** 新增物料时才附带价格表单；编辑已有物料时价格归「价格」抽屉管 */
  withPrice: boolean
}

/**
 * 物料表单。
 *
 * withPrice 为真时在末尾附一块「初始价格」：物料与价格常是同一次录入动作
 * （拿到一个化合物就顺手记下报价），分两步填会打断这个动作。
 * 价格整体可留空——只建物料不记价格同样成立。
 */
function MaterialForm({ form, withPrice }: Props) {
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

      {withPrice && (
        <>
          {/* 用分隔线把「物料」与「价格」两段分开：价格整段都可留空，
              不划线的话用户会以为下面几个也是必填 */}
          <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0 16px' }} />
          <Space style={{ marginBottom: 8 }} size={8}>
            <span style={{ fontWeight: 500 }}>初始价格</span>
            <span style={{ color: '#999', fontSize: 12 }}>可选，留空则只新增物料</span>
          </Space>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="priceValue" label="价格">
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="例如 1200" />
            </Form.Item>
            <Form.Item name="priceUnit" label="单位">
              <Input placeholder="元/kg | 元/g | 元/mol" />
            </Form.Item>
            <Form.Item name="priceSupplier" label="供应商">
              <Input />
            </Form.Item>
            <Form.Item name="priceDate" label="日期">
              <DatePicker style={{ width: '100%' }} placeholder="默认今天" />
            </Form.Item>
            <Form.Item name="priceSpec" label="规格">
              <Input placeholder="例如 AR 500g" />
            </Form.Item>
            <Form.Item name="priceContent" label="含量(%)">
              <InputNumber style={{ width: '100%' }} min={0} max={100} />
            </Form.Item>
          </div>
          <Form.Item name="priceNote" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </>
      )}
    </Form>
  )
}

export default MaterialForm
