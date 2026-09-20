package engine

import (
	"math"
	"strings"
	"testing"

	"github.com/dongying1997/materialcost4/internal/models"
)

func f(v float64) *float64 { return &v }

func approx(a, b, tol float64) bool { return math.Abs(a-b) <= tol }

func TestSingleStepBasic(t *testing.T) {
	// 底物 A：投料 1 kg，含量 98%，分子量 100
	// 试剂 B：当量 1.5，分子量 50，含量 99%，单价 100 元/kg
	// 产物 P：分子量 150，重量收率 80%
	reagents := []models.ReagentInput{
		{Name: "A", MolWeight: 100, Content: 98, RecoveryRate: 0, IsSubstrate: true, AmountKg: f(1)},
		{Name: "B", MolWeight: 50, Content: 99, RecoveryRate: 5, IsSubstrate: false, Equiv: f(1.5), Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 100}},
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

// TestReagentUnitCost 原料「单位成本」= 本原料成本 ÷ 本步主产物产量（元/kg 产物）。
func TestReagentUnitCost(t *testing.T) {
	// 底物 A 1kg（分子量 100，含量 100）→ n0 = 10 mol
	// 试剂 B 当量 1，单价 50 元/kg，分子量 100，含量 100% → 投料 1kg → 成本 50 元
	// 产物 P 分子量 200，重量收率 50% → 实际产量 = 1kg × 50% = 0.5 kg
	reagents := []models.ReagentInput{
		{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1)},
		{Name: "B", MolWeight: 100, Content: 100, Equiv: f(1), Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 50}},
	}
	products := []models.ProductInput{
		{Name: "P", MolWeight: 200, IsSubstrate: true, WeightYield: f(50)},
	}
	res := CalculateStep(models.ReactionStep{Reagents: reagents, Products: products}, nil)
	if len(res.BlockingErrors) != 0 {
		t.Fatalf("unexpected blocking errors: %v", res.BlockingErrors)
	}

	yield := res.Products[0].ActualYieldKg
	if !approx(yield, 0.5, 1e-9) {
		t.Fatalf("主产物产量 = %v, want 0.5", yield)
	}

	// 每个原料的单位成本都应等于 该原料成本 ÷ 主产物产量
	for i, r := range res.Reagents {
		want := r.Cost / yield
		if !approx(r.UnitCost, want, 1e-9) {
			t.Errorf("原料 %d 单位成本 = %v, want %v（成本 %v ÷ 产量 %v）",
				i, r.UnitCost, want, r.Cost, yield)
		}
	}
	// 具体值：B 成本 50 元 ÷ 0.5 kg = 100 元/kg
	if !approx(res.Reagents[1].UnitCost, 100, 1e-9) {
		t.Errorf("B 单位成本 = %v, want 100", res.Reagents[1].UnitCost)
	}

	// 与产物单位成本同一分母：各原料单位成本之和 = 步骤单位成本
	if !approx(res.Reagents[0].UnitCost+res.Reagents[1].UnitCost, res.Products[0].UnitCost, 1e-9) {
		t.Errorf("原料单位成本之和 %v ≠ 产物单位成本 %v",
			res.Reagents[0].UnitCost+res.Reagents[1].UnitCost, res.Products[0].UnitCost)
	}
}

// TestReagentUnitCostWithoutPrimaryYield 无主产物/产量为 0 时单位成本为 0，不产生 Inf/NaN。
func TestReagentUnitCostWithoutPrimaryYield(t *testing.T) {
	reagents := []models.ReagentInput{
		{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1),
			Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10}},
	}
	// 没有产物 → 无产量
	res := CalculateStep(models.ReactionStep{Reagents: reagents, Products: []models.ProductInput{}}, nil)
	if len(res.Reagents) != 1 {
		t.Fatalf("reagents = %d", len(res.Reagents))
	}
	u := res.Reagents[0].UnitCost
	if math.IsNaN(u) || math.IsInf(u, 0) {
		t.Errorf("单位成本应为 0 而不是 %v", u)
	}
	if u != 0 {
		t.Errorf("无主产物时单位成本 = %v, want 0", u)
	}
	// 成本本身仍然可算
	if res.Reagents[0].Cost != 10 {
		t.Errorf("成本 = %v, want 10", res.Reagents[0].Cost)
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
			{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1), Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10}},
		},
		Products: []models.ProductInput{
			{Name: "I", MolWeight: 120, IsSubstrate: true, WeightYield: f(50)},
		},
	}
	// 第二步：I（继承）→ P
	step2 := models.ReactionStep{
		Reagents: []models.ReagentInput{
			{Name: "I(继承)", Inherited: true, IsSubstrate: true, AmountKg: f(0.4)},
			{Name: "C", MolWeight: 200, Content: 100, IsSubstrate: false, Equiv: f(2), Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 5}},
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

// TestEquivBackfilledFromAmount 只填实际投料量时，结果里带出反推的当量。
// 前端「重新计算」按钮用这个 equiv 回填当量输入框（unit-price-canonical-unit 同源的“回填”能力）。
func TestEquivBackfilledFromAmount(t *testing.T) {
	// 底物 A：1 kg，分子量 100，含量 100 → n0 = 10 mol
	// 试剂 B：只填投料量 0.75 kg，分子量 50 → 有效摩尔 15 mol → 1.5 eq
	reagents := []models.ReagentInput{
		{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1)},
		{Name: "B", MolWeight: 50, AmountKg: f(0.75),
			Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10}},
	}
	products := []models.ProductInput{
		{Name: "P", MolWeight: 150, IsSubstrate: true, WeightYield: f(80)},
	}
	res := CalculateStep(models.ReactionStep{Reagents: reagents, Products: products}, nil)
	if len(res.BlockingErrors) != 0 {
		t.Fatalf("unexpected blocking errors: %v", res.BlockingErrors)
	}
	if !approx(res.Reagents[1].Equiv, 1.5, 1e-9) {
		t.Errorf("B 当量 = %v, want 1.5", res.Reagents[1].Equiv)
	}
	// 回填值本身自洽：不该再出现“实际投料量与当量推算偏差”告警
	for _, w := range res.Reagents[1].Warnings {
		if strings.Contains(w, "投料量与当量推算偏差") {
			t.Errorf("反推当量后不应再告警，got %v", w)
		}
	}
	// 底物固定 1 eq，不需要回填
	if !approx(res.Reagents[0].Equiv, 1, 1e-9) {
		t.Errorf("底物当量 = %v, want 1", res.Reagents[0].Equiv)
	}
}

// TestEquivFromAmountUsesContent 只填投料量时，反推的有效摩尔数与当量同样要折含量，
// 与底物分支（:38）同口径：投料量 × 含量% ÷ 分子量。
func TestEquivFromAmountUsesContent(t *testing.T) {
	// 底物 A：0.5 kg，分子量 100，含量 80% → n0 = 4 mol
	// 试剂 B：2 kg，分子量 100，含量 50% → 有效摩尔 = 2 × 0.5 × 1000 / 100 = 10 mol → 2.5 eq
	reagents := []models.ReagentInput{
		{Name: "A", MolWeight: 100, Content: 80, IsSubstrate: true, AmountKg: f(0.5)},
		{Name: "B", MolWeight: 100, Content: 50, AmountKg: f(2),
			Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10}},
	}
	products := []models.ProductInput{
		{Name: "P", MolWeight: 150, IsSubstrate: true, WeightYield: f(80)},
	}
	res := CalculateStep(models.ReactionStep{Reagents: reagents, Products: products}, nil)
	if len(res.BlockingErrors) != 0 {
		t.Fatalf("unexpected blocking errors: %v", res.BlockingErrors)
	}
	if !approx(res.Reagents[1].Moles, 10, 1e-9) {
		t.Errorf("B 有效摩尔数 = %v, want 10（2 kg 折半后除以 100 g/mol）", res.Reagents[1].Moles)
	}
	if !approx(res.Reagents[1].Equiv, 2.5, 1e-9) {
		t.Errorf("B 当量 = %v, want 2.5（10 mol ÷ 4 mol）", res.Reagents[1].Equiv)
	}
	// 反推出来的当量配同样的投料量应自洽：不折算会得到 5 eq，再配投料量就会误报偏差
	if !approx(res.Reagents[1].TheoreticalAmountKg, 2, 1e-9) {
		t.Errorf("B 理论投料量 = %v, want 2（回填投料量时用它）", res.Reagents[1].TheoreticalAmountKg)
	}
}

// TestEquivBackfilledUsesContentWhenEquivGiven 对照组：由当量推算投料量时含量参与计算（理论投料量）。
func TestEquivBackfilledUsesContentWhenEquivGiven(t *testing.T) {
	reagents := []models.ReagentInput{
		{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1)}, // n0 = 10 mol
		{Name: "B", MolWeight: 50, Content: 50, Equiv: f(1),                          // 10 mol → 纯品 0.5 kg，折 50% 需 1 kg
			Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10}},
	}
	products := []models.ProductInput{
		{Name: "P", MolWeight: 150, IsSubstrate: true, WeightYield: f(80)},
	}
	res := CalculateStep(models.ReactionStep{Reagents: reagents, Products: products}, nil)
	if len(res.BlockingErrors) != 0 {
		t.Fatalf("unexpected blocking errors: %v", res.BlockingErrors)
	}
	if !approx(res.Reagents[1].TheoreticalAmountKg, 1, 1e-9) {
		t.Errorf("B 理论投料量 = %v, want 1", res.Reagents[1].TheoreticalAmountKg)
	}
}
