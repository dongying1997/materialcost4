// 反应计算的辅助函数：步骤对象构造与前后端数据序列化
import type {
  StepRow, MultiStepResult, ReactionStep, MaterialPriceOption, PriceSnapshot,
} from '../types'

/** 价格快照与库中最新价的差异阈值（元/kg），超过则提示用户 */
export const PRICE_DRIFT_THRESHOLD = 0.01

/** 空快照（未设置价格） */
export const emptyPrice = (): PriceSnapshot => ({
  unitPriceYuanPerKg: 0, price: 0, unit: '元/kg', supplier: '', date: '', spec: '',
})

/** 由物料库的历史价格选项构造价格快照（下拉选择时用） */
export function priceFromOption(o: MaterialPriceOption): PriceSnapshot {
  return {
    unitPriceYuanPerKg: o.pricePerKg,
    price: o.price,
    unit: o.unit,
    supplier: o.supplier,
    date: o.date,
    spec: o.spec,
  }
}

/**
 * 库中最新价与方案快照的差异是否已超出阈值。
 * 以快照为准计算，仅在差异明显时提示用户，不自动改写。
 */
export function priceDrifted(price: PriceSnapshot | null | undefined, latest?: MaterialPriceOption | null): boolean {
  if (!price || !latest) return false
  return Math.abs(latest.pricePerKg - price.unitPriceYuanPerKg) > PRICE_DRIFT_THRESHOLD
}

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
      price: null, priceOptions: [], latestPrice: null,
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
      price: r.price,
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
      ...r, _key: uid('r'), priceOptions: [], latestPrice: null,
    })),
    products: (s.products || []).map(p => ({
      ...p, _key: uid('p'),
    })),
  }))
}

/**
 * 把某物料的价格选项、库中最新价写入所有引用该物料的行。
 * 最新价用于与方案自带的价格快照比对（差异 > 阈值时在单价单元格提示）。
 */
export function upsertPriceOptions(
  steps: StepRow[], materialId: number, opts: MaterialPriceOption[],
): StepRow[] {
  if (!materialId) return steps
  const latest = opts[0] || null // 后端按日期倒序返回
  let changed = false
  const out = steps.map(s => ({
    ...s,
    reagents: s.reagents.map(r => {
      if (r.materialId !== materialId) return r
      changed = true
      return { ...r, priceOptions: opts, latestPrice: latest }
    }),
  }))
  return changed ? out : steps
}

/** 四舍五入到两位小数 */
export function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * 把计算结果回填到编辑行中的空缺字段（仅当整条链无阻塞错误时调用）。
 * 原料：缺当量 → 用实际投料量反推当量；缺实际投料量 → 用当量推算值。
 * 产物：缺收率/实际产量 → 用推算值。当量为比值、保留三位小数，其余回填值修约到两位小数。
 * 返回新的步骤数组；若无任何空缺则原样返回。
 */
export function backfillFromResult(steps: StepRow[], result: MultiStepResult | null | undefined): StepRow[] {
  if (!result?.steps) return steps
  const stepResults = result.steps
  let anyChanged = false
  const out = steps.map((s, i) => {
    const sr = stepResults[i]
    if (!sr || (sr.blockingErrors || []).length > 0) return s
    let changed = false

    // 原料：补当量（由已有投料量反推）与投料量（由当量推算值）
    const reagents = s.reagents.map((r, j) => {
      const res = sr.reagents?.[j]
      if (!res) return r
      // 底物是 1 eq 基准，其当量由引擎固定为 1，无需回填
      if (r.isSubstrate) return r
      let nr = r
      const zeroKg = r.amountKg === null || r.amountKg === undefined || r.amountKg === 0
      if (zeroKg) {
        // 只填了当量：补投料量（推算值）
        const akg = res.actualAmountKg
        if (akg && akg > 0) { nr = { ...nr, amountKg: round2(akg) }; changed = true }
      } else if (r.equiv === null || r.equiv === undefined || r.equiv === 0) {
        // 只填了投料量：补当量，使两个字段一致（消除“实际投料量与当量推算偏差”告警）
        if (res.equiv > 0) { nr = { ...nr, equiv: Math.round(res.equiv * 1000) / 1000 }; changed = true }
      }
      return nr
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

/**
 * 各步骤的链式成本占比乘数（传递模型）。
 * 每步的“基础物料”= 继承自上一步的原料（承载上一步累计成本，引擎结果与输入顺序一致，用输入 steps 的 inherited 标志定位索引）。
 * baseShare_j = 第 j 步基础物料成本 ÷ 第 j 步总成本。
 * 某步原料在总成本中的占比 = 本步占比 × 后续每步 baseShare 之积（链式相乘）。
 * 返回与 steps 等长的数组；某步不可乘（无继承原料/无成本/有阻塞）时其乘数为 1，后续不再传递。
 * 例如三步反应：第 2 步物料占比 = 本步占比 × baseShare₃；第 1 步 = 本步占比 × baseShare₂ × baseShare₃。
 */
export function chainMultipliers(steps: StepRow[], result: MultiStepResult | null | undefined): number[] {
  const stepResults = result?.steps || []
  const multipliers = new Array<number>(steps.length).fill(1)
  let acc = 1
  for (let i = steps.length - 1; i >= 0; i--) {
    const sr = stepResults[i]
    if (!sr || (sr.blockingErrors || []).length > 0 || sr.totalCost <= 0) { acc = 1; continue }
    multipliers[i] = acc
    // 基础物料 = 本步中继承自上一步的原料（成本承载上一步累计成本）
    const baseIdx = steps[i]?.reagents.findIndex(r => r.inherited)
    const base = baseIdx != null && baseIdx >= 0 ? sr.reagents?.[baseIdx] : undefined
    if (base && base.cost > 0) {
      acc *= base.cost / sr.totalCost
    } else {
      acc = 1
    }
  }
  return multipliers
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
