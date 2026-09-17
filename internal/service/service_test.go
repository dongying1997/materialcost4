package service

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/dongying1997/materialcost4/internal/db"
	"github.com/dongying1997/materialcost4/internal/models"
)

func newTestDB(t *testing.T) *db.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	d, err := db.Open(path)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

func TestPriceConversion(t *testing.T) {
	cases := []struct {
		price float64
		unit  string
		mw    float64
		want  float64
	}{
		{5, "元/g", 0, 5000},
		{100, "元/kg", 0, 100},
		{10, "元/mol", 100, 100}, // 10*1000/100 = 100
	}
	for _, c := range cases {
		got, warn := PriceToYuanPerKg(c.price, c.unit, c.mw)
		if got != c.want || warn != "" {
			t.Errorf("PriceToYuanPerKg(%v,%q,%v) = %v, %q; want %v", c.price, c.unit, c.mw, got, warn, c.want)
		}
	}
	// 元/mol 缺分子量 → 警告
	_, warn := PriceToYuanPerKg(10, "元/mol", 0)
	if warn == "" {
		t.Error("expected warning for 元/mol without mol weight")
	}
}

func TestMaterialCRUD(t *testing.T) {
	d := newTestDB(t)
	repo := db.NewMaterialRepo(d)
	svc := NewMaterialService(repo)

	m := &models.Material{Name: "甲醇", CAS: "67-56-1", Formula: "CH4O", MolWeight: 32.04, Content: 99.5}
	saved, err := svc.SaveMaterial(m)
	if err != nil {
		t.Fatalf("save material: %v", err)
	}
	if saved.ID == 0 {
		t.Fatal("material id should be set")
	}

	// 相同 CAS 不能新增
	dup := &models.Material{Name: "甲醇2", CAS: "67-56-1"}
	if _, err := svc.SaveMaterial(dup); err == nil {
		t.Error("expected CAS duplicate error")
	}

	// 价格
	day := time.Date(2026, 8, 25, 0, 0, 0, 0, time.Local)
	p := &models.Price{MaterialID: saved.ID, Price: 3.5, Unit: "元/kg", Supplier: "A公司", Date: day}
	_, err = svc.SavePrice(p)
	if err != nil {
		t.Fatalf("save price: %v", err)
	}

	// 列表带价格
	list, err := svc.ListMaterials("")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Price != 3.5 || list[0].PriceCount != 1 {
		t.Errorf("unexpected list: %+v", list)
	}

	// 搜索
	list, _ = svc.ListMaterials("67-56")
	if len(list) != 1 {
		t.Errorf("search by CAS failed: %d", len(list))
	}

	// 删除
	if err := svc.DeleteMaterial(saved.ID); err != nil {
		t.Fatal(err)
	}
	list, _ = svc.ListMaterials("")
	if len(list) != 0 {
		t.Error("material not deleted")
	}
}

func TestClearAllMaterials(t *testing.T) {
	d := newTestDB(t)
	repo := db.NewMaterialRepo(d)
	svc := NewMaterialService(repo)

	// 两个物料，一个带价格；另存一个方案，清空物料库不应影响它
	m1 := &models.Material{Name: "甲醇", CAS: "67-56-1"}
	id1, err := repo.Insert(m1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Insert(&models.Material{Name: "乙醇", CAS: "64-17-5"}); err != nil {
		t.Fatal(err)
	}
	day := time.Date(2026, 8, 25, 0, 0, 0, 0, time.Local)
	if _, err := repo.InsertPrice(&models.Price{MaterialID: id1, Price: 3.5, Unit: "元/kg", Date: day}); err != nil {
		t.Fatal(err)
	}
	schemeSvc := NewReactionService(repo, db.NewSchemeRepo(d))
	scheme, err := schemeSvc.SaveScheme(&models.Scheme{Name: "保留的方案", Steps: []models.ReactionStep{}})
	if err != nil {
		t.Fatal(err)
	}

	res, err := svc.ClearAllMaterials()
	if err != nil {
		t.Fatalf("clear all: %v", err)
	}
	if res.MaterialsDeleted != 2 || res.PricesDeleted != 1 {
		t.Errorf("deleted materials=%d prices=%d, want 2/1", res.MaterialsDeleted, res.PricesDeleted)
	}

	// 两张表都空了
	for _, table := range []string{"materials", "prices"} {
		var n int
		if err := d.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Errorf("%s 还有 %d 条, want 0", table, n)
		}
	}

	// 方案不受影响
	loaded, err := schemeSvc.GetScheme(scheme.ID)
	if err != nil || loaded == nil {
		t.Fatalf("scheme 被清掉了: %v", err)
	}
	if loaded.Name != "保留的方案" {
		t.Errorf("scheme name = %q", loaded.Name)
	}

	// 清空后仍可正常新增（清空不应破坏表结构或索引）
	if _, err := svc.SaveMaterial(&models.Material{Name: "苯", CAS: "71-43-2"}); err != nil {
		t.Fatalf("clear 后新增失败: %v", err)
	}

	// 空库上重复清空是幂等的
	res, err = svc.ClearAllMaterials()
	if err != nil {
		t.Fatal(err)
	}
	if res.MaterialsDeleted != 1 || res.PricesDeleted != 0 {
		t.Errorf("第二次 clear: materials=%d prices=%d, want 1/0", res.MaterialsDeleted, res.PricesDeleted)
	}
}

// TestCalculateIgnoresMaterialLibrary 回归测试：计算是纯函数，完全不读物料库。
// 用一个库中不存在的 materialId，计算仍应正常出结果（方案自带全部输入）。
func TestCalculateIgnoresMaterialLibrary(t *testing.T) {
	d := newTestDB(t)
	svc := NewReactionService(db.NewMaterialRepo(d), db.NewSchemeRepo(d))

	steps := []models.ReactionStep{{
		StepNum: 1, Name: "反应1",
		Reagents: []models.ReagentInput{{
			MaterialID: 99999, // 库中不存在
			Name:       "1,4-环己二醇", MolWeight: 116.16, Content: 100,
			IsSubstrate: true, AmountKg: f(1),
			Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10},
		}},
		Products: []models.ProductInput{
			{Name: "M163", MolWeight: 226.27, WeightYield: f(100)},
		},
	}}

	res, err := svc.Calculate(CalculateInput{Steps: steps})
	if err != nil {
		t.Fatalf("Calculate 不应读库、不应报错，实际: %v", err)
	}
	if len(res.Steps) != 1 || len(res.Steps[0].BlockingErrors) != 0 {
		t.Fatalf("unexpected result: %+v", res.Steps[0])
	}
	// 单价取自快照 → 成本 = 1kg × 10元/kg × (1-0%) = 10
	if got := res.Steps[0].TotalCost; got != 10 {
		t.Errorf("总成本 = %v, want 10（单价应取自快照）", got)
	}
}

// TestPriceSnapshotOverridesLibrary 价格快照优先：库里的价格再新也不影响已保存方案。
func TestPriceSnapshotOverridesLibrary(t *testing.T) {
	d := newTestDB(t)
	repo := db.NewMaterialRepo(d)
	svc := NewReactionService(repo, db.NewSchemeRepo(d))

	id, err := repo.Insert(&models.Material{Name: "甲醇", CAS: "67-56-1", MolWeight: 32.04, Content: 99.5})
	if err != nil {
		t.Fatal(err)
	}
	// 库里放一条价格 999，方案快照里是 10 —— 应取 10
	if _, err := repo.InsertPrice(&models.Price{
		MaterialID: id, Price: 999, Unit: "元/kg",
		Date: time.Date(2026, 8, 25, 0, 0, 0, 0, time.Local),
	}); err != nil {
		t.Fatal(err)
	}

	steps := []models.ReactionStep{{
		StepNum: 1,
		Reagents: []models.ReagentInput{{
			MaterialID: id, MolWeight: 32.04, Content: 99.5, IsSubstrate: true, AmountKg: f(1),
			Price: &models.PriceSnapshot{UnitPriceYuanPerKg: 10},
		}},
		Products: []models.ProductInput{{Name: "P", MolWeight: 46.07, WeightYield: f(80)}},
	}}
	res, err := svc.Calculate(CalculateInput{Steps: steps})
	if err != nil {
		t.Fatal(err)
	}
	if got := res.Steps[0].TotalCost; got != 10 {
		t.Errorf("总成本 = %v, want 10（快照优先于库中最新价 999）", got)
	}
}

func TestSchemeSaveLoad(t *testing.T) {
	d := newTestDB(t)
	repo := db.NewMaterialRepo(d)
	schemeRepo := db.NewSchemeRepo(d)
	svc := NewReactionService(repo, schemeRepo)

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

	// 计算载入的方案
	res, err := svc.Calculate(CalculateInput{Steps: loaded.Steps})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Steps) != 1 || res.Steps[0].Products[0].ActualYieldKg != 0.8 {
		t.Errorf("calc after load failed: %+v", res.Steps[0])
	}
}

func f(v float64) *float64 { return &v }
