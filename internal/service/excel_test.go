package service

import (
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"

	"materialcost4/internal/db"
)

func TestExcelImport(t *testing.T) {
	d := newTestDB(t)
	repo := db.NewMaterialRepo(d)
	svc := NewExcelService(repo)

	// 构建测试 xlsx：两行
	f := excelize.NewFile()
	sheet := "Sheet1"
	headers := []string{"物料名称", "CAS号", "化学式", "分子量", "价格", "价格单位", "供应商", "日期", "规格", "含量", "备注"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}
	row2 := []any{"苯", "71-43-2", "C6H6", "78.11", "8.5", "元/kg", "S公司", "2026-08-25", "AR", "99.8", "测试"}
	for i, v := range row2 {
		cell, _ := excelize.CoordinatesToCellName(i+1, 2)
		f.SetCellValue(sheet, cell, v)
	}
	// 第三行：Excel 序列号日期（45198 ≈ 2026-08-25）? 用 46000 测试序列号
	row3 := []any{"乙醇", "64-17-5", "C2H6O", "46.07", "4.2", "元/kg", "S公司", float64(46000), "AR", "99", ""}
	for i, v := range row3 {
		cell, _ := excelize.CoordinatesToCellName(i+1, 3)
		f.SetCellValue(sheet, cell, v)
	}
	// 第四行：真实日期单元格（2026-08-25，会按 m/d/yy 格式渲染成 08-25-26）
	row4 := []any{"丙酮", "67-64-1", "C3H6O", "58.08", "6.8", "元/kg", "S公司", time.Date(2026, 8, 25, 0, 0, 0, 0, time.Local), "AR", "99.5", ""}
	for i, v := range row4 {
		cell, _ := excelize.CoordinatesToCellName(i+1, 4)
		f.SetCellValue(sheet, cell, v)
	}
	// 第五行：缺少 CAS → 跳过
	row5 := []any{"无CAS物料", "", "", "", "", "", "", "", "", "", ""}
	for i, v := range row5 {
		cell, _ := excelize.CoordinatesToCellName(i+1, 5)
		f.SetCellValue(sheet, cell, v)
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		t.Fatal(err)
	}

	res, err := svc.ImportFromBytes(buf.Bytes(), "test.xlsx")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if res.MaterialsImported != 3 {
		t.Errorf("materials imported = %d, want 3", res.MaterialsImported)
	}
	if res.PricesImported != 3 {
		t.Errorf("prices imported = %d, want 3", res.PricesImported)
	}
	if res.Skipped != 1 {
		t.Errorf("skipped = %d, want 1", res.Skipped)
	}

	// 验证物料与价格入库
	benzene, _ := repo.GetByCAS("71-43-2")
	if benzene == nil || benzene.Name != "苯" {
		t.Errorf("benzene not imported correctly: %+v", benzene)
	}
	prices, err := repo.ListPrices(benzene.ID, "")
	if err != nil || len(prices) != 1 {
		t.Fatalf("prices: %v %d", err, len(prices))
	}
	if prices[0].Supplier != "S公司" {
		t.Errorf("supplier = %v", prices[0].Supplier)
	}

	// 序列号日期验证
	ethanol, _ := repo.GetByCAS("64-17-5")
	prices2, _ := repo.ListPrices(ethanol.ID, "")
	if len(prices2) != 1 {
		t.Fatalf("ethanol prices: %d", len(prices2))
	}
	expect := time.Date(1899, 12, 30, 0, 0, 0, 0, time.Local).AddDate(0, 0, 46000)
	if prices2[0].Date.Year() != expect.Year() {
		t.Errorf("serial date = %v, want year %d", prices2[0].Date, expect.Year())
	}

	// 真实日期单元格验证（m/d/yy 渲染，raw 回退）
	acetone, _ := repo.GetByCAS("67-64-1")
	prices3, _ := repo.ListPrices(acetone.ID, "")
	if len(prices3) != 1 {
		t.Fatalf("acetone prices: %d", len(prices3))
	}
	if prices3[0].Date.Format("2006-01-02") != "2026-08-25" {
		t.Errorf("acetone date = %s, want 2026-08-25", prices3[0].Date.Format("2006-01-02"))
	}
}

// TestParseDateFlexible 回归测试：日期字符串（以数字开头）不应被误判为 Excel 序列号。
func TestParseDateFlexible(t *testing.T) {
	cases := []struct {
		input string
		want  string // 期望日期 YYYY-MM-DD
	}{
		{"2026-08-25", "2026-08-25"},
		{"8/25/2026", "2026-08-25"},
		{"2026/08/25", "2026-08-25"},
		{"2026.08.25", "2026-08-25"},
		{"2026-08-25 10:30:00", "2026-08-25"},
	}
	for _, c := range cases {
		got, err := parseDateFlexible(c.input, nil, "", 0, 0)
		if err != nil {
			t.Errorf("parseDateFlexible(%q) error: %v", c.input, err)
			continue
		}
		if got.Format("2006-01-02") != c.want {
			t.Errorf("parseDateFlexible(%q) = %s, want %s", c.input, got.Format("2006-01-02"), c.want)
		}
	}

	// 真正的 Excel 序列号仍应走序列号路径
	got, err := parseDateFlexible("46000", nil, "", 0, 0)
	if err != nil {
		t.Fatalf("serial parse error: %v", err)
	}
	expect := time.Date(1899, 12, 30, 0, 0, 0, 0, time.Local).AddDate(0, 0, 46000)
	if got.Year() != expect.Year() {
		t.Errorf("serial = %v, want year %d", got, expect.Year())
	}
}

func TestTemplateDownload(t *testing.T) {
	d := newTestDB(t)
	svc := NewExcelService(db.NewMaterialRepo(d))
	data, err := svc.DownloadTemplate()
	if err != nil || len(data) == 0 {
		t.Fatalf("template: %v len=%d", err, len(data))
	}
	f, err := excelize.OpenReader(bytesReader(data))
	if err != nil {
		t.Fatalf("open template: %v", err)
	}
	rows, _ := f.GetRows("Sheet1")
	if len(rows) < 1 {
		t.Fatal("template has no header")
	}
	if rows[0][1] != "CAS号" {
		t.Errorf("template header = %v", rows[0])
	}
}

func bytesReader(b []byte) *strings.Reader {
	return strings.NewReader(string(b))
}
