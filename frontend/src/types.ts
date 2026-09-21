// 前端类型重导出（从 Wails 生成的 bindings）
import type {
  Material, MaterialWithPrice, Price, ReactionStep, ReagentInput,
  ProductInput, Scheme, PriceSnapshot,
} from '../bindings/github.com/dongying1997/materialcost4/internal/models/models'
import type {
  StepResult, ReagentResult, ProductResult, IntermediateProduct,
} from '../bindings/github.com/dongying1997/materialcost4/internal/engine/models'
import type {
  MaterialPriceOption, ImportResult, CalculateResult,
} from '../bindings/github.com/dongying1997/materialcost4/internal/service/models'

/**
 * MultiStepResult = 后端计算结果的形状（engine.MultiStepResult）。
 * 现在该结构随 CalculateResult 一起生成在 service 包下，这里保留旧名字做别名，
 * 调用方无需改动；同时改走生成类型，避免手写结构与后端漂移。
 */
export type MultiStepResult = CalculateResult


export type {
  Material, MaterialWithPrice, Price, ReactionStep, ReagentInput,
  ProductInput, Scheme, PriceSnapshot, StepResult, ReagentResult,
  ProductResult, MaterialPriceOption, ImportResult, IntermediateProduct,
}

// ---- 前端编辑器行类型（在 bindings 基础上扩展 _key 与价格选项）----
import type { DecStr } from './utils/decimal'

/** 高精度十进制串；从 types 统一对外转出，调用方不必知道它住在 utils/decimal */
export type { DecStr }

/**
 * 编辑器行的数值字段一律用 DecStr（十进制字面量字符串）而不是 number，
 * 以便在编辑过程中保留高精度原值（见 utils/decimal.ts）。
 * 跨过 Wails bindings 传给 Go 时由 utils/reaction.ts 的 stepsToPayload 统一 toNumber()。
 */

/** 原料编辑行 */
export interface ReagentRow extends Omit<ReagentInput, 'content' | 'recoveryRate' | 'molWeight' | 'equiv' | 'amountKg'> {
  _key: string
  molWeight: DecStr
  content: DecStr
  recoveryRate: DecStr
  equiv: DecStr | null
  amountKg: DecStr | null
  /** 该物料在物料库中的历史价格（供下拉选择；首项为库中最新价） */
  priceOptions?: MaterialPriceOption[]
  /** 库中最新价，仅用于与价格快照比对并提示变动；不参与计算 */
  latestPrice?: MaterialPriceOption | null
}

/** 产物编辑行 */
export interface ProductRow extends Omit<ProductInput,
  'molWeight' | 'molarRatio' | 'weightYield' | 'molarYield' | 'actualYield'> {
  _key: string
  molWeight: DecStr
  molarRatio: DecStr
  weightYield: DecStr | null
  molarYield: DecStr | null
  actualYield: DecStr | null
}

/** 步骤编辑行 */
export interface StepRow extends Omit<ReactionStep, 'reagents' | 'products'> {
  _key: string
  reagents: ReagentRow[]
  products: ProductRow[]
}

// ---- 保存操作的负载类型：时间字段由后端生成，发送时省略（不传空字符串）----

export type SchemePayload = Omit<Scheme, 'createdAt' | 'updatedAt'>
export type MaterialPayload = Omit<Material, 'createdAt' | 'updatedAt'>
export type PricePayload = Omit<Price, 'createdAt'>
