// 前端类型重导出（从 Wails 生成的 bindings）
import type {
  Material, MaterialWithPrice, Price, ReactionStep, ReagentInput,
  ProductInput, Scheme, PriceSnapshot,
} from '@bindings/github.com/dongying1997/materialcost4/internal/models/models'
import type {
  StepResult, ReagentResult, ProductResult, IntermediateProduct,
} from '@bindings/github.com/dongying1997/materialcost4/internal/engine/models'
import type {
  MaterialPriceOption, ImportResult, CalculateResult, SchemeSummary,
} from '@bindings/github.com/dongying1997/materialcost4/internal/service/models'

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
  SchemeSummary,
}

// 前端编辑行类型（见 types/editor.ts）。这里 re-export，调用方仍可从 '@/types' 统一取用。
export type {
  DecStr, ReagentRow, ProductRow, StepRow,
  SchemePayload, MaterialPayload, PricePayload,
} from '@/types/editor'
