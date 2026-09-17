package db

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/dongying1997/materialcost4/internal/models"
)

// TestCASIndexAllowsMultipleEmptyCAS 回归测试：旧的无条件唯一索引要求 CAS 全局唯一，
// 空字符串也算一个值，导致只能存在一条无 CAS 的物料。迁移应把它换成部分索引。
func TestCASIndexAllowsMultipleEmptyCAS(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	// 首次打开：建立部分索引
	d, err := Open(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	// 还原成旧版的无条件唯一索引，模拟已有数据库
	if _, err := d.Exec(`DROP INDEX IF EXISTS idx_materials_cas`); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`CREATE UNIQUE INDEX idx_materials_cas ON materials(cas)`); err != nil {
		t.Fatal(err)
	}
	repo := NewMaterialRepo(d)
	if _, err := repo.Insert(&models.Material{Name: "旧物料"}); err != nil {
		t.Fatalf("insert legacy: %v", err)
	}
	d.Close()

	// 再次打开：迁移应重建索引
	d, err = Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer d.Close()

	var def string
	if err := d.QueryRow(`SELECT sql FROM sqlite_master WHERE name='idx_materials_cas'`).Scan(&def); err != nil {
		t.Fatalf("read index def: %v", err)
	}
	if !strings.Contains(strings.ToUpper(def), "WHERE") {
		t.Errorf("index is not partial: %s", def)
	}

	// 多条无 CAS 的物料应能共存
	repo = NewMaterialRepo(d)
	if _, err := repo.Insert(&models.Material{Name: "无CAS物料A"}); err != nil {
		t.Fatalf("insert empty-cas A: %v", err)
	}
	if _, err := repo.Insert(&models.Material{Name: "无CAS物料B"}); err != nil {
		t.Fatalf("insert empty-cas B: %v", err)
	}

	// 非空 CAS 仍然唯一
	if _, err := repo.Insert(&models.Material{Name: "苯", CAS: "71-43-2"}); err != nil {
		t.Fatalf("insert benzene: %v", err)
	}
	if _, err := repo.Insert(&models.Material{Name: "苯2", CAS: "71-43-2"}); err == nil {
		t.Error("expected duplicate non-empty CAS to be rejected")
	}
}
