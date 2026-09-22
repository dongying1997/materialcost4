package service

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/dongying1997/materialcost4/internal/db"
	"github.com/dongying1997/materialcost4/internal/engine"
	"github.com/dongying1997/materialcost4/internal/models"
)

func newSchemeSvc(t *testing.T) (*SchemeService, *db.SchemeRepo) {
	t.Helper()
	d := newTestDB(t)
	repo := db.NewSchemeRepo(d)
	svc := NewSchemeService(repo)
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

// TestSchemeSaveLoad 方案保存与读取往返。
func TestSchemeSaveLoad(t *testing.T) {
	svc, _ := newSchemeSvc(t)

	steps := []models.ReactionStep{
		{
			StepNum: 1, Name: "第一步",
			Reagents: []models.ReagentInput{
				{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1)},
			},
			Products: []models.ProductInput{
				{Name: "P", MolWeight: 150, IsSubstrate: true, WeightYield: f(80)},
			},
		},
	}
	sch := &models.Scheme{Name: "测试方案", Steps: steps}
	saved, err := svc.SaveScheme(sch)
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID == 0 {
		t.Fatal("scheme id not set")
	}
	loaded, err := svc.GetScheme(saved.ID)
	if err != nil || loaded == nil {
		t.Fatalf("get scheme: %v", err)
	}
	if len(loaded.Steps) != 1 || loaded.Steps[0].Reagents[0].Name != "A" {
		t.Errorf("scheme steps not preserved: %+v", loaded.Steps)
	}

	// 无名称方案被拒绝
	if _, err := svc.SaveScheme(&models.Scheme{}); err == nil {
		t.Error("空名称方案应被拒绝")
	}

	// 更新沿用同一个 id
	loaded.Name = "改名后的方案"
	updated, err := svc.SaveScheme(loaded)
	if err != nil {
		t.Fatal(err)
	}
	if updated.ID != saved.ID || updated.Name != "改名后的方案" {
		t.Errorf("更新方案失败: %+v", updated)
	}

	// 删除
	if err := svc.DeleteScheme(saved.ID); err != nil {
		t.Fatal(err)
	}
	gone, err := svc.GetScheme(saved.ID)
	if err != nil || gone != nil {
		t.Errorf("方案应已删除: %+v, %v", gone, err)
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

	// 导入后的方案：materialId 已清空，但可直接计算（计算不读物料库）
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
	// 计算是纯函数：即便传 nil 物料库也照样算得出来，结果只取决于方案自带快照
	got, err := NewReactionService(nil).Calculate(CalculateInput{Steps: imported.Steps})
	if err != nil {
		t.Fatalf("导入后计算失败: %v", err)
	}
	if len(got.Steps[0].BlockingErrors) != 0 {
		t.Errorf("导入后不应有阻塞错误: %v", got.Steps[0].BlockingErrors)
	}
	if got.Steps[0].TotalCost != 10 {
		t.Errorf("导入后总成本 = %v, want 10（应完全来自文件内的快照）", got.Steps[0].TotalCost)
	}
}

// TestCrossMachineSimulation 模拟跨机器：在 A 库导出方案，把物料库清空（等价于
// 目标机器没有这些物料），再导入并计算。方案自带全部数据，因此结果必须完全一致。
func TestCrossMachineSimulation(t *testing.T) {
	d := newTestDB(t)
	mrepo := db.NewMaterialRepo(d)
	schemeRepo := db.NewSchemeRepo(d)
	svc := NewSchemeService(schemeRepo)
	calc := NewReactionService(mrepo)

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
	got, err := calc.Calculate(CalculateInput{Steps: list[0].Steps})
	if err != nil {
		t.Fatalf("计算失败: %v", err)
	}
	if n := len(got.Steps[0].BlockingErrors); n != 0 {
		t.Errorf("不应有阻塞错误: %v", got.Steps[0].BlockingErrors)
	}
	// 成本完全来自文件内的快照：1kg × 25 元/kg = 25（而非库里的 40/45）
	if got.Steps[0].TotalCost != 25 {
		t.Errorf("总成本 = %v, want 25（应完全来自导出的价格快照）", got.Steps[0].TotalCost)
	}
	// 价格来源信息也应随文件带过去
	snap := list[0].Steps[0].Reagents[0].Price
	if snap == nil || snap.Supplier != "旧供应商" || snap.Date != "2024-01-01" {
		t.Errorf("价格快照的供应商/日期丢失: %+v", snap)
	}
}

// ---- ListSchemes 结果摘要 ----

// TestListSchemesSummary 摘要应给出最终产物名与单位成本，且与引擎计算一致。
func TestListSchemesSummary(t *testing.T) {
	svc, repo := newSchemeSvc(t)

	steps := []models.ReactionStep{{
		StepNum: 1,
		Reagents: []models.ReagentInput{{
			Name: "甲醇", MolWeight: 32.04, Content: 100, IsSubstrate: true, AmountKg: f(1),
			Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10},
		}},
		Products: []models.ProductInput{
			{Name: "目标产物", MolWeight: 46.07, IsSubstrate: true, WeightYield: f(80)},
		},
	}}
	sch := sampleScheme(0, "有结果的方案")
	sch.Steps = steps
	if _, err := repo.Insert(sch); err != nil {
		t.Fatal(err)
	}
	// 再存一个参数不全的：底物没填投料量，应算不出结果
	bad := sampleScheme(0, "缺数据的方案")
	bad.Steps = []models.ReactionStep{{
		StepNum:  1,
		Reagents: []models.ReagentInput{{Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true}},
		Products: []models.ProductInput{{Name: "P", MolWeight: 150, IsSubstrate: true, WeightYield: f(80)}},
	}}
	if _, err := repo.Insert(bad); err != nil {
		t.Fatal(err)
	}

	list, err := svc.ListSchemes()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("期望 2 条摘要，得到 %d", len(list))
	}
	byName := map[string]*SchemeSummary{}
	for _, s := range list {
		byName[s.Name] = s
	}

	// 与引擎直接计算的结果对齐，避免摘要算错口径
	want := engine.CalculateMultiStep(steps)
	ok := byName["有结果的方案"]
	if ok == nil {
		t.Fatal("缺少「有结果的方案」")
	}
	if !ok.HasResult {
		t.Fatalf("应算出结果，blocking=%v errors=%v", ok.BlockingErrors, ok.Errors)
	}
	if ok.ProductName != "目标产物" {
		t.Errorf("产物名 = %q，期望「目标产物」", ok.ProductName)
	}
	if ok.UnitCost != want.TotalUnitCost {
		t.Errorf("单位成本 = %v，期望 %v（引擎值）", ok.UnitCost, want.TotalUnitCost)
	}
	if ok.TotalCost != want.TotalCost || ok.TotalYieldKg != want.TotalYieldKg {
		t.Errorf("总成本/总产量 = %v/%v，期望 %v/%v",
			ok.TotalCost, ok.TotalYieldKg, want.TotalCost, want.TotalYieldKg)
	}
	if ok.StepCount != 1 {
		t.Errorf("步数 = %d，期望 1", ok.StepCount)
	}

	// 缺数据的方案：不该算出结果，且必须给出原因
	bad2 := byName["缺数据的方案"]
	if bad2 == nil {
		t.Fatal("缺少「缺数据的方案」")
	}
	if bad2.HasResult {
		t.Error("参数不全的方案不应算出结果")
	}
	if len(bad2.BlockingErrors) == 0 {
		t.Error("算不出结果时必须给出阻塞原因，供列表 Tooltip 展示")
	}

	// 摘要按 updated_at 倒序返回（与 repo.List 一致），只是顺序不定，这里只校验集合完整
	if list[0].Name != "缺数据的方案" && list[1].Name != "缺数据的方案" {
		t.Error("列表应同时包含两个方案")
	}
}

// TestListSchemesMultiStepSummaryUsesLastStep 摘要的三个汇总值必须同出一源：
// 都取最后一步，这样前端 Tooltip 的「X 元 ÷ Y kg」才与展示的单位成本对得上。
func TestListSchemesMultiStepSummaryUsesLastStep(t *testing.T) {
	svc, repo := newSchemeSvc(t)
	steps := []models.ReactionStep{
		{
			StepNum: 1,
			Reagents: []models.ReagentInput{{
				Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1),
				Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10},
			}},
			Products: []models.ProductInput{{Name: "中间体", MolWeight: 120, IsSubstrate: true, WeightYield: f(50)}},
		},
		{
			StepNum: 2,
			Reagents: []models.ReagentInput{
				{Name: "中间体", MolWeight: 120, Inherited: true, IsSubstrate: true, AmountKg: f(0.4)},
				{Name: "C", MolWeight: 200, Content: 100, Equiv: f(2),
					Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 5}},
			},
			Products: []models.ProductInput{{Name: "终产物", MolWeight: 200, IsSubstrate: true, WeightYield: f(60)}},
		},
	}
	sch := sampleScheme(0, "两步方案")
	sch.Steps = steps
	if _, err := repo.Insert(sch); err != nil {
		t.Fatal(err)
	}

	list, err := svc.ListSchemes()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || !list[0].HasResult {
		t.Fatalf("两步方案应算出结果: %+v", list[0])
	}
	got := list[0]
	last := engine.CalculateMultiStep(steps).Steps[1]
	if got.TotalCost != last.TotalCost {
		t.Errorf("摘要总成本 = %v，期望最后一步的 %v（不应把各步成本累加）", got.TotalCost, last.TotalCost)
	}
	if got.TotalYieldKg != last.PrimaryProduct.ActualYield {
		t.Errorf("摘要总产量 = %v，期望最后一步的 %v", got.TotalYieldKg, last.PrimaryProduct.ActualYield)
	}
	// 第二步的成本里已含继承原料（单价 20、投料 0.4），汇总只认这一步，不再回头累加第一步
	if want := last.TotalCost / last.PrimaryProduct.ActualYield; got.UnitCost != want {
		t.Errorf("摘要单位成本 = %v，期望 %v", got.UnitCost, want)
	}
}

// TestListSchemesEmptySteps 没有步骤的方案不应让列表接口报错。
func TestListSchemesEmptySteps(t *testing.T) {
	svc, repo := newSchemeSvc(t)
	if _, err := repo.Insert(sampleScheme(0, "空方案")); err != nil {
		t.Fatal(err)
	}
	list, err := svc.ListSchemes()
	if err != nil {
		t.Fatalf("空方案不应让列表失败: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("期望 1 条，得到 %d", len(list))
	}
	if list[0].HasResult {
		t.Error("空方案不应有结果")
	}
	if len(list[0].BlockingErrors) == 0 {
		t.Error("空方案应给出原因")
	}
}

// TestListSchemesDoesNotMutateStored 摘要计算会注入继承原料，不能污染库中方案。
func TestListSchemesDoesNotMutateStored(t *testing.T) {
	svc, repo := newSchemeSvc(t)
	sch := sampleScheme(0, "两步方案")
	sch.Steps = []models.ReactionStep{
		{
			StepNum: 1,
			Reagents: []models.ReagentInput{{
				Name: "A", MolWeight: 100, Content: 100, IsSubstrate: true, AmountKg: f(1),
				Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10},
			}},
			Products: []models.ProductInput{{Name: "中间体", MolWeight: 120, IsSubstrate: true, WeightYield: f(90)}},
		},
		{
			StepNum: 2,
			// 继承行当底物时仍需填投料量，否则引擎会判「底物投料量需大于 0」
			Reagents: []models.ReagentInput{{Name: "中间体", MolWeight: 120, Inherited: true, IsSubstrate: true, AmountKg: f(0.45)}},
			Products: []models.ProductInput{{Name: "终产物", MolWeight: 180, IsSubstrate: true, WeightYield: f(70)}},
		},
	}
	id, err := repo.Insert(sch)
	if err != nil {
		t.Fatal(err)
	}

	list, err := svc.ListSchemes()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || !list[0].HasResult {
		t.Fatalf("两步方案应算出结果: hasResult=%v product=%q cost=%v yield=%v blocking=%v errors=%v",
			list[0].HasResult, list[0].ProductName, list[0].TotalCost, list[0].TotalYieldKg,
			list[0].BlockingErrors, list[0].Errors)
	}
	if list[0].ProductName != "终产物" {
		t.Errorf("最终产物名 = %q，期望「终产物」（最后一步的主产物）", list[0].ProductName)
	}

	// 库里那份必须还是原样：继承行的分子量/单价是计算期注入的，不该被持久化
	stored, err := repo.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	inh := stored.Steps[1].Reagents[0]
	if inh.Price != nil {
		t.Error("列表计算不得把注入的价格快照写回库中方案")
	}
	if inh.Name != "中间体" || inh.MolWeight != 120 {
		t.Error("库中方案的继承行不应被摘要计算改动")
	}
}
