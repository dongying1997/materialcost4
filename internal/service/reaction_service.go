package service

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/dongying1997/materialcost4/internal/db"
	"github.com/dongying1997/materialcost4/internal/engine"
	"github.com/dongying1997/materialcost4/internal/models"
)

// ReactionService 反应成本计算服务。
type ReactionService struct {
	materialRepo *db.MaterialRepo
	schemeRepo   *db.SchemeRepo
}

func NewReactionService(materialRepo *db.MaterialRepo, schemeRepo *db.SchemeRepo) *ReactionService {
	return &ReactionService{materialRepo: materialRepo, schemeRepo: schemeRepo}
}

// CalculateInput 计算请求。
type CalculateInput struct {
	Steps []models.ReactionStep `json:"steps"`
}

// Calculate 执行反应成本计算。
//
// 纯函数：完全不读物料库/价格库。方案自带全部输入（含价格快照），
// 因此换机器、清空物料库都不影响已保存方案的计算结果。
func (s *ReactionService) Calculate(input CalculateInput) (*CalculateResult, error) {
	return &CalculateResult{
		MultiStepResult: *engine.CalculateMultiStep(input.Steps),
	}, nil
}

// CalculateResult 计算结果。
type CalculateResult struct {
	engine.MultiStepResult
}

// MaterialPriceOption 物料可选价格下拉项。
type MaterialPriceOption struct {
	PriceID    int64   `json:"priceId"`
	MaterialID int64   `json:"materialId"`
	Price      float64 `json:"price"`
	Unit       string  `json:"unit"`
	PricePerKg float64 `json:"pricePerKg"`
	Supplier   string  `json:"supplier"`
	Date       string  `json:"date"`
	Spec       string  `json:"spec"`
	Content    float64 `json:"content"`
}

// PriceOptionsForMaterial 返回某物料的价格选项（供前端下拉选择）。
//
// 这是「物料库仅作为查询来源」的入口：只在用户选物料/刷新价格/比对价格变动时调用，
// 计算路径完全不经过这里。
// 返回列表按报价日期倒序，因此 out[0] 即该物料在库中的最新价——
// 前端据此与方案自带的价格快照比对（差异阈值见前端 PRICE_DRIFT_THRESHOLD）。
// 物料已不在库中时返回空列表而不是报错。
func (s *ReactionService) PriceOptionsForMaterial(materialID int64) ([]MaterialPriceOption, error) {
	mat, err := s.materialRepo.Get(materialID)
	if errors.Is(err, sql.ErrNoRows) {
		return []MaterialPriceOption{}, nil
	}
	if err != nil {
		return nil, err
	}
	prices, err := s.materialRepo.ListPrices(materialID, "")
	if err != nil {
		return nil, err
	}
	out := make([]MaterialPriceOption, 0, len(prices))
	for _, p := range prices {
		perKg, _ := PriceToYuanPerKg(p.Price, p.Unit, mat.MolWeight)
		out = append(out, MaterialPriceOption{
			PriceID:    p.ID,
			MaterialID: p.MaterialID,
			Price:      p.Price,
			Unit:       p.Unit,
			PricePerKg: perKg,
			Supplier:   p.Supplier,
			Date:       p.Date.Format("2006-01-02"),
			Spec:       p.Spec,
			Content:    p.Content,
		})
	}
	return out, nil
}

// FormatMoney 暴露给前端格式化金额。
func (s *ReactionService) FormatMoney(v float64) string {
	return FormatMoney(v)
}

// ---- 方案管理 ----

// ListSchemes 方案列表。
func (s *ReactionService) ListSchemes() ([]*models.Scheme, error) {
	return s.schemeRepo.List()
}

// GetScheme 获取单个方案。
func (s *ReactionService) GetScheme(id int64) (*models.Scheme, error) {
	return s.schemeRepo.Get(id)
}

// SaveScheme 保存方案（id 为 0 时新增）。
func (s *ReactionService) SaveScheme(sch *models.Scheme) (*models.Scheme, error) {
	if sch.Name == "" {
		return nil, fmt.Errorf("方案名称不能为空")
	}
	if sch.ID == 0 {
		id, err := s.schemeRepo.Insert(sch)
		if err != nil {
			return nil, err
		}
		sch.ID = id
	} else {
		if err := s.schemeRepo.Update(sch); err != nil {
			return nil, err
		}
	}
	return s.schemeRepo.Get(sch.ID)
}

// DeleteScheme 删除方案。
func (s *ReactionService) DeleteScheme(id int64) error {
	return s.schemeRepo.Delete(id)
}

// ---- 方案 JSON 导出 / 导入 ----

// SchemeExportFile 方案导出文件。
//
// 导出内容是自足的：每行原料都带名称/分子式/分子量/含量/回收率以及价格快照，
// 不含任何物料库或价格库的 id（materialId 会被清空）。因此导出文件可直接
// 在另一台机器导入使用，无需目标机器存在同名物料，也不需要任何重连匹配。
type SchemeExportFile struct {
	Version    int              `json:"version"`
	App        string           `json:"app"`
	ExportedAt string           `json:"exportedAt"`
	Schemes    []*models.Scheme `json:"schemes"`
}

// schemeExportVersion 当前导出格式版本。
const schemeExportVersion = 2

// ExportSchemesToFile 将选中的方案导出为 JSON 文件，弹出保存对话框写入磁盘。
// ids 为空表示导出全部方案。返回保存的文件路径（用户取消时为空字符串）。
// 桌面 WebView 不支持前端 a[download] 下载，因此由后端完成文件保存。
func (s *ReactionService) ExportSchemesToFile(ids []int64) (string, error) {
	export, err := s.ExportSchemes(ids)
	if err != nil {
		return "", fmt.Errorf("生成导出文件失败：%w", err)
	}
	data, err := json.MarshalIndent(export, "", "  ")
	if err != nil {
		return "", fmt.Errorf("序列化失败：%w", err)
	}
	app := application.Get()
	if app == nil {
		return "", fmt.Errorf("应用未就绪")
	}
	path, err := app.Dialog.SaveFile().SetFilename("方案导出.json").
		AddFilter("JSON 文件", "*.json").
		PromptForSingleSelection()
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // 用户取消
	}
	if filepath.Ext(path) == "" {
		path += ".json"
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", fmt.Errorf("写入文件失败：%w", err)
	}
	return path, nil
}

// ExportSchemes 导出选中方案为 SchemeExportFile（纯函数，便于测试）。
func (s *ReactionService) ExportSchemes(ids []int64) (*SchemeExportFile, error) {
	selected := map[int64]bool{}
	for _, id := range ids {
		selected[id] = true
	}
	all, err := s.schemeRepo.List()
	if err != nil {
		return nil, err
	}
	export := &SchemeExportFile{
		Version:    schemeExportVersion,
		App:        "MaterialCost4",
		ExportedAt: time.Now().Format("2006-01-02 15:04:05"),
		Schemes:    []*models.Scheme{},
	}
	for _, sch := range all {
		if len(ids) == 0 || selected[sch.ID] {
			export.Schemes = append(export.Schemes, detachFromLibrary(sch))
		}
	}
	return export, nil
}

// detachFromLibrary 复制方案并剥离全部本地库 id，使其可在任意机器导入。
// 保留业务快照（名称/CAS/分子式/分子量/含量/回收率/价格快照），丢弃 materialId。
func detachFromLibrary(sch *models.Scheme) *models.Scheme {
	out := *sch
	out.Steps = make([]models.ReactionStep, len(sch.Steps))
	for i, st := range sch.Steps {
		ns := st
		ns.Reagents = make([]models.ReagentInput, len(st.Reagents))
		for j, r := range st.Reagents {
			nr := r
			nr.MaterialID = 0
			ns.Reagents[j] = nr
		}
		ns.Products = make([]models.ProductInput, len(st.Products))
		for j, p := range st.Products {
			np := p
			np.MaterialID = 0
			ns.Products[j] = np
		}
		out.Steps[i] = ns
	}
	return &out
}

// ImportSchemesFromFile 弹出打开对话框选择 JSON 文件并导入方案。
// 返回导入结果与出现的问题（文件为空或无方案时返回错误）。
func (s *ReactionService) ImportSchemesFromFile() (*SchemeImportResult, error) {
	app := application.Get()
	if app == nil {
		return nil, fmt.Errorf("应用未就绪")
	}
	path, err := app.Dialog.OpenFile().
		AddFilter("JSON 文件", "*.json").
		PromptForSingleSelection()
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil // 用户取消
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败：%w", err)
	}
	return s.ImportSchemes(data)
}

// SchemeImportResult 方案导入结果。
type SchemeImportResult struct {
	Imported int      `json:"imported"`
	Errors   []string `json:"errors"`
}

// ImportSchemes 解析 JSON 内容并导入方案（name 为空或 steps 为空的方案跳过）。
//
// 导入文件是自足的，不需要在目标库中解析或重连物料：materialId 一律清空，
// 计算直接用文件内的快照。这样跨机器导入不会出现 id 错指（静默算错钱）。
func (s *ReactionService) ImportSchemes(data []byte) (*SchemeImportResult, error) {
	result := &SchemeImportResult{Errors: []string{}}
	var file SchemeExportFile
	if err := json.Unmarshal(data, &file); err != nil || file.Schemes == nil {
		return nil, fmt.Errorf("无法解析 JSON 文件：不是有效的方案导出文件")
	}
	list := file.Schemes
	if len(list) == 0 {
		return result, nil
	}
	for i, sch := range list {
		if sch == nil {
			continue
		}
		sch.ID = 0 // 导入为新建，避免覆盖已有方案
		// 清空本地库引用：id 只在本机有意义，跨机器可能指向完全不同的物料
		for si := range sch.Steps {
			for ri := range sch.Steps[si].Reagents {
				sch.Steps[si].Reagents[ri].MaterialID = 0
			}
			for pi := range sch.Steps[si].Products {
				sch.Steps[si].Products[pi].MaterialID = 0
			}
		}
		if sch.Name == "" {
			result.Errors = append(result.Errors, fmt.Sprintf("第 %d 项：方案名称缺失，已跳过", i+1))
			continue
		}
		if sch.Steps == nil {
			sch.Steps = []models.ReactionStep{}
		}
		if _, err := s.schemeRepo.Insert(sch); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("第 %d 项「%s」导入失败：%s", i+1, sch.Name, err.Error()))
			continue
		}
		result.Imported++
	}
	return result, nil
}
