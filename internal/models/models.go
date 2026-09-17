package models

import "time"

// Material 物料（化合物）
type Material struct {
	ID           int64     `json:"id"`
	Code         string    `json:"code"` // 编码
	Name         string    `json:"name"`
	CAS          string    `json:"cas"`
	Formula      string    `json:"formula"`      // 化学式
	MolWeight    float64   `json:"molWeight"`    // 分子量
	Content      float64   `json:"content"`      // 含量(%)
	RecoveryRate float64   `json:"recoveryRate"` // 回收率(%)
	Note         string    `json:"note"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// Price 价格记录
type Price struct {
	ID         int64     `json:"id"`
	MaterialID int64     `json:"materialId"`
	Price      float64   `json:"price"`    // 价格数值（按 Unit 的单价）
	Unit       string    `json:"unit"`     // 元/g | 元/mol | 元/kg
	Supplier   string    `json:"supplier"` // 供应商
	Date       time.Time `json:"date"`     // 日期（取最新）
	Spec       string    `json:"spec"`     // 规格
	Content    float64   `json:"content"`  // 含量(%)
	Note       string    `json:"note"`
	CreatedAt  time.Time `json:"createdAt"`
}

// 便捷视图：物料 + 当前价格（最新一条）
type MaterialWithPrice struct {
	Material
	Price      float64 `json:"price"`
	PriceUnit  string  `json:"priceUnit"`
	Supplier   string  `json:"supplier"`
	PriceDate  string  `json:"priceDate"`
	PriceCount int     `json:"priceCount"`
}

// ReactionStep 反应方案中的一步
type ReactionStep struct {
	ID       int64          `json:"id"`
	StepNum  int            `json:"stepNum"`
	Name     string         `json:"name"` // 步骤名称（可选）
	Reagents []ReagentInput `json:"reagents"`
	Products []ProductInput `json:"products"`
}

// ReagentInput 一步反应中的一个原料（输入）
type ReagentInput struct {
	MaterialID         int64    `json:"materialId"` // 0 表示继承的中间产物
	Inherited          bool     `json:"inherited"`  // 是否继承自上一步产物
	Name               string   `json:"name"`
	CAS                string   `json:"cas"`
	Formula            string   `json:"formula"`
	MolWeight          float64  `json:"molWeight"`
	Content            float64  `json:"content"`            // 含量(%)
	RecoveryRate       float64  `json:"recoveryRate"`       // 回收率(%)
	IsSubstrate        bool     `json:"isSubstrate"`        // 是否底物(基准 1 eq)
	Equiv              *float64 `json:"equiv"`              // 当量（可为空）
	AmountKg           *float64 `json:"amountKg"`           // 实际投料量(kg)（可为空）
	UnitPriceYuanPerKg *float64 `json:"unitPriceYuanPerKg"` // 单价(元/kg)（可为空，多价格时由前端选择）
	PriceSourceID      int64    `json:"priceSourceId"`      // 选中的价格记录 id（0 自动取最新）
}

// ProductInput 一步反应中的一个产物
type ProductInput struct {
	MaterialID  int64    `json:"materialId"`
	Inherited   bool     `json:"inherited"`
	Name        string   `json:"name"`
	CAS         string   `json:"cas"`
	Formula     string   `json:"formula"`
	MolWeight   float64  `json:"molWeight"`
	IsSubstrate bool     `json:"isSubstrate"` // 标记主产物
	MolarRatio  float64  `json:"molarRatio"`  // 计量数
	WeightYield *float64 `json:"weightYield"` // 重量收率(%)
	MolarYield  *float64 `json:"molarYield"`  // 摩尔收率(%)
	ActualYield *float64 `json:"actualYield"` // 实际产量(kg)
}

// Scheme 方案
type Scheme struct {
	ID        int64          `json:"id"`
	Name      string         `json:"name"`
	Note      string         `json:"note"`
	Steps     []ReactionStep `json:"steps"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}
