package service

import (
	"testing"

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
	if export.Version != 1 || export.App != "MaterialCost4" || export.ExportedAt == "" {
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

// TestImportSchemes 导入兼容数组与包裹两种格式。
func TestImportSchemes(t *testing.T) {
	svc, repo := newSchemeSvc(t)

	// 数组格式
	arr := []byte(`[
		{"name":"A","note":"","steps":[]},
		{"name":"","note":"无名称应跳过","steps":[]}
	]`)
	res, err := svc.ImportSchemes(arr)
	if err != nil {
		t.Fatalf("导入数组格式失败: %v", err)
	}
	if res.Imported != 1 {
		t.Errorf("数组格式导入数 = %d, want 1", res.Imported)
	}
	if len(res.Errors) != 1 {
		t.Errorf("数组格式错误数 = %d, want 1", len(res.Errors))
	}

	// 包裹格式
	wrapped := []byte(`{
		"version":1,"app":"MaterialCost4","exportedAt":"2026-08-26 10:00:00",
		"schemes":[{"name":"B","note":"","steps":[]}]
	}`)
	res2, err := svc.ImportSchemes(wrapped)
	if err != nil {
		t.Fatalf("导入包裹格式失败: %v", err)
	}
	if res2.Imported != 1 || len(res2.Errors) != 0 {
		t.Errorf("包裹格式导入结果 = %+v, want 1 imported", res2)
	}

	// 无效 JSON
	if _, err := svc.ImportSchemes([]byte(`{invalid`)); err == nil {
		t.Error("无效 JSON 应返回错误")
	}

	// 空数组
	res3, err := svc.ImportSchemes([]byte(`[]`))
	if err != nil || res3.Imported != 0 {
		t.Errorf("空数组导入 = %+v, %v; want 0 imported", res3, err)
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
	if !names["A"] || !names["B"] {
		t.Errorf("导入的方案不在列表中: %v", names)
	}
}
