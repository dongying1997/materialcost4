// 新增 / 编辑物料：物料库页与反应计算页共用同一套表单、弹窗与落库逻辑。
//
// 抽成 hook 而不是各自实现一遍，是因为这套动作在两页里完全同构（同样是表单 +
// 初始价格），分头写必然在两处的字段处理上慢慢漂移——比如 priceDate 的时区格式、
// 价格填了一半时的告警文案，漏改一处就是一个隐蔽的 bug。
import { useState } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import { Form } from 'antd'
import dayjs from 'dayjs'
import { MaterialService } from '@/lib/bindings'
import type { Material, MaterialWithPrice, MaterialPayload, Price, PricePayload } from '@/types'
import { materialToPayload } from '@/lib/reaction'

export interface MaterialEditorApi {
  /** 表单实例，交给 MaterialEditModal 渲染 */
  form: ReturnType<typeof Form.useForm>[0]
  open: boolean
  /** 正在编辑的物料；null 表示新增 */
  editing: Material | null
  create: () => void
  edit: (m: MaterialWithPrice) => void
  close: () => void
  save: () => Promise<void>
}

/**
 * 物料新增 / 编辑的弹窗状态与保存动作。
 *
 * 反应计算页只用 create（新增），物料库页两种都用。
 *
 * @param messageApi 调用方的 message 实例（页面各自持有 contextHolder）
 * @param onSaved 落库成功后的回调：物料库刷新列表，反应计算页刷新候选物料
 */
export function useMaterialEditor(
  messageApi: MessageInstance,
  onSaved?: (m: Material | null) => void,
): MaterialEditorApi {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form] = Form.useForm()

  const create = () => {
    setEditing(null)
    form.resetFields()
    // 价格的单位给个默认值（与价格抽屉一致），其余留空由用户按需填
    form.setFieldsValue({ priceUnit: '元/kg' })
    setOpen(true)
  }

  const edit = (m: MaterialWithPrice) => {
    setEditing(m)
    // 只回填物料自身的字段：价格归「价格」抽屉管，这里刻意不碰
    form.setFieldsValue({
      code: m.code, name: m.name, cas: m.cas, formula: m.formula,
      molWeight: m.molWeight, content: m.content, recoveryRate: m.recoveryRate,
      note: m.note,
    })
    setOpen(true)
  }

  const close = () => setOpen(false)

  const save = async () => {
    const values = await form.validateFields()
    const payload: MaterialPayload = materialToPayload(values, editing?.id || 0)

    // 价格整体可选：只有用户真的动了价格表单才处理。编辑已有物料时价格块
    // 根本不渲染，这段自然不成立。
    // 判据只看价格块自己的字段（都以 price 开头），刻意不含：
    //   - 物料自身的字段（名称/分子量/含量 等），那是建物料的信号，不是填价格的信号
    //   - priceUnit：它带默认值「元/kg」，有值不代表用户填过价格
    // 注意价格块的「含量(%)」命名成 priceContent 而不是 content，两者分属两块表单，
    // 同名会互相覆盖。
    const touchedPrice = editing === null && (
      values.priceValue != null || values.priceDate != null ||
      !!values.priceSupplier || !!values.priceSpec || values.priceContent != null ||
      !!values.priceNote || !!values.priceScale
    )
    if (touchedPrice && (values.priceValue == null || values.priceValue <= 0)) {
      messageApi.warning('已填写价格信息，请补上价格金额（或清空价格栏只新增物料）')
      return
    }

    try {
      const saved = await MaterialService.SaveMaterial(payload as Material)
      if (!saved) {
        messageApi.error('物料保存失败：后端未返回物料')
        return
      }
      if (touchedPrice) {
        // 物料必须先落库拿到 id，价格才能挂到它下面——
        // 因此这里是两次调用而不是一个事务；价格存失败不影响已建好的物料。
        const pricePayload: PricePayload = {
          id: 0,
          materialId: saved.id,
          price: values.priceValue,
          unit: values.priceUnit || '元/kg',
          priceScale: values.priceScale || '',
          supplier: values.priceSupplier || '',
          // 后端 time.Time 需要完整 RFC3339（本地时区偏移），纯日期会解析失败；
          // 没填日期时按今天算，与价格抽屉里「默认今天」的行为一致
          date: (values.priceDate || dayjs()).format('YYYY-MM-DDTHH:mm:ssZ'),
          spec: values.priceSpec || '',
          content: values.priceContent || 0,
          note: values.priceNote || '',
        }
        try {
          await MaterialService.SavePrice(pricePayload as Price)
          messageApi.success('物料与价格已新增')
        } catch (pe) {
          // 物料已经建好了，把这一点说清楚，否则用户会以为整次操作都失败而重复新增
          messageApi.error(`物料已新增，但价格保存失败：${String(pe)}`)
          setOpen(false)
          onSaved?.(saved as Material)
          return
        }
      } else {
        messageApi.success(editing ? '物料已更新' : '物料已新增')
      }
      setOpen(false)
      onSaved?.((saved as Material) ?? null)
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  return { form, open, editing, create, edit, close, save }
}
