// 编辑器行类型：在 Wails bindings 的输入类型基础上，扩展编辑期专用的 _key 与价格选项。
import type {
  ReactionStep, ReagentInput, ProductInput, Scheme, Material, Price,
} from '@bindings/github.com/dongying1997/materialcost4/internal/models/models'
import type {
  MaterialPriceOption,
} from '@bindings/github.com/dongying1997/materialcost4/internal/service/models'
import type { DecStr } from '@/shared/utils/decimal'

/** 高精度十进制串；从 types 统一对外转出，调用方不必知道它住在 shared/utils/decimal */
export type { DecStr }

/**
 * 编辑器行的数值字段一律用 DecStr（十进制字面量字符串）而不是 number，
 * 以便在编辑过程中保留高精度原值（见 shared/utils/decimal.ts）。
 * 跨过 Wails bindings 传给 Go 时由 lib/reaction.ts 的 stepsToPayload 统一 toNumber()。
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
