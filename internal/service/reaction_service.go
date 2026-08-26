package service

import (
	"fmt"

	"materialcost4/internal/db"
	"materialcost4/internal/engine"
	"materialcost4/internal/models"
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
