import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { message, Form } from 'antd'
import { useReactionCalc } from '@/pages/reaction/useReactionCalc'
import { useSchemes } from '@/shared/hooks/useSchemes'
import StepCard from '@/pages/reaction/components/StepCard'
import CalcToolbar from '@/pages/reaction/components/CalcToolbar'
import SchemeImageBox from '@/pages/reaction/components/SchemeImageBox'
import SchemeModals from '@/pages/reaction/components/SchemeModals'
import { chainMultipliers } from '@/lib/reaction'
import { useMaterialEditor } from '@/shared/hooks/useMaterialEditor'
import MaterialEditModal from '@/shared/components/MaterialEditModal'
import type { SchemeMeta } from '@/shared/hooks/useSchemes'
import { usePasteImage } from '@/pages/reaction/usePasteImage'
import type { Scheme, StepRow, StepResult } from '@/types'

/** 反应计算编辑器页 */
function ReactionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm()
  const [saveOpen, setSaveOpen] = useState(false)
  // 同一个弹窗服务两种意图：'save' 需要按当前 id 分流（改写回原行或新建），
  // 'saveAs' 一律新建。两者都要名称，所以共用表单，只在提交时分开。
  const [saveMode, setSaveMode] = useState<'save' | 'saveAs'>('save')
  const [loadOpen, setLoadOpen] = useState(false)
  // 当前编辑的方案在库中的身份。id 为 0 = 尚未落库：
  //   - 「保存方案」需要名称才能新建，故弹名称弹窗；
  //   - 「另存为」无从另存，按钮禁用。
  // 载入方案、保存成功、另存为成功都会刷新它。
  const [currentScheme, setCurrentScheme] = useState<SchemeMeta>({ id: 0, name: '', note: '' })

  const calc = useReactionCalc(messageApi)

  // 每步成本在总成本中的链式乘数（供卡片展示原料占总成本比例）
  const multipliers = chainMultipliers(calc.steps, calc.result)

  // 从方案管理页载入步骤（经路由 state 传入），注入后清除 state 防止重放
  useEffect(() => {
    const st = location.state as
      { loadRows?: StepRow[]; loadImage?: string; loadMeta?: SchemeMeta } | null
    if (st?.loadRows?.length) {
      calc.setSteps(st.loadRows)
      // 没附图的方案传空串：必须显式清掉当前图，否则上一张图会被带进新方案
      calc.setImage(st.loadImage || '')
      setCurrentScheme(st.loadMeta || { id: 0, name: '', note: '' })
    }
    if (location.state) navigate('/reaction', { replace: true, state: null })
  }, []) // eslint-disable-line

  // 从「载入方案」弹窗载入步骤到编辑器（图片与方案身份随方案一起换掉）
  const handleLoaded = (rows: StepRow[], image: string, meta: SchemeMeta) => {
    calc.setSteps(rows)
    calc.setImage(image)
    setCurrentScheme(meta)
    setLoadOpen(false)
  }
  const schemes = useSchemes(messageApi, handleLoaded)

  const paste = usePasteImage({ onImage: calc.setImage })

  // 新增物料：落库后要重新拉一遍物料库，否则刚建的物料不会出现在名称列的下拉候选里。
  // 这里只用新增（create），编辑物料仍在物料库页——反应计算页没有「编辑已有物料」的入口。
  const materialEditor = useMaterialEditor(messageApi, () => { calc.reloadMaterials() })

  /**
   * 落库成功后把「当前方案」切到那一行——新建完就不再是未保存状态了。
   * typed 是弹窗里填的名称/备注：另存为时后端若没回带方案体，用它兜底，
   * 否则会把用户刚填的名称丢掉。
   */
  const adoptScheme = (saved: Scheme | null, typed?: { name: string; note?: string }) => {
    if (!saved && !typed) return
    setCurrentScheme(prev => ({
      // 后端理应回带自增 id；万一没有（返回 0），保留原 id 而不是把身份抹成
      // 「未保存」——否则刚存好的方案会立刻退回「另存禁用、保存又弹窗」的状态。
      id: (saved && saved.id) || prev.id,
      name: (saved && saved.name) || typed?.name || prev.name,
      note: (saved && saved.note) || typed?.note || prev.note,
    }))
  }

  // 弹窗提交：名称与备注由用户填。另存为一律新建；保存则按当前 id 分流
  // （未落库时 id 为 0，同样落到新建）。
  const doSaveScheme = async () => {
    const v = await form.validateFields()
    const id = saveMode === 'saveAs' ? 0 : currentScheme.id
    const saved = saveMode === 'saveAs'
      ? await schemes.saveSchemeAs(v.name, v.note || '', calc.steps, calc.image)
      : await schemes.saveScheme(v.name, v.note || '', calc.steps, calc.image, id)
    adoptScheme(saved, v)
    setSaveOpen(false)
  }

  // 保存方案：已落库的直接写回原行，不弹窗（名称与备注沿用方案自身的）；
  // 未落库的（新建、或另存为后又清空）没有名称可用，才弹窗问一次。
  // 这就是「保存」与「另存为」的分工：前者接着用，后者开新档。
  const handleSave = async () => {
    if (currentScheme.id === 0) {
      form.resetFields()
      setSaveMode('save')
      setSaveOpen(true)
      return
    }
    adoptScheme(await schemes.saveScheme(
      currentScheme.name, currentScheme.note, calc.steps, calc.image, currentScheme.id))
  }

  // 下拉里的「重命名并保存」：唯一能改到已保存方案名称/备注的入口，
  // 故开弹窗并预填原值，提交后写回同一行（id 仍是 currentScheme.id）。
  const handleRenameSave = () => {
    form.setFieldsValue({ name: currentScheme.name, note: currentScheme.note })
    setSaveMode('save')
    setSaveOpen(true)
  }

  // 另存为：开同一个弹窗，但名称留空让用户起个新名（沿用旧名正是「覆盖」的心智），
  // 提交时走 CreateScheme 产生新行（服务端强制不覆盖）。
  const handleSaveAs = () => {
    form.resetFields()
    setSaveMode('saveAs')
    setSaveOpen(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {contextHolder}
      {paste.contextHolder}
      <div style={{ flexShrink: 0 }}>
        <CalcToolbar
          calculating={calc.calculating}
          onAddStep={calc.addStep}
          onAddMaterial={materialEditor.create}
          onSave={handleSave}
          onRenameSave={handleRenameSave}
          onSaveAs={handleSaveAs}
          savedName={currentScheme.id > 0 ? currentScheme.name : ''}
          onLoad={() => { schemes.loadSchemes(); setLoadOpen(true) }}
          onRecalculate={calc.recalculate}
          onClear={calc.clearAll}
          onPasteImage={paste.requestPaste}
          onRemoveImage={() => calc.setImage('')}
          hasImage={!!calc.image}
        />
        <SchemeImageBox image={calc.image} />
      </div>
      <div style={{ overflow: 'auto', minHeight: 0, paddingBottom: 16 }}>
        {calc.steps.map((s, i) => (
          <StepCard
            key={s._key}
            index={i}
            step={s}
            materials={calc.materials}
            result={(calc.result?.steps || [])[i] as StepResult | undefined}
            totalShareMultiplier={multipliers[i]}
            prevProduct={i > 0 ? (calc.result?.steps || [])[i - 1]?.primaryProduct || null : null}
            canInherit={i > 0}
            onChange={(ns) => calc.updateStep(i, ns)}
            onRemove={() => calc.removeStep(i)}
            onMoveUp={i > 0 ? () => calc.moveStep(i, -1) : undefined}
            onMoveDown={i < calc.steps.length - 1 ? () => calc.moveStep(i, 1) : undefined}
            onPriceOptions={(mid) => calc.ensurePriceOptions(mid)}
          />
        ))}
      </div>

      <MaterialEditModal
        open={materialEditor.open}
        editing={materialEditor.editing}
        form={materialEditor.form}
        onOk={materialEditor.save}
        onCancel={materialEditor.close}
      />

      <SchemeModals
        saveOpen={saveOpen}
        loadOpen={loadOpen}
        form={form}
        schemes={schemes.schemes}
        onSaveCancel={() => setSaveOpen(false)}
        onSaveOk={doSaveScheme}
        onLoadClose={() => setLoadOpen(false)}
        onLoad={schemes.loadSchemeById}
        onDelete={schemes.deleteSchemeById}
      />
    </div>
  )
}

export default ReactionPage
