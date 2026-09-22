package service

import (
	"bytes"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/xuri/excelize/v2"

	"github.com/dongying1997/materialcost4/internal/db"
	"github.com/dongying1997/materialcost4/internal/models"
)

// ExcelService 提供 Excel 批量导入物料与价格、模板下载。
type ExcelService struct {
	repo *db.MaterialRepo
}

func NewExcelService(repo *db.MaterialRepo) *ExcelService {
	return &ExcelService{repo: repo}
}

// templateHeaders 模板表头（标准列名）。
var templateHeaders = []string{"物料名称", "CAS号", "化学式", "分子量", "物料备注", "价格", "价格单位", "数量级", "供应商", "日期", "规格", "含量", "价格备注"}

// headerAliases 表头别名容错匹配。
var headerAliases = map[string][]string{
	"物料名称": {"物料名称", "物料", "名称", "品名", "物料名"},
	"CAS号": {"cas号", "cas", "cas no", "cas no."},
	"化学式":  {"化学式", "分子式", "化学结构式"},
	"分子量":  {"分子量", "mol weight", "mw", "分子量(g/mol)"},
	"价格":   {"价格", "单价", "价格(元)", "price"},
	"价格单位": {"价格单位", "单位", "price unit", "币种单位"},
	"供应商":  {"供应商", "厂商", "supplier", "货商"},
	"日期":   {"日期", "时间", "date", "报价日期", "价格日期"},
	"数量级":  {"数量级", "规模", "采购数量级", "采购规模", "price scale", "scale", "pack size"},
	"规格":   {"规格", "spec", "规格型号"},
	"含量":   {"含量", "纯度", "含量%", "assay", "纯度%"},
	// 两个备注列必须排在裸「备注」之前：matchHeader 遍历 map 的顺序是随机的，
	// 若裸「备注」先被匹配，它就会把标题为「物料备注」的列整个占走（反之亦然）。
	// 有了这两条，「物料备注」「价格备注」各自是确定命中的，撞车概率随之降到最低。
	"物料备注": {"物料备注", "物料备注信息", "material note"},
	"价格备注": {"价格备注", "价格备注信息", "报价备注", "price note"},
	// 裸「备注」是拆分之前的旧模板写法，现在退化成价格备注的别名；
	// 这两个通名仍留着，让「注释」「说明」这类旧表头继续有去处（见 noteColumn）。
	"备注": {"备注", "note", "注释", "说明"},
}

// normalizeHeader 将表头标准化（小写、去空格、去括号）。
func normalizeHeader(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "（", "(")
	s = strings.ReplaceAll(s, "）", ")")
	s = strings.ReplaceAll(s, "_", "")
	return s
}

// matchHeader 在 aliases 中查找表头对应的标准列，找不到返回 ""。
func matchHeader(cell string) string {
	n := normalizeHeader(cell)
	for std, al := range headerAliases {
		if n == normalizeHeader(std) {
			return std
		}
		for _, a := range al {
			if n == normalizeHeader(a) {
				return std
			}
		}
	}
	return ""
}

// ImportResult 导入结果。
type ImportResult struct {
	// 导入的物料数
	MaterialsImported int `json:"materialsImported"`
	// 更新的物料数（CAS 已存在）
	MaterialsUpdated int `json:"materialsUpdated"`
	// 导入的价格记录数
	PricesImported int `json:"pricesImported"`
	// 跳过的行（缺少 CAS）
	Skipped int `json:"skipped"`
	// 解析错误
	Errors []string `json:"errors"`
}

// DownloadTemplate 生成导入模板（xlsx 字节）。
func (s *ExcelService) DownloadTemplate() ([]byte, error) {
	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	headers := make([]any, len(templateHeaders))
	for i, h := range templateHeaders {
		headers[i] = h
	}
	_ = f.SetSheetRow(sheet, "A1", &headers)
	// 示例行
	example := []any{"甲醇", "67-56-1", "CH4O", "32.04", "示例", "3.5", "元/kg", models.PriceScaleKg, "示例供应商", "2026-08-25", "AR", "99.5", "示例"}
	_ = f.SetSheetRow(sheet, "A2", &example)
	_ = f.SetColWidth(sheet, "A", "M", 18)
	// 数量级列做成下拉：这一列是枚举，手输容易写成「KG」「1吨」这类
	// 需要归一化的写法——下拉从源头避开，同时仍允许手输（导入时会归一化）。
	if err := addPriceScaleValidation(f, sheet); err != nil {
		return nil, err
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// addPriceScaleValidation 在模板的「数量级」列加数据有效性下拉，
// 覆盖到第 500 行——够普通导入用，且不必随用户增删行维护。
// 列号由 columnOfHeader 现算，不写死：插一列就该自动跟着挪。
func addPriceScaleValidation(f *excelize.File, sheet string) error {
	col, err := columnOfHeader(f, sheet, "数量级")
	if err != nil || col == "" {
		return err
	}
	dv := excelize.NewDataValidation(true)
	dv.SetSqref(col + "2:" + col + "500")
	dv.SetError(excelize.DataValidationErrorStyleStop, "数量级取值无效",
		"请从下拉中选择："+strings.Join(models.PriceScales[1:], "、"))
	if err := dv.SetDropList(models.PriceScales[1:]); err != nil {
		return err
	}
	return f.AddDataValidation(sheet, dv)
}

// columnOfHeader 在表头行里找标准列名所在的列字母，找不到返回空串。
func columnOfHeader(f *excelize.File, sheet, header string) (string, error) {
	rows, err := f.GetRows(sheet)
	if err != nil || len(rows) == 0 {
		return "", err
	}
	for i, cell := range rows[0] {
		if matchHeader(cell) == header {
			name, err := excelize.ColumnNumberToName(i + 1)
			if err != nil {
				return "", err
			}
			return name, nil
		}
	}
	return "", nil
}

// DownloadTemplateToFile 生成导入模板，弹出保存对话框并写入文件。
// 桌面 WebView 不支持前端 a[download] 下载，因此由后端完成文件保存。
// 返回保存的文件路径（用户取消时为空字符串）。
func (s *ExcelService) DownloadTemplateToFile() (string, error) {
	data, err := s.DownloadTemplate()
	if err != nil {
		return "", fmt.Errorf("生成模板失败：%w", err)
	}
	app := application.Get()
	if app == nil {
		return "", fmt.Errorf("应用未就绪")
	}
	path, err := app.Dialog.SaveFile().SetFilename("物料导入模板.xlsx").
		AddFilter("Excel 文件", "*.xlsx").
		PromptForSingleSelection()
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // 用户取消
	}
	if filepath.Ext(path) == "" {
		path += ".xlsx"
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", fmt.Errorf("写入文件失败：%w", err)
	}
	return path, nil
}

// exportHeaders 物料导出表头：与导入模板 templateHeaders 保持一致，保证可回导。
var exportHeaders = templateHeaders

// ExportMaterials 导出全部物料为 xlsx 字节。
// allPrices 为 false 时每物料一行（当前最新价格）；true 时每条价格记录一行（物料字段重复，无价格物料也出一行）。
func (s *ExcelService) ExportMaterials(allPrices bool) ([]byte, error) {
	list, err := s.repo.ListWithPrice("")
	if err != nil {
		return nil, err
	}
	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	headers := make([]any, len(exportHeaders))
	for i, h := range exportHeaders {
		headers[i] = h
	}
	_ = f.SetSheetRow(sheet, "A1", &headers)

	row := 2
	for _, m := range list {
		// 价格记录：最新模式取单条，全部模式取所有（降序）
		type priceRow struct {
			price, unit, priceScale, supplier, spec, note string
			date                                          string
			content                                       float64
		}
		var prices []priceRow
		if allPrices {
			ps, err := s.repo.ListPrices(m.ID, "")
			if err != nil {
				return nil, err
			}
			for _, p := range ps {
				prices = append(prices, priceRow{
					price: fmt.Sprintf("%g", p.Price), unit: p.Unit, priceScale: p.PriceScale,
					supplier: p.Supplier, spec: p.Spec, note: p.Note,
					date: p.Date.Format("2006-01-02"), content: p.Content,
				})
			}
		} else if m.PriceCount > 0 {
			prices = append(prices, priceRow{
				price: fmt.Sprintf("%g", m.Price), unit: m.PriceUnit, priceScale: m.PriceScale,
				supplier: m.Supplier, date: m.PriceDate, content: m.Content,
			})
		}

		if len(prices) == 0 {
			// 无价格：仍输出一行物料，价格列为空
			_ = f.SetSheetRow(sheet, fmt.Sprintf("A%d", row), &[]any{m.Name, m.CAS, m.Formula, numOrEmpty(m.MolWeight), m.Note, "", "", "", "", "", "", numOrEmpty(m.Content), ""})
			row++
			continue
		}
		for _, p := range prices {
			_ = f.SetSheetRow(sheet, fmt.Sprintf("A%d", row), &[]any{m.Name, m.CAS, m.Formula, numOrEmpty(m.MolWeight), m.Note, p.price, p.unit, p.priceScale, p.supplier, p.date, p.spec, numOrEmpty(p.content), p.note})
			row++
		}
	}

	// 列宽
	_ = f.SetColWidth(sheet, "A", "M", 18)
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ExportMaterialsToFile 导出全部物料，弹出保存对话框并写入文件。
// allPrices 为 false 时导出最新价格，true 时导出所有价格（多条时每价格一行）。
// 桌面 WebView 不支持前端 a[download] 下载，因此由后端完成文件保存。
// 返回保存的文件路径（用户取消时为空字符串）。
func (s *ExcelService) ExportMaterialsToFile(allPrices bool) (string, error) {
	data, err := s.ExportMaterials(allPrices)
	if err != nil {
		return "", fmt.Errorf("生成导出文件失败：%w", err)
	}
	app := application.Get()
	if app == nil {
		return "", fmt.Errorf("应用未就绪")
	}
	filename := "物料清单.xlsx"
	if allPrices {
		filename = "物料清单-全部价格.xlsx"
	}
	path, err := app.Dialog.SaveFile().SetFilename(filename).
		AddFilter("Excel 文件", "*.xlsx").
		PromptForSingleSelection()
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // 用户取消
	}
	if filepath.Ext(path) == "" {
		path += ".xlsx"
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", fmt.Errorf("写入文件失败：%w", err)
	}
	return path, nil
}

// aliasPrefix 备注里别名段的标记，便于重复导入时不重复追加。
const aliasPrefix = "别名："

// appendAlias 把别名追加到备注；已记录过的别名不重复追加。
// 备注里可能已有用户自己写的内容，因此用「；」分隔而不是覆盖。
func appendAlias(note, alias string) string {
	if alias == "" {
		return note
	}
	note = strings.TrimSpace(note)
	if strings.Contains(note, aliasPrefix+alias) {
		return note // 该别名已记录过
	}
	entry := aliasPrefix + alias
	if note == "" {
		return entry
	}
	return note + "；" + entry
}

// numOrEmpty 将 0 值数字转为空字符串（导出更清爽）。
func numOrEmpty(v float64) any {
	if v == 0 {
		return ""
	}
	return v
}

// ImportFromBytes 解析 Excel 并导入物料与价格。
func (s *ExcelService) ImportFromBytes(data []byte, filename string) (*ImportResult, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("无法解析 Excel 文件：%w", err)
	}
	defer f.Close()

	result := &ImportResult{}
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("Excel 中没有工作表")
	}
	// 取第一个工作表
	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("Excel 中没有数据行")
	}

	// 表头行
	headerRow := rows[0]
	// 标准列 -> 列索引
	colMap := map[string]int{}
	for i, cell := range headerRow {
		if std := matchHeader(cell); std != "" {
			colMap[std] = i
		}
	}
	if _, ok := colMap["CAS号"]; !ok {
		return nil, fmt.Errorf("未找到 CAS 列（表头请使用「CAS」或「CAS号」等）")
	}
	// 两个标准列抢同一格时，整列数据会按后写的那条读——静默读错比报错难查得多，
	// 所以在做任何写入之前先拒掉。只有表头本身就是「备注」这种含混写法才会触发：
	// 带前缀的「物料备注」「价格备注」在别名表里各自确定命中，撞不上。
	for _, conflict := range [][2]string{
		{"数量级", "备注"}, {"物料备注", "备注"}, {"价格备注", "备注"}, {"物料备注", "价格备注"},
	} {
		a, okA := colMap[conflict[0]]
		b, okB := colMap[conflict[1]]
		if okA && okB && a == b {
			return nil, fmt.Errorf("表头「%s」与「%s」指向同一列，请改用完整表头（见导入模板）", conflict[0], conflict[1])
		}
	}

	for idx, row := range rows[1:] {
		lineNo := idx + 2
		rowStr := fmt.Sprintf("第 %d 行", lineNo)
		get := func(std string) string {
			if c, ok := colMap[std]; ok && c < len(row) {
				return strings.TrimSpace(row[c])
			}
			return ""
		}
		// “物料名称”作为必须字段
		materialName := get("物料名称")
		if materialName == "" {
			result.Skipped++
			result.Errors = append(result.Errors, rowStr+"：缺少物料名称，已跳过")
			continue
		}

		// 备注拆成了两列：一列给物料，一列给这条价格记录。
		// 裸「备注」列只当价格备注用（见 noteColumn）。
		materialNote := noteColumn(get, "物料备注")
		priceNote := noteColumn(get, "价格备注")

		// 解析物料字段
		material := &models.Material{
			Name:      get("物料名称"),
			CAS:       get("CAS号"),
			Formula:   get("化学式"),
			MolWeight: parseFloat(get("分子量")),
			Content:   parseFloat(get("含量")),
			Note:      materialNote,
		}

		// 匹配库中已有物料：先按名称，再按 CAS。
		// 两者都要查——同一物质常以不同写法分别存在（如「对苯醌」/「1,4-苯醌」、
		// 「DBU」/「1,8-二氮杂双环[5.4.0]十一碳-7-烯」各存了一条），只按名称匹配
		// 会把别名行误判成新物料，进而撞上 CAS 唯一索引。
		byName, err := s.repo.GetByName(materialName)
		if err != nil {
			result.Errors = append(result.Errors, rowStr+"：查询物料失败 "+err.Error())
			continue
		}
		var byCAS *models.Material
		if material.CAS != "" {
			if byCAS, err = s.repo.GetByCAS(material.CAS); err != nil {
				result.Errors = append(result.Errors, rowStr+"：查询物料失败 "+err.Error())
				continue
			}
		}
		// 与 Excel 行 CAS 一致的记录才是同一物质，优先用它，
		// 否则同一物质的两条记录会各自被补上对方的 CAS 而互相冲突。
		existing := byCAS
		if existing == nil {
			existing = byName
		}
		if existing != nil {
			// 库中名称与 Excel 不同 → 是别名，记到备注（保留库中名称）
			if existing.Name != materialName && (byCAS != nil || material.CAS != "") {
				existing.Note = appendAlias(existing.Note, materialName)
			}
		}
		if existing == nil {
			id, err := s.repo.Insert(material)
			if err != nil {
				result.Errors = append(result.Errors, rowStr+"：新增物料失败 "+err.Error())
				continue
			}
			material.ID = id
			result.MaterialsImported++
		} else {
			// 更新CAS/化学式/分子量等字段（Name 保持不变，沿用库中的名称）
			if material.CAS != "" {
				existing.CAS = material.CAS
			}
			if material.Formula != "" {
				existing.Formula = material.Formula
			}
			if material.MolWeight > 0 {
				existing.MolWeight = material.MolWeight
			}
			if material.Content > 0 {
				existing.Content = material.Content
			}
			// 仅当这行就是该物料的正式名称时才用 Excel 的备注，
			// 否则会把上一步写进去的别名覆盖掉
			if existing.Name == materialName && material.Note != "" {
				existing.Note = material.Note
			}
			if err := s.repo.Update(existing); err != nil {
				result.Errors = append(result.Errors, rowStr+"：更新物料失败 "+err.Error())
				continue
			}
			material.ID = existing.ID
			result.MaterialsUpdated++
		}

		// 解析价格字段（可选）
		priceStr := get("价格")
		if priceStr == "" {
			continue
		}
		priceVal := parseFloat(priceStr)
		if priceVal <= 0 {
			result.Errors = append(result.Errors, rowStr+"：价格无效，已跳过价格导入")
			continue
		}
		unit := get("价格单位")
		if unit == "" {
			unit = "元/kg"
		}
		// 数量级认不出的写法不静默丢弃：这列是用户显式填的，闷掉等于让他以为导入成功了
		priceScale := models.NormalizePriceScale(get("数量级"))
		if !models.IsPriceScale(priceScale) {
			result.Errors = append(result.Errors, fmt.Sprintf(
				"%s：数量级「%s」无法识别，已跳过价格导入（可选值：%s）",
				rowStr, get("数量级"), strings.Join(models.PriceScales[1:], "、")))
			continue
		}
		p := &models.Price{
			MaterialID: material.ID,
			Price:      priceVal,
			Unit:       unit,
			PriceScale: priceScale,
			Supplier:   get("供应商"),
			Spec:       get("规格"),
			Content:    parseFloat(get("含量")),
			Note:       priceNote,
		}
		dateStr := get("日期")
		p.Date, err = parseDateFlexible(dateStr, f, sheets[0], colMap["日期"], lineNo)
		if err != nil {
			result.Errors = append(result.Errors, rowStr+"：日期解析失败 "+err.Error())
			continue
		}
		if p.Date.IsZero() {
			p.Date = time.Now()
		}
		if _, err := s.repo.InsertPrice(p); err != nil {
			result.Errors = append(result.Errors, rowStr+"：导入价格失败 "+err.Error())
			continue
		}
		result.PricesImported++
	}

	return result, nil
}

// noteColumn 取某个备注列的内容：先认自己的专用列（「物料备注」/「价格备注」），
// 没有才退回裸「备注」。
//
// 裸「备注」只归价格备注：它是拆分之前模板里唯一的一列，那时无论填什么都会
// 同时写进物料和价格。拆分后它退化成价格备注的别名——不再往物料上写，
// 免得一份内容在两处各存一份（保存方案时会一起带走）。
// 专用列有值就不回退，否则裸列的残值会盖掉用户明确写的那一列。
func noteColumn(get func(string) string, dedicated string) string {
	if v := get(dedicated); v != "" {
		return v
	}
	if dedicated == "价格备注" {
		return get("备注")
	}
	return ""
}

// parseDateFlexible 解析日期：支持字符串（2026-08-25）、Excel 序列号，
// 以及被单元格格式渲染成字符串的日期（如 08-25-26）——这类按原始序列号回退解析。
// sheet/colIdx/rowIdx 用于定位单元格读取原始值；传 0 时跳过回退。
func parseDateFlexible(s string, f *excelize.File, sheet string, colIdx, rowIdx int) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, nil
	}
	// 字符串日期
	if !isNumeric(s) {
		for _, layout := range []string{"2006-01-02", "2006/01/02", "2006.01.02", "2006-1-2", "1/2/2006", "2006-01-02 15:04:05"} {
			if t, err := time.Parse(layout, s); err == nil {
				return t, nil
			}
		}
		// 被 Excel 渲染成自定义日期格式的字符串（如 08-25-26）：回退读单元格原始序列号
		if f != nil && sheet != "" && colIdx > 0 && rowIdx > 0 {
			if cell, err := excelize.CoordinatesToCellName(colIdx+1, rowIdx); err == nil {
				if raw, err := f.GetCellValue(sheet, cell, excelize.Options{RawCellValue: true}); err == nil && isNumeric(raw) {
					if t, err := serialToTime(raw); err == nil {
						return t, nil
					}
				}
			}
		}
		return time.Time{}, fmt.Errorf("不支持的日期格式 %q", s)
	}
	return serialToTime(s)
}

// serialToTime 将 Excel 序列号（1900 日期系统）转换为时间。
func serialToTime(s string) (time.Time, error) {
	serial, err := parseFloatE(s)
	if err != nil || serial <= 0 {
		return time.Time{}, fmt.Errorf("无效的日期 %q", s)
	}
	if serial > 100000 {
		return time.Time{}, fmt.Errorf("日期数值过大 %q", s)
	}
	// 序列号的小数部分是当天的时刻（如 0.5 = 12:00）
	days := int(serial)
	frac := serial - float64(days)
	// Excel 序列号 -> 时间（1900-01-01 前是闰年 bug，统一用 1899-12-30 基准）。
	// 用整数天数累加避免 float64 乘法带来的精度损失（float64(24h)*n 会差几十分钟）。
	base := time.Date(1899, 12, 30, 0, 0, 0, 0, time.Local)
	t := base.AddDate(0, 0, days).Add(time.Duration(frac * float64(24*time.Hour)))
	return t, nil
}

func isNumeric(s string) bool {
	// 严格判断：整体由数字组成、最多一个小数点（且不在首尾），才算数值（Excel 序列号）。
	// 不能用 fmt.Sscanf("%f") 判断——它只匹配前缀，会把 "2026-08-25" 误判为数字 2026。
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	dot := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			continue
		}
		if c == '.' {
			dot++
			continue
		}
		return false
	}
	return dot <= 1 && !strings.HasPrefix(s, ".") && !strings.HasSuffix(s, ".")
}

func parseFloat(s string) float64 {
	v, _ := parseFloatE(s)
	return v
}

func parseFloatE(s string) (float64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, nil
	}
	var v float64
	_, err := fmt.Sscanf(s, "%f", &v)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, fmt.Errorf("invalid number")
	}
	return v, nil
}
