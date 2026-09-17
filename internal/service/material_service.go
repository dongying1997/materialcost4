package service

import (
	"fmt"

	"github.com/dongying1997/materialcost4/internal/db"
	"github.com/dongying1997/materialcost4/internal/models"
)

// MaterialService 物料与价格管理服务。
type MaterialService struct {
	repo *db.MaterialRepo
}

func NewMaterialService(repo *db.MaterialRepo) *MaterialService {
	return &MaterialService{repo: repo}
}

// ListMaterials 物料列表（附带最新价格）。
func (s *MaterialService) ListMaterials(keyword string) ([]*models.MaterialWithPrice, error) {
	return s.repo.ListWithPrice(keyword)
}

// GetMaterial 获取单个物料。
func (s *MaterialService) GetMaterial(id int64) (*models.Material, error) {
	return s.repo.Get(id)
}

// SaveMaterial 新增或更新物料。id 为 0 时新增。
func (s *MaterialService) SaveMaterial(m *models.Material) (*models.Material, error) {
	if m.Name == "" {
		return nil, fmt.Errorf("物料名称不能为空")
	}
	// CAS 查重（新增或改 CAS 时）
	if m.CAS != "" {
		existing, err := s.repo.GetByCAS(m.CAS)
		if err != nil {
			return nil, err
		}
		if existing != nil && existing.ID != m.ID {
			return nil, fmt.Errorf("CAS %s 已被物料「%s」占用", m.CAS, existing.Name)
		}
	}
	if m.ID == 0 {
		id, err := s.repo.Insert(m)
		if err != nil {
			return nil, err
		}
		m.ID = id
	} else {
		if err := s.repo.Update(m); err != nil {
			return nil, err
		}
	}
	return s.repo.Get(m.ID)
}

// DeleteMaterial 删除物料（级联删除价格）。
func (s *MaterialService) DeleteMaterial(id int64) error {
	return s.repo.Delete(id)
}

// ClearAllMaterials 清空物料库（物料与价格），方案数据不受影响。不可恢复。
func (s *MaterialService) ClearAllMaterials() (*db.ClearAllResult, error) {
	return s.repo.ClearAll()
}

// ListPrices 价格列表。
func (s *MaterialService) ListPrices(materialID int64, keyword string) ([]*models.Price, error) {
	return s.repo.ListPrices(materialID, keyword)
}

// SavePrice 新增或更新价格。id 为 0 时新增。
func (s *MaterialService) SavePrice(p *models.Price) (*models.Price, error) {
	if p.MaterialID <= 0 {
		return nil, fmt.Errorf("缺少物料")
	}
	if p.Price <= 0 {
		return nil, fmt.Errorf("价格需大于 0")
	}
	if p.Date.IsZero() {
		return nil, fmt.Errorf("缺少日期")
	}
	if p.Unit == "" {
		p.Unit = "元/kg"
	}
	if p.ID == 0 {
		id, err := s.repo.InsertPrice(p)
		if err != nil {
			return nil, err
		}
		p.ID = id
	} else {
		if err := s.repo.UpdatePrice(p); err != nil {
			return nil, err
		}
	}
	return s.repo.FindPrice(p.ID)
}

// DeletePrice 删除价格。
func (s *MaterialService) DeletePrice(id int64) error {
	return s.repo.DeletePrice(id)
}
