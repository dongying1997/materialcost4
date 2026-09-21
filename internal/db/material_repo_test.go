package db

import (
	"path/filepath"
	"testing"

	"github.com/dongying1997/materialcost4/internal/models"
)

func newMaterialRepo(t *testing.T) (*MaterialRepo, *DB) {
	t.Helper()
	d, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	return NewMaterialRepo(d), d
}

// addMaterials 依次插入物料并返回其 id（按插入顺序）。
func addMaterials(t *testing.T, repo *MaterialRepo, names ...string) []int64 {
	t.Helper()
	ids := make([]int64, 0, len(names))
	for _, n := range names {
		id, err := repo.Insert(&models.Material{Name: n})
		if err != nil {
			t.Fatalf("insert %q: %v", n, err)
		}
		ids = append(ids, id)
	}
	return ids
}

// names 取列表里的名称序列，便于断言顺序。
func names(list []*models.Material) []string {
	out := make([]string, 0, len(list))
	for _, m := range list {
		out = append(out, m.Name)
	}
	return out
}

func eqNames(t *testing.T, got []string, want []string, label string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: 长度 %d，期望 %d（got=%v）", label, len(got), len(want), got)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("%s: 第 %d 项 = %q，期望 %q（got=%v）", label, i, got[i], want[i], got)
		}
	}
}

// TestListWithoutKeywordNewestFirst 不搜索时按新增时间倒序：刚建的物料必须在最前。
func TestListWithoutKeywordNewestFirst(t *testing.T) {
	repo, _ := newMaterialRepo(t)
	addMaterials(t, repo, "乙酸", "甲醇", "乙醇")

	list, err := repo.List("")
	if err != nil {
		t.Fatal(err)
	}
	eqNames(t, names(list), []string{"乙醇", "甲醇", "乙酸"}, "无关键字排序")
}

// TestListRankedByKeywordProximity 搜索时按接近度：精确 > 前缀 > 包含，同级按新增倒序。
func TestListRankedByKeywordProximity(t *testing.T) {
	repo, _ := newMaterialRepo(t)
	// 插入顺序决定同级内的先后（id 越大越靠前）
	//  "甲醇钠"（前缀：甲醇 + 钠）
	//  "甲醇"  （精确）
	//  "甲醇钾"（前缀）
	//  "无水甲醇"（包含，但不以「甲醇」开头）
	//  "甲酸钠"（不含「甲醇」，不应出现）
	addMaterials(t, repo, "甲醇钠", "甲醇", "甲醇钾", "无水甲醇", "甲酸钠")

	list, err := repo.List("甲醇")
	if err != nil {
		t.Fatal(err)
	}
	// 三档：精确「甲醇」；前缀档按 id 倒序（甲醇钾 id=3 > 甲醇钠 id=1）；
	// 包含档「无水甲醇」。注意「甲醇钠」是前缀匹配而非包含匹配——
	// 它字面上确实以「甲醇」开头，只是后面还跟着「钠」。
	eqNames(t, names(list), []string{"甲醇", "甲醇钾", "甲醇钠", "无水甲醇"}, "关键字接近度排序")
}

// TestListMatchesAllFields 编码/CAS/化学式/备注 都应参与匹配。
func TestListMatchesAllFields(t *testing.T) {
	repo, _ := newMaterialRepo(t)
	if _, err := repo.Insert(&models.Material{Code: "M-001", Name: "甲", CAS: "67-56-1", Formula: "CH4O", Note: "木醇"}); err != nil {
		t.Fatal(err)
	}
	for _, kw := range []string{"M-001", "67-56-1", "CH4O", "木醇"} {
		list, err := repo.List(kw)
		if err != nil {
			t.Fatalf("搜索 %q: %v", kw, err)
		}
		if len(list) != 1 {
			t.Errorf("搜索 %q 应命中 1 条，得到 %d", kw, len(list))
		}
	}
	// 化学式/备注只参与「包含」这一档，不应因为命中就排到前缀匹配前面
	addMaterials(t, repo, "乙醇")
	list, err := repo.List("乙")
	if err != nil {
		t.Fatal(err)
	}
	eqNames(t, names(list), []string{"乙醇"}, "前缀匹配")
}
