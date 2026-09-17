// Package engine 提供反应成本计算引擎。所有函数为纯函数，便于单元测试。
//
// 单位约定：投料量 kg，分子量 g/mol，单价 元/kg，含量/回收率/收率均为百分数值（如 98 表示 98%）。
package engine

// IntermediateProduct 上一步产物的传递信息（多步反应继承用）。
type IntermediateProduct struct {
	Name        string  `json:"name"`
	MolWeight   float64 `json:"molWeight"`
	UnitCost    float64 `json:"unitCost"`    // 单位成本（元/kg）
	ActualYield float64 `json:"actualYield"` // 实际产量（kg）
}

// ReagentResult 单个原料的计算结果。
type ReagentResult struct {
	// 有效摩尔数（mol）
	Moles float64 `json:"moles"`
	// 当量（计算或输入）
	Equiv float64 `json:"equiv"`
	// 理论投料量（kg）= 摩尔×分子量÷(含量%×1000)
	TheoreticalAmountKg float64 `json:"theoreticalAmountKg"`
	// 实际投料量（kg）：输入或由当量推算
	ActualAmountKg float64 `json:"actualAmountKg"`
	// 单价（元/kg）
	UnitPrice float64 `json:"unitPrice"`
	// 成本（元）= 实际投料量×单价×(1-回收率%)
	Cost float64 `json:"cost"`
	// 单位成本（元/kg）= 本原料成本 ÷ 本步主产物实际产量。
	// 无主产物或产量为 0 时为 0（此时成本仍可由 Cost 得到）。
	UnitCost float64 `json:"unitCost"`
	// 阻塞性错误（如 当量与投料量都为空）
	BlockingErrors []string `json:"blockingErrors"`
	// 非阻塞警告
	Warnings []string `json:"warnings"`
}

// ProductResult 单个产物的计算结果。
type ProductResult struct {
	// 理论产量（kg）
	TheoreticalYieldKg float64 `json:"theoreticalYieldKg"`
	// 实际产量（kg）：输入或由收率推算
	ActualYieldKg float64 `json:"actualYieldKg"`
	// 重量收率（%）
	WeightYield float64 `json:"weightYield"`
	// 摩尔收率（%）
	MolarYield float64 `json:"molarYield"`
	// 单位成本（元/kg）= 本步总成本 ÷ 实际产量
	UnitCost float64 `json:"unitCost"`
	// 是否主产物（供下一步继承）
	IsPrimary bool `json:"isPrimary"`
	// 阻塞性错误
	BlockingErrors []string `json:"blockingErrors"`
	// 非阻塞警告
	Warnings []string `json:"warnings"`
}

// StepResult 一步反应的完整计算结果。
type StepResult struct {
	// 本步总成本（元）
	TotalCost float64 `json:"totalCost"`
	// 底物有效摩尔数（mol）
	SubstrateMoles float64 `json:"substrateMoles"`
	// 各原料结果（与输入顺序一致）
	Reagents []ReagentResult `json:"reagents"`
	// 各产物结果（与输入顺序一致）
	Products []ProductResult `json:"products"`
	// 阻塞性错误（参数校验失败）
	BlockingErrors []string `json:"blockingErrors"`
	// 非阻塞警告
	Warnings []string `json:"warnings"`
	// 主产物（供下一步继承），无主产物或计算失败时为 nil
	PrimaryProduct *IntermediateProduct `json:"primaryProduct,omitempty"`
}

// MultiStepResult 多步反应的完整结果。
type MultiStepResult struct {
	Steps []*StepResult `json:"steps"`
	// 总成本（元）= 各步总成本之和
	TotalCost float64 `json:"totalCost"`
	// 总产量（kg）= 最后一步主产物实际产量
	TotalYieldKg float64 `json:"totalYieldKg"`
	// 总单位成本（元/kg）= 总成本 ÷ 总产量
	TotalUnitCost float64 `json:"totalUnitCost"`
}
