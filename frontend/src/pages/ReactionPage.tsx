import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { message, Form } from 'antd'
import { useReactionCalc } from '../hooks/useReactionCalc'
import { useSchemes } from '../hooks/useSchemes'
import StepCard from '../components/StepCard'
import CalcToolbar from '../components/CalcToolbar'
import CalcAlerts from '../components/CalcAlerts'
import SchemeModals from '../components/SchemeModals'
import { chainMultipliers } from '../utils/reaction'
import type { StepRow, StepResult } from '../types'

/** 反应计算编辑器页 */
function ReactionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm()
  const [saveOpen, setSaveOpen] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)

  const calc = useReactionCalc(messageApi)

  // 每步成本在总成本中的链式乘数（供卡片展示原料占总成本比例）
  const multipliers = chainMultipliers(calc.steps, calc.result)

  // 从方案管理页载入步骤（经路由 state 传入），注入后清除 state 防止重放
  useEffect(() => {
    const rows = (location.state as { loadRows?: StepRow[] } | null)?.loadRows
    if (rows?.length) calc.setSteps(rows)
    if (location.state) navigate('/reaction', { replace: true, state: null })
  }, []) // eslint-disable-line

  // 从「载入方案」弹窗载入步骤到编辑器
  const handleLoaded = (rows: StepRow[]) => {
    calc.setSteps(rows)
    setLoadOpen(false)
  }
  const schemes = useSchemes(messageApi, handleLoaded)

  const doSaveScheme = async () => {
    const v = await form.validateFields()
    const ok = await schemes.saveScheme(v.name, v.note || '', calc.steps)
    if (ok) setSaveOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {contextHolder}
      <div style={{ flexShrink: 0 }}>
        <CalcToolbar
          result={calc.result}
          calculating={calc.calculating}
          onAddStep={calc.addStep}
          onSave={() => { form.resetFields(); setSaveOpen(true) }}
          onLoad={() => { schemes.loadSchemes(); setLoadOpen(true) }}
          onRecalculate={calc.recalculate}
          onClear={calc.clearAll}
        />
        <CalcAlerts result={calc.result} />
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
            onPriceOptions={(mid, key) => calc.ensurePriceOptions(mid, key, i)}
          />
        ))}
      </div>

      <SchemeModals
        saveOpen={saveOpen}
        loadOpen={loadOpen}
        form={form}
        schemes={schemes.schemes}
        onSaveCancel={() => setSaveOpen(false)}
        onSaveOk={doSaveScheme}
        onLoadClose={() => setLoadOpen(false)}
        onLoad={schemes.loadScheme}
        onDelete={schemes.deleteScheme}
      />
    </div>
  )
}

export default ReactionPage
