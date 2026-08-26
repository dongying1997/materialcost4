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

	"materialcost4/internal/db"
	"materialcost4/internal/models"
)

// ExcelService 提供 Excel 批量导入物料与价格、模板下载。
type ExcelService struct {
	repo *db.MaterialRepo
}

func NewExcelService(repo *db.MaterialRepo) *ExcelService {
	return &ExcelService{repo: repo}
}

// templateHeaders 模板表头（标准列名）。
var templateHeaders = []string{"物料名称", "CAS号", "化学式", "分子量", "价格", "价格单位", "供应商", "日期", "规格", "含量", "备注"}

// headerAliases 表头别名容错匹配。
var headerAliases = map[string][]string{
	"物料名称": {"物料名称", "物料", "名称", "品名", "物料名"},
	"CAS号":   {"cas号", "cas", "cas no", "cas no."},
	"化学式":   {"化学式", "分子式", "化学结构式"},
	"分子量":   {"分子量", "mol weight", "mw", "分子量(g/mol)"},
	"价格":     {"价格", "单价", "价格(元)", "price"},
	"价格单位": {"价格单位", "单位", "price unit", "币种单位"},
	"供应商":   {"供应商", "厂商", "supplier", "货商"},
	"日期":     {"日期", "时间", "date", "报价日期", "价格日期"},
	"规格":     {"规格", "spec", "规格型号"},
	"含量":     {"含量", "纯度", "含量%", "assay", "纯度%"},
	"备注":     {"备注", "note", "注释", "说明"},
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
	example := []any{"甲醇", "67-56-1", "CH4O", "32.04", "3.5", "元/kg", "示例供应商", "2026-08-25", "AR", "99.5", "示例"}
	_ = f.SetSheetRow(sheet, "A2", &example)
	// 列宽
	_ = f.SetColWidth(sheet, "A", "K", 18)
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
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

	for idx, row := range rows[1:] {
		lineNo := idx + 2
		rowStr := fmt.Sprintf("第 %d 行", lineNo)
		get := func(std string) string {
			if c, ok := colMap[std]; ok && c < len(row) {
				return strings.TrimSpace(row[c])
			}
			return ""
		}
		cas := get("CAS号")
		if cas == "" {
			result.Skipped++
			result.Errors = append(result.Errors, rowStr+"：缺少 CAS 号，已跳过")
			continue
		}

		// 解析物料字段
		material := &models.Material{
			Name:      get("物料名称"),
			CAS:       cas,
			Formula:   get("化学式"),
			MolWeight: parseFloat(get("分子量")),
			Content:   parseFloat(get("含量")),
			Note:      get("备注"),
		}

		// 按 CAS 导入物料：已有则更新基础字段，无则新增
		existing, err := s.repo.GetByCAS(cas)
		if err != nil {
			result.Errors = append(result.Errors, rowStr+"：查询物料失败 "+err.Error())
			continue
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
			material.ID = existing.ID
			// 更新名称/化学式/分子量等字段（CAS 不变）
			if material.Name != "" {
				existing.Name = material.Name
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
		p := &models.Price{
			MaterialID: material.ID,
			Price:      priceVal,
			Unit:       unit,
			Supplier:   get("供应商"),
			Spec:       get("规格"),
			Content:    parseFloat(get("含量")),
			Note:       get("备注"),
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


