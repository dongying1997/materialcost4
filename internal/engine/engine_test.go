package engine

import (
	"math"
	"strings"
	"testing"

	"materialcost4/internal/models"
)

func f(v float64) *float64 { return &v }

func approx(a, b, tol float64) bool { return math.Abs(a-b) <= tol }

func TestSingleStepBasic(t *testing.T) {
	// 底物 A：投料 1 kg，含量 98%，分子量 100
	// 试剂 B：当量 1.5，分子量 50，含量 99%，单价 100 元/kg
	// 产物 P：分子量 150，重量收率 80%
	reagents := []models.ReagentInput{
		{Name: "A", MolWeight: 100, Content: 98, RecoveryRate: 0, IsSubstrate: true, AmountKg: f(1)},
		{Name: "B", MolWeight: 50, Content: 99, RecoveryRate: 5, IsSubstrate: false, Equiv: f(1.5), UnitPriceYuanPerKg: f(100)},
	}
	products := []models.ProductInput{
		{Name: "P", MolWeight: 150, IsSubstrate: true, WeightYield: f(80)},
	}
	step := models.ReactionStep{Reagents: reagents, Products: products}
	res := CalculateStep(step, nil)

	if len(res.BlockingErrors) != 0 {
		t.Fatalf("unexpected blocking errors: %v", res.BlockingErrors)
	}
	// n0 = 1 * 0.98 * 1000 / 100 = 9.8 mol
	if !approx(res.SubstrateMoles, 9.8, 1e-9) {
		t.Errorf("substrate moles = %v, want 9.8", res.SubstrateMoles)
	}
	// B moles = 9.8 * 1.5 = 14.7 mol
	rb := res.Reagents[1]
	if !approx(rb.Moles, 14.7, 1e-9) {
		t.Errorf("B moles = %v, want 14.7", rb.Moles)
	}
	// B theoretical amount = 14.7 * 50 / (0.99*1000) = 0.7424 kg
	if !approx(rb.TheoreticalAmountKg, 0.742424, 1e-3) {
		t.Errorf("B theoretical = %v", rb.TheoreticalAmountKg)
	}
	// B cost = 0.742424 * 100 * (1-0.05) = 70.53
	if !approx(rb.Cost, 70.5303, 1e-2) {
		t.Errorf("B cost = %v", rb.Cost)
	}
	// A cost = 1kg * 0 (no price) = 0，但有警告
	if len(res.Reagents[0].Warnings) == 0 {
		t.Errorf("A should warn missing price")
	}
	// total cost ≈ 70.53
	if !approx(res.TotalCost, 70.5303, 1e-2) {
		t.Errorf("total cost = %v", res.TotalCost)
	}
	// 理论产量 = 9.8 * 150 / 1000 = 1.47 kg
	pp := res.Products[0]
	if !approx(pp.TheoreticalYieldKg, 1.47, 1e-9) {
		t.Errorf("theoretical yield = %v, want 1.47", pp.TheoreticalYieldKg)
	}
	// 实际产量 = 1 * 0.8 = 0.8 kg
	if !approx(pp.ActualYieldKg, 0.8, 1e-9) {
		t.Errorf("actual yield = %v, want 0.8", pp.ActualYieldKg)
	}
	// 单位成本 = 70.5303 / 0.8 = 88.16
	if !approx(pp.UnitCost, 88.1629, 1e-2) {
		t.Errorf("unit cost = %v, want 88.16", pp.UnitCost)
	}
	// 主产物
	if res.PrimaryProduct == nil || !approx(res.PrimaryProduct.UnitCost, 88.1629, 1e-2) {
		t.Errorf("primary product not set correctly: %+v", res.PrimaryProduct)
	}
}

func TestBlockingWhenNoEquivNoAmount(t *testing.T) {
	reagents := []models.ReagentInput{
		{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1)},
		{Name: "B", MolWeight: 50, Content: 100}, // 既无当量也无投料量
	}
	products := []models.ProductInput{
		{Name: "P", MolWeight: 150, IsSubstrate: true, WeightYield: f(80)},
	}
	res := CalculateStep(models.ReactionStep{Reagents: reagents, Products: products}, nil)
	if !containsStr(res.BlockingErrors, "当量与投料量") {
		t.Errorf("expected blocking error about equiv/amount, got %v", res.BlockingErrors)
	}
}

func TestProductYieldInterpolation(t *testing.T) {
	// 用实际产量推算重量收率与摩尔收率
	reagents := []models.ReagentInput{
		{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1)},
	}
	products := []models.ProductInput{
		{Name: "P", MolWeight: 150, IsSubstrate: true, ActualYield: f(0.9)},
	}
	res := CalculateStep(models.ReactionStep{Reagents: reagents, Products: products}, nil)
	pp := res.Products[0]
	// 重量收率 = 0.9/1 = 90%
	if !approx(pp.WeightYield, 90, 1e-9) {
		t.Errorf("weight yield = %v, want 90", pp.WeightYield)
	}
	// 摩尔收率 = (0.9/150)/(1/100) = 0.6 = 60%
	if !approx(pp.MolarYield, 60, 1e-9) {
		t.Errorf("molar yield = %v, want 60", pp.MolarYield)
	}
}

func TestMultiStepInheritance(t *testing.T) {
	// 第一步：A → I，I 为主产物
	step1 := models.ReactionStep{
		Reagents: []models.ReagentInput{
			{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1), UnitPriceYuanPerKg: f(10)},
		},
		Products: []models.ProductInput{
			{Name: "I", MolWeight: 120, IsSubstrate: true, WeightYield: f(50)},
		},
	}
	// 第二步：I（继承）→ P
	step2 := models.ReactionStep{
		Reagents: []models.ReagentInput{
			{Name: "I(继承)", Inherited: true, IsSubstrate: true, AmountKg: f(0.4)},
			{Name: "C", MolWeight: 200, Content: 100, IsSubstrate: false, Equiv: f(2), UnitPriceYuanPerKg: f(5)},
		},
		Products: []models.ProductInput{
			{Name: "P", MolWeight: 200, IsSubstrate: true, WeightYield: f(60)},
		},
	}
	res := CalculateMultiStep([]models.ReactionStep{step1, step2})

	if len(res.Steps) != 2 {
		t.Fatalf("want 2 steps, got %d", len(res.Steps))
	}
	s1 := res.Steps[0]
	// 第一步总成本 = 1 * 10 = 10 元
	if !approx(s1.TotalCost, 10, 1e-9) {
		t.Errorf("step1 cost = %v, want 10", s1.TotalCost)
	}
	// 第一步产物实际产量 = 1 * 0.5 = 0.5 kg
	if !approx(s1.Products[0].ActualYieldKg, 0.5, 1e-9) {
		t.Errorf("step1 actual yield = %v", s1.Products[0].ActualYieldKg)
	}
	// 第一步产物单位成本 = 10 / 0.5 = 20 元/kg
	if !approx(s1.Products[0].UnitCost, 20, 1e-9) {
		t.Errorf("step1 unit cost = %v, want 20", s1.Products[0].UnitCost)
	}

	s2 := res.Steps[2-1]
	// 第二步继承原料 I：单价 = 20（上一步单位成本），分子量 = 120
	inherited := s2.Reagents[0]
	if !approx(inherited.UnitPrice, 20, 1e-9) {
		t.Errorf("inherited unit price = %v, want 20", inherited.UnitPrice)
	}
	// 继承原料成本 = 0.4 * 20 = 8
	if !approx(inherited.Cost, 8, 1e-9) {
		t.Errorf("inherited cost = %v, want 8", inherited.Cost)
	}
	// C 成本：n0 = 0.4*1000/120 = 3.333 mol，C moles = 6.667，理论投料 = 6.667*200/1000=1.333 kg
	// cost = 1.333*5 = 6.667
	if !approx(s2.Reagents[1].Cost, 6.6667, 1e-2) {
		t.Errorf("C cost = %v", s2.Reagents[1].Cost)
	}
	// 总成本 = 10 + 8 + 6.667 = 24.667
	if !approx(res.TotalCost, 24.6667, 1e-2) {
		t.Errorf("total cost = %v, want 24.667", res.TotalCost)
	}
	// 最后一步主产物产量 = 0.4 * 0.6 = 0.24 kg
	if !approx(res.TotalYieldKg, 0.24, 1e-9) {
		t.Errorf("total yield = %v, want 0.24", res.TotalYieldKg)
	}
	// 总单位成本 = 24.667 / 0.24 = 102.78
	if !approx(res.TotalUnitCost, 102.778, 1e-2) {
		t.Errorf("total unit cost = %v", res.TotalUnitCost)
	}
}

func containsStr(s []string, sub string) bool {
	for _, v := range s {
		if strings.Contains(v, sub) {
			return true
		}
	}
	return false
}
