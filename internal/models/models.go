package models

import (
	"strconv"
	"strings"
	"time"
)

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

// 数量级：报价对应的采购规模。空串表示未填写。
//
// 只是价格记录上的一个描述性字段，不参与任何换算——单位换算走 PriceToYuanPerKg，
// 与它无关。
const (
	PriceScaleKg        = "千克"
	PriceScaleTenKg     = "十千克"
	PriceScaleHundredKg = "百千克"
	PriceScaleTon       = "吨"
)

// PriceScales 数量级的全部取值（含空串），用于校验与「是否为合法枚举值」的判断。
// 空串排在首位：它表示未填写，而尚未填写的记录是历史数据里的常态。
var PriceScales = []string{"", PriceScaleKg, PriceScaleTenKg, PriceScaleHundredKg, PriceScaleTon}

// NormalizePriceScale 把数量级归一化到 PriceScales 里的取值。
//
// 空串原样返回（未填写是合法状态，不是错误）；Excel 导入时用户可能写
// 「KG」「1吨」「100千克」这类等价写法，这里把它们归到标准值。
// 完全认不出的写法原样返回，由调用方决定是报错还是忽略。
func NormalizePriceScale(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if IsPriceScale(s) {
		return s
	}
	s = strings.ToLower(strings.ReplaceAll(s, " ", ""))
	// 数字前缀先摘掉并留档：「10kg」的 10 被去掉后「kg」等于千克，
	// 但 10 本身把它抬到了十千克那一档，不能丢。
	n, unit := splitLeadingNumber(s)
	switch unit {
	case "千克", "公斤", "kg", "kgs", "kilogram", "kilograms":
		return scaleForCount(n, PriceScaleKg)
	case "十千克", "十公斤":
		return PriceScaleTenKg
	case "百千克", "百公斤":
		return PriceScaleHundredKg
	case "吨", "公吨", "t", "ton", "tons", "tonne", "tonnes":
		return scaleForCount(n, PriceScaleTon)
	}
	return s
}

// splitLeadingNumber 拆出开头连续的数字（含小数点），返回数字与其余部分。
// 没有数字前缀时返回 0 与原串。
func splitLeadingNumber(s string) (float64, string) {
	i := 0
	for i < len(s) && (s[i] == '.' || (s[i] >= '0' && s[i] <= '9')) {
		i++
	}
	if i == 0 {
		return 0, s
	}
	n, err := strconv.ParseFloat(s[:i], 64)
	if err != nil {
		return 0, s
	}
	return n, s[i:]
}

// scaleForCount 把「数字 + 基准单位」还原成数量级。
//
// 基准单位本身给出的信息要单独走一条路，不能当成倍数乘：
//   - 「吨」「百千克」自己就是一个档位，前面的数字只是写法上的赘述
//     （「1吨」= 吨，「100千克」= 百千克），没有数字时（「t」「Tonnes」）
//     同样落在该档；
//   - 只有「千克」带数字时才是真正的倍数（「10kg」= 十千克），
//     不带数字的「kg」就是千克本身。
func scaleForCount(n float64, base string) string {
	switch base {
	case PriceScaleTon:
		return PriceScaleTon
	case PriceScaleHundredKg:
		return PriceScaleHundredKg
	case PriceScaleTenKg:
		return PriceScaleTenKg
	}
	kg := n // base == PriceScaleKg
	switch {
	case kg >= 1000:
		return PriceScaleTon
	case kg >= 100:
		return PriceScaleHundredKg
	case kg >= 10:
		return PriceScaleTenKg
	default:
		return PriceScaleKg
	}
}

// IsPriceScale 判断是否为合法取值（含空串）。
func IsPriceScale(s string) bool {
	for _, v := range PriceScales {
		if s == v {
			return true
		}
	}
	return false
}

// Price 价格记录
type Price struct {
	ID         int64     `json:"id"`
	MaterialID int64     `json:"materialId"`
	Price      float64   `json:"price"`      // 价格数值（按 Unit 的单价）
	Unit       string    `json:"unit"`       // 元/g | 元/mol | 元/kg
	PriceScale string    `json:"priceScale"` // 数量级：千克 | 十千克 | 百千克 | 吨（空 = 未填）
	Supplier   string    `json:"supplier"`   // 供应商
	Date       time.Time `json:"date"`       // 日期（取最新）
	Spec       string    `json:"spec"`       // 规格
	Content    float64   `json:"content"`    // 含量(%)
	Note       string    `json:"note"`
	CreatedAt  time.Time `json:"createdAt"`
}

// 便捷视图：物料 + 当前价格（最新一条）
type MaterialWithPrice struct {
	Material
	Price      float64 `json:"price"`
	PriceUnit  string  `json:"priceUnit"`
	PriceScale string  `json:"priceScale"` // 最新一条价格的数量级
	PriceNote  string  `json:"priceNote"`  // 最新一条价格的备注
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

// PriceSnapshot 价格快照：自足的价格信息，不依赖物料库/价格库。
// 方案保存与导出都以快照为准，因此换机器、清空物料库都不影响已保存的方案。
type PriceSnapshot struct {
	UnitPriceYuanPerKg float64 `json:"unitPriceYuanPerKg"` // 单价(元/kg)，引擎直接使用（权威数值）
	Price              float64 `json:"price"`              // 原始报价值（按 Unit 计）
	Unit               string  `json:"unit"`               // 原始报价单位：元/kg | 元/g | 元/mol
	PriceScale         string  `json:"priceScale"`         // 数量级：千克 | 十千克 | 百千克 | 吨（空 = 未填）
	Supplier           string  `json:"supplier"`           // 供应商
	Date               string  `json:"date"`               // 报价日期（YYYY-MM-DD）
	Spec               string  `json:"spec"`               // 规格
}

// ReagentInput 一步反应中的一个原料（输入）
type ReagentInput struct {
	MaterialID   int64          `json:"materialId"` // 物料库中的 id；仅作可选活链接（刷新价格/跳转），不参与计算
	Inherited    bool           `json:"inherited"`  // 是否继承自上一步产物
	Name         string         `json:"name"`
	CAS          string         `json:"cas"`
	Formula      string         `json:"formula"`
	MolWeight    float64        `json:"molWeight"`
	Content      float64        `json:"content"`      // 含量(%)
	RecoveryRate float64        `json:"recoveryRate"` // 回收率(%)
	IsSubstrate  bool           `json:"isSubstrate"`  // 是否底物(基准 1 eq)
	Equiv        *float64       `json:"equiv"`        // 当量（可为空）
	AmountKg     *float64       `json:"amountKg"`     // 实际投料量(kg)（可为空）
	Price        *PriceSnapshot `json:"price"`        // 价格快照（nil = 未设置价格，成本按 0 计）
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
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Note string `json:"note"`
	// Image 方案附带的图片，存完整 dataURL（形如 data:image/png;base64,...）。
	// 保留 MIME 前缀而不是只存 base64：粘贴进来的可能是 JPEG/WebP/PNG，
	// 只留 base64 就丢了格式信息，展示时只能赌浏览器嗅探。
	// 与 steps 一样随方案持久化、随导出文件携带，因此跨机器导入图片也在。
	Image     string         `json:"image"`
	Steps     []ReactionStep `json:"steps"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}
