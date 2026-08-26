// 前端类型重导出（从 Wails 生成的 bindings）
import type {
  Material, MaterialWithPrice, Price, ReactionStep, ReagentInput,
  ProductInput, Scheme,
} from '../bindings/materialcost4/internal/models/models'
import type {
  MultiStepResult, StepResult, ReagentResult, ProductResult, IntermediateProduct,
} from '../bindings/materialcost4/internal/engine/models'
import type {
  MaterialPriceOption, ImportResult,
} from '../bindings/materialcost4/internal/service/models'

export type {
  Material, MaterialWithPrice, Price, ReactionStep, ReagentInput,
  ProductInput, Scheme, MultiStepResult, StepResult, ReagentResult,
  ProductResult, MaterialPriceOption, ImportResult, IntermediateProduct,
}

// ---- 前端编辑器行类型（在 bindings 基础上扩展 _key 与价格选项）----

/** 原料编辑行 */
export interface ReagentRow extends Omit<ReagentInput, 'content' | 'recoveryRate'> {
  _key: string
  content: number
  recoveryRate: number
  /** 该物料的价格选项（供下拉选择，数量>1 时显示） */
  priceOptions?: MaterialPriceOption[]
}

/** 产物编辑行 */
export interface ProductRow extends ProductInput {
  _key: string
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
