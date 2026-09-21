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

// SchemeService 方案管理服务：方案 CRUD 与 JSON 导入 / 导出。
type SchemeService struct {
	schemeRepo *db.SchemeRepo
}

func NewSchemeService(schemeRepo *db.SchemeRepo) *SchemeService {
	return &SchemeService{schemeRepo: schemeRepo}
}

// SchemeSummary 方案列表项：方案元信息 + 由内联计算得出的结果摘要。
//
// 列表页只关心「哪个方案、最终产物叫什么、单位成本多少」，
// 不需要每个方案完整的 steps（那是载入时才拉的数据）；顺带省掉把全部
// steps 序列化传给前端的开销。
type SchemeSummary struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Note      string    `json:"note"`
	StepCount int       `json:"stepCount"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	// ---- 结果摘要（来自内联计算，未持久化；方案参数变更后自动跟随）----

	// HasResult 是否算出了结果。false 时列表显示「-」，
	// 具体原因见 BlockingErrors / Errors。
	HasResult bool `json:"hasResult"`
	// ProductName 最终产物名（最后一步主产物的名称）
	ProductName string `json:"productName"`
	// UnitCost 最终产物单位成本（元/kg）= 总成本 ÷ 总产量
	UnitCost float64 `json:"unitCost"`
	// TotalCost 总成本（元）
	TotalCost float64 `json:"totalCost"`
	// TotalYieldKg 总产量（kg）
	TotalYieldKg float64 `json:"totalYieldKg"`
	// BlockingErrors 计算被阻塞的原因（如「底物缺少分子量」「底物投料量需大于 0」）
	BlockingErrors []string `json:"blockingErrors"`
	// Errors 计算本身失败时的原因（与 BlockingErrors 区分：这是服务层错误）
	Errors []string `json:"errors"`
}

// ListSchemes 方案列表（含结果摘要）。
//
// 方案只持久化输入、不存计算结果，因此这里对每个方案跑一次纯函数计算取摘要。
// 这样结果永远与方案内容一致，不会出现「改了方案但列表还是旧单价」的陈旧数据。
// 计算失败不影响列表本身：原因写进摘要，列表照常返回。
func (s *SchemeService) ListSchemes() ([]*SchemeSummary, error) {
	schemes, err := s.schemeRepo.List()
	if err != nil {
		return nil, err
	}
	out := make([]*SchemeSummary, 0, len(schemes))
	for _, sch := range schemes {
		out = append(out, summarizeScheme(sch))
	}
	return out, nil
}

// summarizeScheme 由方案算出结果摘要。纯函数，不读物料库。
func summarizeScheme(sch *models.Scheme) *SchemeSummary {
	sum := &SchemeSummary{
		ID: sch.ID, Name: sch.Name, Note: sch.Note,
		StepCount: len(sch.Steps),
		CreatedAt: sch.CreatedAt, UpdatedAt: sch.UpdatedAt,
		BlockingErrors: []string{}, Errors: []string{},
	}
	if len(sch.Steps) == 0 {
		sum.BlockingErrors = append(sum.BlockingErrors, "方案没有任何步骤")
		return sum
	}
	// 注意：CalculateMultiStep 注入继承原料时会写回 steps 的元素
	// （injectInheritedReagent 里的 step := steps[i] 只复制了切片头，
	//   step.Reagents[j] 与调用方共享底层数组）。这里不深拷贝是安全的，
	// 因为 sch.Steps 是 schemeRepo.List() 每次从 JSON 新反序列化出来的副本，
	// 摘要是算出即弃的，改动不会外泄到别处（与 ReactionService.Calculate 同理）。
	res := engine.CalculateMultiStep(sch.Steps)

	last := res.Steps[len(res.Steps)-1]
	if last.PrimaryProduct != nil {
		sum.ProductName = last.PrimaryProduct.Name
	} else {
		// 通常引擎会把未命名的产物回退成「产物」，但用户既没命名、计算又没跑通时
		// PrimaryProduct 可能是空的，这里直接从输入里取，保证名称与输入一致且不带兜底文案。
		sum.ProductName = lastProductName(sch.Steps[len(sch.Steps)-1])
	}
	sum.TotalCost = res.TotalCost
	sum.TotalYieldKg = res.TotalYieldKg
	sum.UnitCost = res.TotalUnitCost
	// 产量与成本都算得出来，单位成本才有意义：
	// 只算出产量而成本为 0（没填任何单价），展示「0 元/kg」是误导而不是结果。
	sum.HasResult = res.TotalYieldKg > 0 && res.TotalCost > 0

	// 收集阻塞原因（各步展开），供列表用 Tooltip 说明为什么算不出来
	for i, sr := range res.Steps {
		if sr == nil {
			continue
		}
		for _, e := range sr.BlockingErrors {
			sum.BlockingErrors = append(sum.BlockingErrors, fmt.Sprintf("步骤 %d：%s", i+1, e))
		}
	}
	// 没有阻塞错误却仍算不出结果时，要区分「产量没算出来」与「成本为 0」，
	// 否则用户看到「缺少可计算的数据」会去反复检查已经填好的产量参数。
	if !sum.HasResult && len(sum.BlockingErrors) == 0 {
		if res.TotalYieldKg <= 0 {
			sum.BlockingErrors = append(sum.BlockingErrors,
				"缺少可计算的数据（请填写底物投料量、分子量与产物收率）")
		} else {
			sum.BlockingErrors = append(sum.BlockingErrors,
				"成本为 0：尚未填写任何原料的单价")
		}
	}
	return sum
}

// lastProductName 取最后一步主产物的名称（未命名时返回空串，由调用方决定如何展示）。
func lastProductName(step models.ReactionStep) string {
	for i := range step.Products {
		if step.Products[i].IsSubstrate {
			return step.Products[i].Name
		}
	}
	return ""
}

// GetScheme 获取单个方案。
func (s *SchemeService) GetScheme(id int64) (*models.Scheme, error) {
	return s.schemeRepo.Get(id)
}

// SaveScheme 保存方案（id 为 0 时新增）。
func (s *SchemeService) SaveScheme(sch *models.Scheme) (*models.Scheme, error) {
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
func (s *SchemeService) DeleteScheme(id int64) error {
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
func (s *SchemeService) ExportSchemesToFile(ids []int64) (string, error) {
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
func (s *SchemeService) ExportSchemes(ids []int64) (*SchemeExportFile, error) {
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
func (s *SchemeService) ImportSchemesFromFile() (*SchemeImportResult, error) {
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
func (s *SchemeService) ImportSchemes(data []byte) (*SchemeImportResult, error) {
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
