package service

import (
	"database/sql"
	"errors"

	"github.com/dongying1997/materialcost4/internal/db"
	"github.com/dongying1997/materialcost4/internal/engine"
	"github.com/dongying1997/materialcost4/internal/models"
)

// ReactionService 反应成本计算服务。
type ReactionService struct {
	materialRepo *db.MaterialRepo
}

func NewReactionService(materialRepo *db.MaterialRepo) *ReactionService {
	return &ReactionService{materialRepo: materialRepo}
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
