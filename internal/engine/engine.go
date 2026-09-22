package engine

import (
	"math"

	"github.com/dongying1997/materialcost4/internal/models"
)

// CalculateStep 计算一步反应。prevProduct 为上一步产物（多步时传入，可为 nil）。
// 注意：该函数不会修改输入 step 的内容。
func CalculateStep(step models.ReactionStep, prevProduct *IntermediateProduct) *StepResult {
	res := &StepResult{
		Reagents: make([]ReagentResult, 0, len(step.Reagents)),
		Products: make([]ProductResult, 0, len(step.Products)),
	}

	// ---- 确定底物（1 eq 基准）----
	subIdx := -1
	for i := range step.Reagents {
		if step.Reagents[i].IsSubstrate {
			subIdx = i
			break
		}
	}
	if subIdx < 0 {
		res.BlockingErrors = append(res.BlockingErrors, "请标记一个底物（1 eq 基准）")
	} else {
		sub := step.Reagents[subIdx]
		if sub.MolWeight <= 0 {
			res.BlockingErrors = append(res.BlockingErrors, "底物缺少分子量")
		} else if f64(sub.AmountKg) <= 0 {
			res.BlockingErrors = append(res.BlockingErrors, "底物投料量需大于 0")
		}
	}
	// 底物有效摩尔数 n₀ = 投料量(kg) × 含量% × 1000 ÷ 分子量
	if subIdx >= 0 && !hasBlocking(res) {
		sub := step.Reagents[subIdx]
		res.SubstrateMoles = f64(sub.AmountKg) * contentFrac(sub.Content) * 1000.0 / sub.MolWeight
		if res.SubstrateMoles <= 0 {
			res.BlockingErrors = append(res.BlockingErrors, "底物有效摩尔数计算异常")
		}
	}

	// ---- 计算各原料 ----
	for i := range step.Reagents {
		r := step.Reagents[i]
		isSub := i == subIdx
		rr := computeReagent(r, res.SubstrateMoles, isSub, res.BlockingErrors)
		res.Reagents = append(res.Reagents, rr)
		if len(rr.BlockingErrors) > 0 {
			res.BlockingErrors = append(res.BlockingErrors, rr.BlockingErrors...)
		}
		res.Warnings = append(res.Warnings, rr.Warnings...)
		res.TotalCost += rr.Cost
	}

	// ---- 计算各产物 ----
	for i := range step.Products {
		p := step.Products[i]
		pr := computeProduct(p, res.SubstrateMoles, subAmountKg(subIdx, step), subMolWeight(subIdx, step), res.TotalCost)
		if p.IsSubstrate {
			pr.IsPrimary = true
		}
		res.Products = append(res.Products, pr)
		if len(pr.BlockingErrors) > 0 {
			res.BlockingErrors = append(res.BlockingErrors, pr.BlockingErrors...)
		}
		res.Warnings = append(res.Warnings, pr.Warnings...)
	}

	// ---- 主产物（供下一步继承）----
	primaryYield := 0.0
	if !hasBlocking(res) {
		for i := range step.Products {
			if step.Products[i].IsSubstrate {
				pr := res.Products[i]
				if pr.ActualYieldKg > 0 {
					primaryYield = pr.ActualYieldKg
					res.PrimaryProduct = &IntermediateProduct{
						Name:        nameOfP(&step.Products[i]),
						MolWeight:   step.Products[i].MolWeight,
						UnitCost:    pr.UnitCost,
						ActualYield: pr.ActualYieldKg,
					}
				}
				break
			}
		}
	}

	// 各原料的单位成本 = 本原料成本 ÷ 本步主产物产量（元/kg 产物）。
	// 与产物单位成本同一分母，便于横向比较各原料对成品单位成本的贡献。
	if primaryYield > 0 {
		for i := range res.Reagents {
			res.Reagents[i].UnitCost = res.Reagents[i].Cost / primaryYield
		}
	}

	return res
}

// CalculateMultiStep 按步骤顺序计算多步反应，中间产物自动传递。
// 会为每一步注入继承原料（修改的是传入数据的副本）。
func CalculateMultiStep(steps []models.ReactionStep) *MultiStepResult {
	out := &MultiStepResult{Steps: make([]*StepResult, 0, len(steps))}
	var prev *IntermediateProduct
	for i := range steps {
		step := steps[i]
		if prev != nil {
			injectInheritedReagent(&step, prev)
		}
		sr := CalculateStep(step, prev)
		out.Steps = append(out.Steps, sr)
		if sr.PrimaryProduct != nil {
			prev = sr.PrimaryProduct
		} else {
			prev = nil
		}
	}
	// 汇总口径：全部取最后一步（见 MultiStepResult 的注释），
	// 因此这里只读最后一步，不做跨步累加。
	if n := len(out.Steps); n > 0 {
		last := out.Steps[n-1]
		out.TotalCost = last.TotalCost
		if last.PrimaryProduct != nil {
			out.TotalYieldKg = last.PrimaryProduct.ActualYield
		}
	}
	if out.TotalYieldKg > 0 {
		out.TotalUnitCost = out.TotalCost / out.TotalYieldKg
	}
	return out
}

// injectInheritedReagent 为下一步的继承原料填充上一步产物信息。
func injectInheritedReagent(step *models.ReactionStep, prev *IntermediateProduct) {
	for i := range step.Reagents {
		if step.Reagents[i].Inherited {
			r := &step.Reagents[i]
			r.MolWeight = prev.MolWeight
			r.Name = prev.Name
			// 上一步产物的单位成本即本行“单价”，以快照形式写入（引擎只认快照）
			r.Price = &models.PriceSnapshot{
				UnitPriceYuanPerKg: prev.UnitCost,
				Price:              prev.UnitCost,
				Unit:               "元/kg",
				Supplier:           "上一步产物",
			}
			return
		}
	}
}

// computeReagent 计算单个原料的成本。
func computeReagent(r models.ReagentInput, n0 float64, isSubstrate bool, stepBlocking []string) ReagentResult {
	// 单价一律取价格快照：方案自足，计算不依赖物料库/价格库。
	var rr ReagentResult
	if r.Price != nil {
		rr.UnitPrice = r.Price.UnitPriceYuanPerKg
	}

	if r.MolWeight <= 0 {
		rr.BlockingErrors = append(rr.BlockingErrors, nameOf(&r)+"：缺少分子量")
		return rr
	}

	if isSubstrate {
		rr.Equiv = 1
		rr.ActualAmountKg = f64(r.AmountKg)
		rr.TheoreticalAmountKg = rr.ActualAmountKg
		rr.Moles = rr.ActualAmountKg * contentFrac(r.Content) * 1000.0 / r.MolWeight
	} else {
		hasEquiv := r.Equiv != nil && *r.Equiv != 0
		hasAmount := f64(r.AmountKg) != 0
		if !hasEquiv && !hasAmount {
			rr.BlockingErrors = append(rr.BlockingErrors, nameOf(&r)+"：当量与投料量至少填写一个")
			return rr
		}
		if hasEquiv {
			rr.Equiv = *r.Equiv
			rr.Moles = n0 * rr.Equiv
			if contentFrac(r.Content) > 0 {
				rr.TheoreticalAmountKg = rr.Moles * r.MolWeight / (contentFrac(r.Content) * 1000.0)
			}
			rr.ActualAmountKg = f64(r.AmountKg)
			if rr.ActualAmountKg == 0 {
				rr.ActualAmountKg = rr.TheoreticalAmountKg
			}
			// 互校验：实际投料量 ↔ 当量反推理论投料量，偏差 > 1% → 警告
			if f64(r.AmountKg) != 0 && rr.TheoreticalAmountKg > 0 {
				dev := math.Abs(rr.ActualAmountKg-rr.TheoreticalAmountKg) / rr.TheoreticalAmountKg
				if dev > 0.01 {
					rr.Warnings = append(rr.Warnings, nameOf(&r)+"：实际投料量与当量推算偏差 "+pct(dev*100)+"%")
				}
			}
		} else {
			rr.ActualAmountKg = f64(r.AmountKg)
			// 有效摩尔数与底物同口径：投料量 × 含量%（含量未填视为 100%）
			rr.Moles = rr.ActualAmountKg * contentFrac(r.Content) * 1000.0 / r.MolWeight
			if n0 > 0 {
				rr.Equiv = rr.Moles / n0
			}
			rr.TheoreticalAmountKg = rr.ActualAmountKg
		}
	}

	// 成本 = 实际投料量(kg) × 单价(元/kg) × (1 - 回收率%)
	if rr.UnitPrice <= 0 {
		rr.Warnings = append(rr.Warnings, nameOf(&r)+"：缺少单价，成本按 0 计算")
	}
	rr.Cost = rr.ActualAmountKg * rr.UnitPrice * (1 - r.RecoveryRate/100.0)
	return rr
}

func computeProduct(p models.ProductInput, n0 float64, subAmountKg, subMolWeight, totalCost float64) ProductResult {
	pr := ProductResult{IsPrimary: p.IsSubstrate}

	if p.MolWeight <= 0 {
		pr.BlockingErrors = append(pr.BlockingErrors, nameOfP(&p)+"：缺少分子量")
		return pr
	}
	if n0 <= 0 || subAmountKg <= 0 || subMolWeight <= 0 {
		pr.BlockingErrors = append(pr.BlockingErrors, nameOfP(&p)+"：底物数据不足，无法计算产量")
		return pr
	}

	ratio := p.MolarRatio
	if ratio == 0 {
		ratio = 1
	}
	// 理论产量（kg）= 底物有效摩尔数 × 计量数 × 分子量 ÷ 1000
	pr.TheoreticalYieldKg = n0 * ratio * p.MolWeight / 1000.0

	hasWeight := p.WeightYield != nil && *p.WeightYield != 0
	hasMolar := p.MolarYield != nil && *p.MolarYield != 0
	hasActual := p.ActualYield != nil && *p.ActualYield != 0

	if !hasWeight && !hasMolar && !hasActual {
		pr.BlockingErrors = append(pr.BlockingErrors, nameOfP(&p)+"：摩尔收率、重量收率、实际产量至少填写一个")
		return pr
	}

	weightFromActual := func(actual float64) float64 { return actual / subAmountKg * 100.0 }
	molarFromActual := func(actual float64) float64 { return (actual / p.MolWeight) / (subAmountKg / subMolWeight) * 100.0 }
	actualFromWeight := func(w float64) float64 { return subAmountKg * w / 100.0 }
	actualFromMolar := func(m float64) float64 { return (subAmountKg / subMolWeight) * m / 100.0 * p.MolWeight }

	if hasActual {
		pr.ActualYieldKg = *p.ActualYield
		if !hasWeight {
			pr.WeightYield = weightFromActual(pr.ActualYieldKg)
		} else {
			pr.WeightYield = *p.WeightYield
		}
		if !hasMolar {
			pr.MolarYield = molarFromActual(pr.ActualYieldKg)
		} else {
			pr.MolarYield = *p.MolarYield
		}
	} else if hasWeight {
		pr.WeightYield = *p.WeightYield
		pr.ActualYieldKg = actualFromWeight(*p.WeightYield)
		if !hasMolar {
			pr.MolarYield = molarFromActual(pr.ActualYieldKg)
		} else {
			pr.MolarYield = *p.MolarYield
		}
	} else {
		pr.MolarYield = *p.MolarYield
		pr.ActualYieldKg = actualFromMolar(*p.MolarYield)
		pr.WeightYield = weightFromActual(pr.ActualYieldKg)
	}

	// 互校验（警告不阻塞）
	if hasActual && hasWeight {
		derived := weightFromActual(*p.ActualYield)
		if math.Abs(derived-*p.WeightYield) > 1.0 {
			pr.Warnings = append(pr.Warnings, nameOfP(&p)+"：实际产量与重量收率不一致")
		}
	}
	if hasActual && hasMolar {
		derived := molarFromActual(*p.ActualYield)
		if math.Abs(derived-*p.MolarYield) > 1.0 {
			pr.Warnings = append(pr.Warnings, nameOfP(&p)+"：实际产量与摩尔收率不一致")
		}
	}
	if hasWeight && hasMolar {
		// 摩尔收率 = 重量收率 × 底物分子量 ÷ 产物分子量（若计量数≠1 还需乘计量数）
		derived := *p.WeightYield * subMolWeight / p.MolWeight * ratio
		if math.Abs(derived-*p.MolarYield) > 1.0 {
			pr.Warnings = append(pr.Warnings, nameOfP(&p)+"：摩尔收率与重量收率不一致（考虑分子量）")
		}
	}

	if pr.ActualYieldKg > 0 {
		pr.UnitCost = totalCost / pr.ActualYieldKg
	}
	return pr
}

// ---- 工具函数 ----

func hasBlocking(r *StepResult) bool { return len(r.BlockingErrors) > 0 }

func f64(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}

func contentFrac(c float64) float64 {
	if c <= 0 {
		return 1.0 // 含量未填视为 100%
	}
	return c / 100.0
}

func subAmountKg(idx int, step models.ReactionStep) float64 {
	if idx < 0 {
		return 0
	}
	return f64(step.Reagents[idx].AmountKg)
}

func subMolWeight(idx int, step models.ReactionStep) float64 {
	if idx < 0 {
		return 0
	}
	return step.Reagents[idx].MolWeight
}

func nameOf(r *models.ReagentInput) string {
	if r.Name != "" {
		return r.Name
	}
	return "原料"
}

func nameOfP(p *models.ProductInput) string {
	if p.Name != "" {
		return p.Name
	}
	return "产物"
}
