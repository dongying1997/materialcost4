package service

import (
	"encoding/json"
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

// Calculate 执行反应成本计算。计算前会自动：
//  1. 为每个原料从物料库填充名称/分子量/含量/回收率等信息
//  2. 将所选价格记录（或最新价格）换算为 元/kg 单价
func (s *ReactionService) Calculate(input CalculateInput) (*engine.MultiStepResult, error) {
	steps, err := s.enrichSteps(input.Steps)
	if err != nil {
		return nil, err
	}
	return engine.CalculateMultiStep(steps), nil
}

// enrichSteps 为每一步的原料补充物料库信息与价格。
func (s *ReactionService) enrichSteps(steps []models.ReactionStep) ([]models.ReactionStep, error) {
	out := make([]models.ReactionStep, len(steps))
	for i, step := range steps {
		reagents := make([]models.ReagentInput, len(step.Reagents))
		for j, r := range step.Reagents {
			reagents[j] = r
			if r.Inherited {
				continue // 继承原料保持前端传入的值（引擎会填充单价/分子量）
			}
			if r.MaterialID <= 0 {
				continue // 手动输入的原料（未从物料库选择），保持原值
			}
			mat, err := s.materialRepo.Get(r.MaterialID)
			if err != nil {
				return nil, err
			}
			if mat != nil {
				reagents[j].Name = mat.Name
				reagents[j].CAS = mat.CAS
				reagents[j].Formula = mat.Formula
				reagents[j].MolWeight = mat.MolWeight
				if r.Content == 0 {
					reagents[j].Content = mat.Content
				}
				if r.RecoveryRate == 0 && mat.RecoveryRate > 0 {
					reagents[j].RecoveryRate = mat.RecoveryRate
				}
				// 价格：优先前端选定的价格记录，否则自动取最新
				var price *models.Price
				if r.PriceSourceID > 0 {
					price, err = s.materialRepo.FindPrice(r.PriceSourceID)
					if err != nil {
						return nil, err
					}
				}
				if price == nil {
					price, _, err = s.materialRepo.LatestPrice(mat.ID)
					if err != nil {
						return nil, err
					}
				}
				if price != nil {
					unitPrice, warn := PriceToYuanPerKg(price.Price, price.Unit, mat.MolWeight)
					_ = warn // 警告会展示在前端
					reagents[j].UnitPriceYuanPerKg = &unitPrice
				}
			}
		}
		step.Reagents = reagents
		// 产物：填充物料库信息
		products := make([]models.ProductInput, len(step.Products))
		for j, p := range step.Products {
			products[j] = p
			if p.Inherited {
				continue
			}
			if p.MaterialID <= 0 {
				continue // 手动输入的产物，保持原值
			}
			mat, err := s.materialRepo.Get(p.MaterialID)
			if err != nil {
				return nil, err
			}
			if mat != nil {
				products[j].Name = mat.Name
				products[j].CAS = mat.CAS
				products[j].Formula = mat.Formula
				products[j].MolWeight = mat.MolWeight
			}
		}
		step.Products = products
		out[i] = step
	}
	return out, nil
}

// MaterialPriceOption 物料可选价格下拉项。
type MaterialPriceOption struct {
	PriceID     int64   `json:"priceId"`
	MaterialID  int64   `json:"materialId"`
	Price       float64 `json:"price"`
	Unit        string  `json:"unit"`
	PricePerKg  float64 `json:"pricePerKg"`
	Supplier    string  `json:"supplier"`
	Date        string  `json:"date"`
	Spec        string  `json:"spec"`
	Content     float64 `json:"content"`
}

// PriceOptionsForMaterial 返回某物料的价格选项（供前端下拉选择）。
func (s *ReactionService) PriceOptionsForMaterial(materialID int64) ([]MaterialPriceOption, error) {
	prices, err := s.materialRepo.ListPrices(materialID, "")
	if err != nil {
		return nil, err
	}
	mat, err := s.materialRepo.Get(materialID)
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

// SchemeExportFile 方案导出文件：JSON 数组，含导出信息字段，便于识别文件格式。
type SchemeExportFile struct {
	Version   int              `json:"version"`
	App       string           `json:"app"`
	ExportedAt string          `json:"exportedAt"`
	Schemes   []*models.Scheme `json:"schemes"`
}

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
		Version:    1,
		App:        "MaterialCost4",
		ExportedAt: time.Now().Format("2006-01-02 15:04:05"),
		Schemes:    []*models.Scheme{},
	}
	for _, sch := range all {
		if len(ids) == 0 || selected[sch.ID] {
			export.Schemes = append(export.Schemes, sch)
		}
	}
	return export, nil
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
// 兼容两种结构：数组（[scheme, ...]）或 {version, app, schemes:[...]} 包裹格式。
func (s *ReactionService) ImportSchemes(data []byte) (*SchemeImportResult, error) {
	result := &SchemeImportResult{Errors: []string{}}
	// 先尝试数组结构
	var list []*models.Scheme
	if err := json.Unmarshal(data, &list); err != nil {
		// 再尝试导出文件结构
		var file SchemeExportFile
		if err2 := json.Unmarshal(data, &file); err2 != nil || file.Schemes == nil {
			return nil, fmt.Errorf("无法解析 JSON 文件：不是有效的方案导出文件")
		}
		list = file.Schemes
	}
	if len(list) == 0 {
		return result, nil
	}
	for i, sch := range list {
		if sch == nil {
			continue
		}
		sch.ID = 0 // 导入为新建，避免覆盖已有方案
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
