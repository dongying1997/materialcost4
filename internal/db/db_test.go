package db

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dongying1997/materialcost4/internal/models"
)

// TestParseTimeKeepsLocalTimezone 回归测试：库里存的是本地时间字符串（无时区后缀），
// 若按 UTC 解析，序列化给前端后会变成带 Z 的时间，前端 new Date() 再按本地时区
// 渲染一次，等于凭空加了一个时差（本地 20:45 显示成次日 04:45）。
func TestParseTimeKeepsLocalTimezone(t *testing.T) {
	// 本机时区与 UTC 相同时无法区分两种解析，跳过（CI 常用 UTC）
	if _, off := time.Now().Zone(); off == 0 {
		t.Skip("本机在 UTC 时区，无法区分 Parse 与 ParseInLocation")
	}

	const stored = "2026-09-17 20:45:17"
	got, err := ParseTime(stored)
	if err != nil {
		t.Fatal(err)
	}
	// 墙上时钟必须原样保留
	if got.Format("2006-01-02 15:04:05") != stored {
		t.Errorf("ParseTime 墙上时钟 = %q, want %q", got.Format("2006-01-02 15:04:05"), stored)
	}
	// 时区必须是本地时区，且序列化后是带本地偏移的 RFC3339，而不是 UTC 的 Z
	if _, off := got.Zone(); off == 0 {
		t.Errorf("ParseTime 返回的时区偏移为 0，说明按 UTC 解析了")
	}
	if s := got.Format(time.RFC3339); strings.HasSuffix(s, "Z") {
		t.Errorf("RFC3339 = %q, 不应以 Z 结尾（会被前端当成 UTC）", s)
	}
	// 与直接用 time.Local 解析的结果一致
	want, _ := time.ParseInLocation("2006-01-02 15:04:05", stored, time.Local)
	if !got.Equal(want) {
		t.Errorf("ParseTime = %v, want %v", got, want)
	}
}

// TestParseDateKeepsLocalDate 同上，价格日期若不按本地时区解析，
// 序列化成 UTC 后可能整体偏到前一天。
func TestParseDateKeepsLocalDate(t *testing.T) {
	if _, off := time.Now().Zone(); off == 0 {
		t.Skip("本机在 UTC 时区，无法区分")
	}
	got, err := parseDate("2026-08-25")
	if err != nil {
		t.Fatal(err)
	}
	if got.Format("2006-01-02") != "2026-08-25" {
		t.Errorf("parseDate 日期 = %q, want 2026-08-25", got.Format("2006-01-02"))
	}
	if s := got.Format(time.RFC3339); strings.HasSuffix(s, "Z") {
		t.Errorf("RFC3339 = %q, 不应以 Z 结尾", s)
	}
}

// TestSchemeTimesRoundTrip 端到端：写入 → 读出 → 序列化，时间必须仍是本地墙上时钟。
func TestSchemeTimesRoundTrip(t *testing.T) {
	if _, off := time.Now().Zone(); off == 0 {
		t.Skip("本机在 UTC 时区，无法区分")
	}
	d, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()

	repo := NewSchemeRepo(d)
	id, err := repo.Insert(&models.Scheme{Name: "时区测试", Steps: []models.ReactionStep{}})
	if err != nil {
		t.Fatal(err)
	}
	got, err := repo.Get(id)
	if err != nil || got == nil {
		t.Fatalf("get scheme: %v", err)
	}
	// 读回来的 UpdatedAt 应贴近当前时间（而不是差一个时区）
	if diff := time.Since(got.UpdatedAt); diff < -time.Minute || diff > time.Minute {
		t.Errorf("UpdatedAt = %v, 与当前时间相差 %v（时区解析有误）", got.UpdatedAt, diff)
	}
	// 序列化后不应出现 UTC 的 Z 后缀
	if s := got.UpdatedAt.Format(time.RFC3339); strings.HasSuffix(s, "Z") {
		t.Errorf("UpdatedAt RFC3339 = %q, 不应以 Z 结尾", s)
	}
}

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
