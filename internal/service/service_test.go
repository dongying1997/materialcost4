package service

import (
	"path/filepath"
	"testing"
	"time"

	"materialcost4/internal/db"
	"materialcost4/internal/models"
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
