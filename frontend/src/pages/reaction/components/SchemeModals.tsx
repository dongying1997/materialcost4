import { ConfigProvider, Modal, Form, Input, List, Button, Popconfirm, Tooltip } from 'antd'
import { FolderOpenOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons'
import type { FormInstance } from 'antd'
import type { SchemeSummary } from '@/types'
import { fmtMoney } from '@/shared/utils/format'

/** 单行文本溢出省略（方案名过长时用，完整内容走 Tooltip） */
const ellipsis = {
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
} as const

/**
 * 载入方案列表的一行：方案名 · N 步 · 产物与单位成本（或「算不出结果」），
 * 有备注时另起一行。
 *
 * 不用 List.Item.Meta：它把标题与描述拆成两行，24 个方案就撑到 1245px、
 * 必在小屏上滚动。挤成一行后每项 50px，一屏能把方案全列出来。
 * 名称按内容宽度（flex: 0 1 auto），「N 步 · 产物 · 单价」靠右贴着操作按钮——
 * 两者顶在一起，中间不留空白。空间不够时收缩的是名称：元信息设了 flex: 0 0 auto，
 * 缩不得，截断成「213.」比不显示还糟。名称本身过长时省略，完整值走 Tooltip。
 */
function SchemeItem({ s, onLoad, onDelete }: {
  s: SchemeSummary
  onLoad: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <List.Item
      style={{ gap: 8 }}
      actions={[
        <Button key="l" type="link" size="small" icon={<FolderOpenOutlined />}
          onClick={() => onLoad(s.id)}>载入</Button>,
        <Popconfirm key="d" title="删除？" onConfirm={() => onDelete(s.id)}>
          <Button size="small" danger type="link" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>,
      ]}
    >
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <Tooltip title={s.name}>
            <span style={{ ...ellipsis, flex: '0 1 auto', minWidth: 0, fontWeight: 500 }}>{s.name}</span>
          </Tooltip>
          <span style={{ flex: '0 0 auto', marginLeft: 'auto', color: '#999', fontSize: 12 }}>{s.stepCount} 步</span>
          {s.hasResult ? (
            <span style={{ flex: '0 0 auto', color: '#999', fontSize: 12 }}>
              {s.productName || '产物'} · {fmtMoney(s.unitCost)} 元/kg
            </span>
          ) : s.blockingErrors?.length ? (
            <Tooltip title={s.blockingErrors.join('；')}>
              <span style={{ flex: '0 0 auto', color: '#999', fontSize: 12 }}>
                <WarningOutlined /> 无结果
              </span>
            </Tooltip>
          ) : null}
        </div>
        {s.note && <div style={{ ...ellipsis, color: '#999', fontSize: 12 }}>{s.note}</div>}
      </div>
    </List.Item>
  )
}

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
      {/* 与物料/价格弹窗同一套收紧后的表单间距 */}
      <ConfigProvider theme={{ components: { Form: { itemMarginBottom: 12, verticalLabelPadding: '0 0 4px' } } }}>
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
      </ConfigProvider>

      {/* 宽度 560 而非 480：每行要放下「方案名 · N 步 · 产物 · 单价」，
          480 时单价会被挤到第二行，行高参差不齐 */}
      {/* marginXXL 是 antd 给 .ant-list-item-action 的 marginInlineStart。它由
          sizeXXL 推出来（sizeUnit × (sizeStep + 8) = 48），不是直觉上的 32；
          连同 <li> 的 8px，元信息与「载入」之间会空出 56px。这里减半到 20+8=28。 */}
      <ConfigProvider theme={{ components: { List: { itemPadding: '4px 0' } }, token: { marginXXL: 20 } }}>
        <Modal title="载入方案" open={loadOpen} onCancel={onLoadClose} footer={null} width={560}>
          <List
            dataSource={schemes.filter(Boolean)}
            renderItem={(s) => <SchemeItem s={s} onLoad={onLoad} onDelete={onDelete} />}
          />
        </Modal>
      </ConfigProvider>
    </>
  )
}

export default SchemeModals
