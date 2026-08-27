// 反应计算的辅助函数：步骤对象构造与前后端数据序列化
import type { StepRow, MultiStepResult, ReactionStep } from '../types'

let keySeq = 0

/** 生成用于 React key 的唯一短标识 */
export function uid(prefix: string): string {
  keySeq += 1
  return `${prefix}${Date.now().toString(36)}${keySeq.toString(36)}`
}

/** 创建一个空步骤（含一个默认原料与产物） */
export function newStep(): StepRow {
  return {
    _key: uid('s'),
    id: 0, stepNum: 1, name: '',
    reagents: [{
      _key: uid('r'),
      materialId: 0, inherited: false, name: '', cas: '', formula: '', molWeight: 0,
      content: 100, recoveryRate: 0, isSubstrate: true, equiv: null, amountKg: null,
      unitPriceYuanPerKg: null, priceSourceId: 0, priceOptions: [],
    }],
    products: [{
      _key: uid('p'),
      materialId: 0, inherited: false, name: '', cas: '', formula: '', molWeight: 0,
      isSubstrate: true, molarRatio: 1, weightYield: null, molarYield: null, actualYield: null,
    }],
  }
}

/** 将编辑器步骤行序列化为后端输入 */
export function stepsToPayload(steps: StepRow[]): ReactionStep[] {
  return steps.map(s => ({
    id: s.id, stepNum: s.stepNum, name: s.name,
    reagents: s.reagents.map(r => ({
      materialId: r.materialId, inherited: r.inherited, name: r.name, cas: r.cas,
      formula: r.formula, molWeight: r.molWeight, content: r.content, recoveryRate: r.recoveryRate,
      isSubstrate: r.isSubstrate, equiv: r.equiv, amountKg: r.amountKg,
      unitPriceYuanPerKg: r.unitPriceYuanPerKg, priceSourceId: r.priceSourceId,
    })),
    products: s.products.map(p => ({
      materialId: p.materialId, inherited: p.inherited, name: p.name, cas: p.cas,
      formula: p.formula, molWeight: p.molWeight, isSubstrate: p.isSubstrate,
      molarRatio: p.molarRatio, weightYield: p.weightYield, molarYield: p.molarYield,
      actualYield: p.actualYield,
    })),
  }))
}

/** 用方案数据构造编辑器步骤行（重新生成 _key） */
export function stepsFromScheme(steps: ReactionStep[] | null | undefined): StepRow[] {
  return (steps || []).map(s => ({
    _key: uid('s'),
    id: s.id, stepNum: s.stepNum, name: s.name,
    reagents: (s.reagents || []).map(r => ({
      ...r, _key: uid('r'), priceOptions: [],
    })),
    products: (s.products || []).map(p => ({
      ...p, _key: uid('p'),
    })),
  }))
}

/** 四舍五入到两位小数 */
export function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * 把计算结果回填到编辑行中的空缺字段（仅当整条链无阻塞错误时调用）。
 * 原料：缺实际投料量 → 用推算值；产物：缺收率/实际产量 → 用推算值。
 * 回填值统一修约到两位小数。返回新的步骤数组；若无任何空缺则原样返回。
 */
export function backfillFromResult(steps: StepRow[], result: MultiStepResult | null | undefined): StepRow[] {
  if (!result?.steps) return steps
  const stepResults = result.steps
  let anyChanged = false
  const out = steps.map((s, i) => {
    const sr = stepResults[i]
    if (!sr || (sr.blockingErrors || []).length > 0) return s
    let changed = false

    // 原料：补投料量（当量推算值）
    const reagents = s.reagents.map((r, j) => {
      if (r.inherited || r.amountKg !== null && r.amountKg !== undefined && r.amountKg !== 0) return r
      const akg = sr.reagents?.[j]?.actualAmountKg
      if (akg && akg > 0) { changed = true; return { ...r, amountKg: round2(akg) } }
      return r
    })

    // 产物：补空缺的收率 / 实际产量（推算值）
    const products = s.products.map((p, j) => {
      const pr = sr.products?.[j]
      if (!pr) return p
      const hasWeight = p.weightYield !== null && p.weightYield !== undefined && p.weightYield !== 0
      const hasMolar = p.molarYield !== null && p.molarYield !== undefined && p.molarYield !== 0
      const hasActual = p.actualYield !== null && p.actualYield !== undefined && p.actualYield !== 0
      if (hasWeight && hasMolar && hasActual) return p
      let np = p
      if (!hasWeight && pr.weightYield > 0) { np = { ...np, weightYield: round2(pr.weightYield) }; changed = true }
      if (!hasMolar && pr.molarYield > 0) { np = { ...np, molarYield: round2(pr.molarYield) }; changed = true }
      if (!hasActual && pr.actualYieldKg > 0) { np = { ...np, actualYield: round2(pr.actualYieldKg) }; changed = true }
      return np
    })

    if (changed) { anyChanged = true; return { ...s, reagents, products } }
    return s
  })
  return anyChanged ? out : steps
}

/** 收集所有非阻塞警告 */
export function allWarningsOf(result: MultiStepResult | null): string[] {
  return (result?.steps || []).flatMap(s => s?.warnings || [])
}

/** 收集所有阻塞性错误（带步骤编号） */
export function allBlockingMsgs(result: MultiStepResult | null): string {
  if (!result) return ''
  return (result.steps || []).flatMap((s, i) => (s?.blockingErrors || []).map(e => `步骤 ${i + 1}：${e}`)).join('；')
}
