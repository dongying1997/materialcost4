package service

import (
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/dongying1997/materialcost4/internal/db"
	"github.com/dongying1997/materialcost4/internal/models"
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
	// 第五行：缺少 CAS 也应导入（CAS 不是必填字段）
	row5 := []any{"无CAS物料", "", "", "", "", "", "", "", "", "", ""}
	for i, v := range row5 {
		cell, _ := excelize.CoordinatesToCellName(i+1, 5)
		f.SetCellValue(sheet, cell, v)
	}
	// 第六行：第二条无 CAS 物料，同样应导入（空 CAS 不参与唯一约束）
	row6 := []any{"无CAS物料2", "", "", "", "", "", "", "", "", "", ""}
	for i, v := range row6 {
		cell, _ := excelize.CoordinatesToCellName(i+1, 6)
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
	if res.MaterialsImported != 5 {
		t.Errorf("materials imported = %d, want 5", res.MaterialsImported)
	}
	if len(res.Errors) != 0 {
		t.Errorf("import errors = %v, want none", res.Errors)
	}
	if res.PricesImported != 3 {
		t.Errorf("prices imported = %d, want 3", res.PricesImported)
	}
	if res.Skipped != 0 {
		t.Errorf("skipped = %d, want 0", res.Skipped)
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

	// 缺少 CAS 的物料也已入库，且允许多条（CAS 为空不参与唯一约束）
	var noCASCount int
	if err := d.QueryRow(`SELECT COUNT(*) FROM materials WHERE cas = ''`).Scan(&noCASCount); err != nil {
		t.Fatalf("query no-CAS materials: %v", err)
	}
	if noCASCount != 2 {
		t.Errorf("no-CAS material count = %d, want 2", noCASCount)
	}
	var noCASName string
	if err := d.QueryRow(`SELECT name FROM materials WHERE cas = '' ORDER BY name LIMIT 1`).Scan(&noCASName); err != nil {
		t.Fatalf("query no-CAS material: %v", err)
	}
	if noCASName != "无CAS物料" {
		t.Errorf("no-CAS material name = %q, want 无CAS物料", noCASName)
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

// TestImportMatchesByCASWithAlias 回归测试：同一物质在库里换了个名称写法时，
// 导入不应把它当成新物料（会撞 CAS 唯一索引报错），而应视为同一物料并更新。
func TestImportMatchesByCASWithAlias(t *testing.T) {
	d := newTestDB(t)
	repo := db.NewMaterialRepo(d)
	svc := NewExcelService(repo)

	// 库中已有「对苯醌」，Excel 里写的是它的别名「1,4-苯醌」
	existing := &models.Material{Name: "对苯醌", CAS: "106-51-4", Formula: "C6H4O2", MolWeight: 108.1}
	id, err := repo.Insert(existing)
	if err != nil {
		t.Fatal(err)
	}

	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	headers := []string{"物料名称", "CAS号", "化学式", "分子量", "价格", "价格单位", "供应商", "日期", "规格", "含量", "备注"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}
	row2 := []any{"1,4-苯醌", "106-51-4", "C6H4O2", "108.09", "20", "元/kg", "S公司", "2026-08-25", "AR", "99", ""}
	for i, v := range row2 {
		cell, _ := excelize.CoordinatesToCellName(i+1, 2)
		f.SetCellValue(sheet, cell, v)
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		t.Fatal(err)
	}

	res, err := svc.ImportFromBytes(buf.Bytes(), "alias.xlsx")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(res.Errors) != 0 {
		t.Errorf("import errors = %v, want none", res.Errors)
	}
	if res.MaterialsImported != 0 || res.MaterialsUpdated != 1 {
		t.Errorf("imported=%d updated=%d, want 0/1", res.MaterialsImported, res.MaterialsUpdated)
	}

	// 名称保留库中的写法，别名进备注，CAS 不变
	got, err := repo.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "对苯醌" {
		t.Errorf("name = %q, want 对苯醌（保留库中名称）", got.Name)
	}
	if got.Note != "别名：1,4-苯醌" {
		t.Errorf("note = %q, want 别名：1,4-苯醌", got.Note)
	}
	if got.MolWeight != 108.09 {
		t.Errorf("mol weight = %v, want 108.09（其余字段仍应更新）", got.MolWeight)
	}

	// 别名应可被搜索到（List 的匹配字段包含备注）
	list, err := svc.repo.List("1,4-苯醌")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != id {
		t.Errorf("按别名搜索返回 %d 条, want 1 条命中库中物料", len(list))
	}

	// 再导一次：别名不重复追加
	if _, err := svc.ImportFromBytes(buf.Bytes(), "alias.xlsx"); err != nil {
		t.Fatal(err)
	}
	got, _ = repo.Get(id)
	if got.Note != "别名：1,4-苯醌" {
		t.Errorf("note after re-import = %q, want 不重复追加", got.Note)
	}
}

// TestImportPrefersCASMatchOverNameMatch 回归测试：同一物质在库里存了两条
// （一条带 CAS、一条 CAS 为空且名称不同）时，应更新与 Excel 行 CAS 一致的那条，
// 否则两条记录会互相补上对方的 CAS 而撞唯一索引。
func TestImportPrefersCASMatchOverNameMatch(t *testing.T) {
	d := newTestDB(t)
	repo := db.NewMaterialRepo(d)
	svc := NewExcelService(repo)

	withCAS := &models.Material{Name: "DBU", CAS: "6674-22-2"}
	withCASID, err := repo.Insert(withCAS)
	if err != nil {
		t.Fatal(err)
	}
	noCAS := &models.Material{Name: "1,8-二氮杂双环[5.4.0]十一碳-7-烯"}
	noCASID, err := repo.Insert(noCAS)
	if err != nil {
		t.Fatal(err)
	}

	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	headers := []string{"物料名称", "CAS号", "化学式", "分子量", "价格", "价格单位", "供应商", "日期", "规格", "含量", "备注"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}
	row2 := []any{"1,8-二氮杂双环[5.4.0]十一碳-7-烯", "6674-22-2", "", "", "", "", "", "", "", "", ""}
	for i, v := range row2 {
		cell, _ := excelize.CoordinatesToCellName(i+1, 2)
		f.SetCellValue(sheet, cell, v)
	}
	buf, _ := f.WriteToBuffer()

	res, err := svc.ImportFromBytes(buf.Bytes(), "dup.xlsx")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(res.Errors) != 0 {
		t.Errorf("import errors = %v, want none", res.Errors)
	}

	// 带 CAS 的那条被更新，空 CAS 的那条原样不动
	got, _ := repo.Get(withCASID)
	if got.Note != "别名：1,8-二氮杂双环[5.4.0]十一碳-7-烯" {
		t.Errorf("note = %q, want 别名写入带 CAS 的记录", got.Note)
	}
	other, _ := repo.Get(noCASID)
	if other.CAS != "" {
		t.Errorf("另一条记录 CAS = %q, want 保持为空", other.CAS)
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

func TestExportMaterials(t *testing.T) {
	d := newTestDB(t)
	repo := db.NewMaterialRepo(d)
	svc := NewExcelService(repo)

	// 插入物料与价格（苯：两条价格；乙醇：无价格）
	m1 := &models.Material{Name: "苯", CAS: "71-43-2", Formula: "C6H6", MolWeight: 78.11, Content: 99.8}
	id1, err := repo.Insert(m1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.InsertPrice(&models.Price{MaterialID: id1, Price: 8.5, Unit: "元/kg", Supplier: "S公司", Date: time.Date(2026, 8, 25, 0, 0, 0, 0, time.Local)}); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.InsertPrice(&models.Price{MaterialID: id1, Price: 9.0, Unit: "元/kg", Supplier: "T公司", Date: time.Date(2026, 8, 20, 0, 0, 0, 0, time.Local)}); err != nil {
		t.Fatal(err)
	}
	m2 := &models.Material{Name: "乙醇", CAS: "64-17-5", Formula: "C2H6O", MolWeight: 46.07}
	if _, err := repo.Insert(m2); err != nil {
		t.Fatal(err)
	}

	// ---- 最新价格模式 ----
	data, err := svc.ExportMaterials(false)
	if err != nil {
		t.Fatalf("export latest: %v", err)
	}
	f, _ := excelize.OpenReader(bytesReader(data))
	rows, _ := f.GetRows("Sheet1")
	if len(rows) != 3 {
		t.Fatalf("latest rows = %d, want 3 (header + 苯 + 乙醇)", len(rows))
	}
	// 表头与导入模板一致
	for i, h := range templateHeaders {
		if rows[0][i] != h {
			t.Errorf("export header[%d] = %q, want %q (与导入模板一致)", i, rows[0][i], h)
		}
	}
	// 行序按名称排序：乙醇 在 苯 之前
	if rows[1][0] != "乙醇" || rows[2][0] != "苯" {
		t.Fatalf("latest row order: %v / %v", rows[1], rows[2])
	}
	// 乙醇（无价格）：价格列为空（GetRows 会裁剪尾部空单元格，需判长度）
	if rows[1][1] != "64-17-5" || (len(rows[1]) > 4 && rows[1][4] != "") {
		t.Errorf("乙醇 row = %v", rows[1])
	}
	// 苯（最新价 8.5，2026-08-25 最新）
	if rows[2][4] != "8.5" || rows[2][7] != "2026-08-25" || rows[2][6] != "S公司" {
		t.Errorf("苯 latest row = %v", rows[2])
	}

	// ---- 全部价格模式 ----
	data2, err := svc.ExportMaterials(true)
	if err != nil {
		t.Fatalf("export all: %v", err)
	}
	f2, _ := excelize.OpenReader(bytesReader(data2))
	rows2, _ := f2.GetRows("Sheet1")
	// 表头 + 乙醇(1行) + 苯(2条价格) = 4 行
	if len(rows2) != 4 {
		t.Fatalf("all rows = %d, want 4 (header + 乙醇 + 苯×2条价格)", len(rows2))
	}
	// 苯的两条价格都在
	benzRows := 0
	for _, r := range rows2 {
		if r[0] == "苯" {
			benzRows++
		}
	}
	if benzRows != 2 {
		t.Errorf("苯 all rows = %d, want 2", benzRows)
	}
}

func bytesReader(b []byte) *strings.Reader {
	return strings.NewReader(string(b))
}
