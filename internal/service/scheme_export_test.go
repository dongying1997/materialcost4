package service

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/dongying1997/materialcost4/internal/db"
	"github.com/dongying1997/materialcost4/internal/models"
)

func newSchemeSvc(t *testing.T) (*ReactionService, *db.SchemeRepo) {
	t.Helper()
	d := newTestDB(t)
	repo := db.NewSchemeRepo(d)
	svc := NewReactionService(db.NewMaterialRepo(d), repo)
	return svc, repo
}

func sampleScheme(id int64, name string) *models.Scheme {
	return &models.Scheme{
		ID:    id,
		Name:  name,
		Note:  "测试方案",
		Steps: []models.ReactionStep{},
	}
}

// TestSchemeExportImport 导出与导入往返一致性测试。
func TestSchemeExportImport(t *testing.T) {
	svc, repo := newSchemeSvc(t)

	// 准备两个方案
	id1, err := repo.Insert(sampleScheme(0, "方案一"))
	if err != nil {
		t.Fatal(err)
	}
	id2, err := repo.Insert(sampleScheme(0, "方案二"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Insert(sampleScheme(0, "方案三")); err != nil {
		t.Fatal(err)
	}

	// 导出选中两个
	export, err := svc.ExportSchemes([]int64{id1, id2})
	if err != nil {
		t.Fatal(err)
	}
	if len(export.Schemes) != 2 {
		t.Fatalf("导出方案数 = %d, want 2", len(export.Schemes))
	}
	if export.Version != schemeExportVersion || export.App != "MaterialCost4" || export.ExportedAt == "" {
		t.Errorf("导出文件元信息不正确: %+v", export)
	}

	// 导出全部
	exportAll, err := svc.ExportSchemes(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(exportAll.Schemes) != 3 {
		t.Fatalf("导出全部方案数 = %d, want 3", len(exportAll.Schemes))
	}
}

// TestImportSchemes 只接受自足的新格式（v2）；旧数组格式不再兼容。
func TestImportSchemes(t *testing.T) {
	svc, repo := newSchemeSvc(t)

	// v2 包裹格式（含一行会因缺名称被跳过）
	wrapped := []byte(`{
		"version":2,"app":"MaterialCost4","exportedAt":"2026-08-26 10:00:00",
		"schemes":[{"name":"B","note":"","steps":[]},{"name":"","note":"无名称应跳过","steps":[]}]
	}`)
	res, err := svc.ImportSchemes(wrapped)
	if err != nil {
		t.Fatalf("导入 v2 格式失败: %v", err)
	}
	if res.Imported != 1 || len(res.Errors) != 1 {
		t.Errorf("v2 导入结果 = %+v, want 1 imported / 1 error", res)
	}

	// 旧数组格式已不再兼容 → 明确报错，而不是静默导入半截数据
	arr := []byte(`[{"name":"A","note":"","steps":[]}]`)
	if _, err := svc.ImportSchemes(arr); err == nil {
		t.Error("旧数组格式应被拒绝")
	}

	// 无效 JSON
	if _, err := svc.ImportSchemes([]byte(`{invalid`)); err == nil {
		t.Error("无效 JSON 应返回错误")
	}

	// 空方案列表
	res3, err := svc.ImportSchemes([]byte(`{"version":2,"app":"MaterialCost4","schemes":[]}`))
	if err != nil || res3.Imported != 0 {
		t.Errorf("空列表导入 = %+v, %v; want 0 imported", res3, err)
	}

	// 验证新方案 id 均重新分配（不覆盖原记录）
	list, err := repo.List()
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, s := range list {
		names[s.Name] = true
	}
	if !names["B"] {
		t.Errorf("导入的方案不在列表中: %v", names)
	}
}

// TestExportStripsLibraryIDs 导出必须剥离本地库 id，否则跨机器会错指到别的物料。
func TestExportStripsLibraryIDs(t *testing.T) {
	svc, repo := newSchemeSvc(t)

	sch := sampleScheme(0, "带引用的方案")
	sch.Steps = []models.ReactionStep{{
		StepNum: 1,
		Reagents: []models.ReagentInput{{
			MaterialID: 763, Name: "甲醇", CAS: "67-56-1", MolWeight: 32.04, Content: 99.5,
			IsSubstrate: true, AmountKg: f(1),
			Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 3.5, Price: 3.5, Unit: "元/kg", Supplier: "A公司", Date: "2024-08-26"},
		}},
		Products: []models.ProductInput{{MaterialID: 973, Name: "P", MolWeight: 46.07, WeightYield: f(80)}},
	}}
	id, err := repo.Insert(sch)
	if err != nil {
		t.Fatal(err)
	}

	export, err := svc.ExportSchemes([]int64{id})
	if err != nil {
		t.Fatal(err)
	}
	got := export.Schemes[0].Steps[0]
	if got.Reagents[0].MaterialID != 0 || got.Products[0].MaterialID != 0 {
		t.Errorf("导出未剥离本地 id: reagent=%d product=%d",
			got.Reagents[0].MaterialID, got.Products[0].MaterialID)
	}
	// 业务快照必须保留
	r := got.Reagents[0]
	if r.Name != "甲醇" || r.CAS != "67-56-1" || r.MolWeight != 32.04 {
		t.Errorf("导出丢失物料快照: %+v", r)
	}
	if r.Price == nil || r.Price.UnitPriceYuanPerKg != 3.5 || r.Price.Supplier != "A公司" {
		t.Errorf("导出丢失价格快照: %+v", r.Price)
	}
	// 导出不得改动库中原方案里的 id
	stored, err := repo.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Steps[0].Reagents[0].MaterialID != 763 {
		t.Errorf("导出不应修改原方案: %d", stored.Steps[0].Reagents[0].MaterialID)
	}
}

// TestImportRoundTripIsSelfContained 导出→导入后仍是自足的，且计算不依赖物料库。
func TestImportRoundTripIsSelfContained(t *testing.T) {
	svc, repo := newSchemeSvc(t)

	sch := sampleScheme(0, "跨机器方案")
	sch.Steps = []models.ReactionStep{{
		StepNum: 1,
		Reagents: []models.ReagentInput{{
			MaterialID: 763, Name: "甲醇", CAS: "67-56-1", MolWeight: 32.04, Content: 99.5,
			IsSubstrate: true, AmountKg: f(1),
			Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10},
		}},
		Products: []models.ProductInput{{Name: "P", MolWeight: 46.07, WeightYield: f(80)}},
	}}
	if _, err := repo.Insert(sch); err != nil {
		t.Fatal(err)
	}

	export, err := svc.ExportSchemes(nil)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(export)
	if err != nil {
		t.Fatal(err)
	}
	res, err := svc.ImportSchemes(data)
	if err != nil || res.Imported != 1 {
		t.Fatalf("导入失败: %+v %v", res, err)
	}

	// 导入后的方案：materialId 已清空，但可直接计算
	list, err := repo.List()
	if err != nil {
		t.Fatal(err)
	}
	var imported *models.Scheme
	for _, s := range list {
		if s.Name == "跨机器方案" {
			imported = s
		}
	}
	if imported == nil {
		t.Fatal("未找到导入的方案")
	}
	if imported.Steps[0].Reagents[0].MaterialID != 0 {
		t.Errorf("导入应清空 materialId: %d", imported.Steps[0].Reagents[0].MaterialID)
	}
	calc, err := svc.Calculate(CalculateInput{Steps: imported.Steps})
	if err != nil {
		t.Fatalf("导入后计算失败: %v", err)
	}
	if len(calc.Steps[0].BlockingErrors) != 0 {
		t.Errorf("导入后不应有阻塞错误: %v", calc.Steps[0].BlockingErrors)
	}
	if calc.Steps[0].TotalCost != 10 {
		t.Errorf("导入后总成本 = %v, want 10（应完全来自文件内的快照）", calc.Steps[0].TotalCost)
	}
}

// TestCrossMachineSimulation 模拟跨机器：在 A 库导出方案，把物料库清空（等价于
// 目标机器没有这些物料），再导入并计算。方案自带全部数据，因此结果必须完全一致。
func TestCrossMachineSimulation(t *testing.T) {
	d := newTestDB(t)
	mrepo := db.NewMaterialRepo(d)
	schemeRepo := db.NewSchemeRepo(d)
	svc := NewReactionService(mrepo, schemeRepo)

	// A 库：物料 + 两条价格
	id, err := mrepo.Insert(&models.Material{Name: "甲磺酸", CAS: "75-75-2", MolWeight: 96.11, Content: 100})
	if err != nil {
		t.Fatal(err)
	}
	day := time.Date(2024, 6, 24, 0, 0, 0, 0, time.Local)
	for _, p := range []float64{40, 45} {
		if _, err := mrepo.InsertPrice(&models.Price{MaterialID: id, Price: p, Unit: "元/kg", Date: day}); err != nil {
			t.Fatal(err)
		}
	}

	sch := sampleScheme(0, "跨机器方案")
	sch.Steps = []models.ReactionStep{{
		StepNum: 1,
		Reagents: []models.ReagentInput{{
			MaterialID: id, Name: "甲磺酸", CAS: "75-75-2", MolWeight: 96.11, Content: 100,
			IsSubstrate: true, AmountKg: f(1),
			Price: &models.PriceSnapshot{
				UnitPriceYuanPerKg: 25, Price: 25, Unit: "元/kg",
				Supplier: "旧供应商", Date: "2024-01-01",
			},
		}},
		Products: []models.ProductInput{{Name: "P", MolWeight: 200, WeightYield: f(90)}},
	}}
	schemeID, err := schemeRepo.Insert(sch)
	if err != nil {
		t.Fatal(err)
	}

	// 导出
	export, err := svc.ExportSchemes(nil)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(export)
	if err != nil {
		t.Fatal(err)
	}

	// 拿走文件后，把 B 机器的物料库清空（连价格一起）
	if _, err := mrepo.ClearAll(); err != nil {
		t.Fatal(err)
	}
	if err := schemeRepo.Delete(schemeID); err != nil {
		t.Fatal(err)
	}

	// B 机器导入并计算
	res, err := svc.ImportSchemes(data)
	if err != nil || res.Imported != 1 {
		t.Fatalf("导入失败: %+v %v", res, err)
	}
	list, err := schemeRepo.List()
	if err != nil || len(list) != 1 {
		t.Fatalf("导入后方案数 = %d, %v", len(list), err)
	}
	calc, err := svc.Calculate(CalculateInput{Steps: list[0].Steps})
	if err != nil {
		t.Fatalf("计算失败: %v", err)
	}
	if n := len(calc.Steps[0].BlockingErrors); n != 0 {
		t.Errorf("不应有阻塞错误: %v", calc.Steps[0].BlockingErrors)
	}
	// 成本完全来自文件内的快照：1kg × 25 元/kg = 25（而非库里的 40/45）
	if calc.Steps[0].TotalCost != 25 {
		t.Errorf("总成本 = %v, want 25（应完全来自导出的价格快照）", calc.Steps[0].TotalCost)
	}
	// 价格来源信息也应随文件带过去
	got := list[0].Steps[0].Reagents[0].Price
	if got == nil || got.Supplier != "旧供应商" || got.Date != "2024-01-01" {
		t.Errorf("价格快照的供应商/日期丢失: %+v", got)
	}
}
