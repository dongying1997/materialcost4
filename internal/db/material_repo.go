package db

import (
	"database/sql"
	"strings"
	"time"

	"github.com/dongying1997/materialcost4/internal/models"
)

// MaterialRepo 物料与价格的仓储。
type MaterialRepo struct {
	db *DB
}

func NewMaterialRepo(db *DB) *MaterialRepo { return &MaterialRepo{db: db} }

func scanMaterial(r *sql.Row) (*models.Material, error) {
	m := &models.Material{}
	var created, updated string
	if err := r.Scan(&m.ID, &m.Code, &m.Name, &m.CAS, &m.Formula, &m.MolWeight,
		&m.Content, &m.RecoveryRate, &m.Note, &created, &updated); err != nil {
		return nil, err
	}
	m.CreatedAt, _ = ParseTime(created)
	m.UpdatedAt, _ = ParseTime(updated)
	return m, nil
}

func (r *MaterialRepo) scanMaterials(rows *sql.Rows) ([]*models.Material, error) {
	list := []*models.Material{}
	for rows.Next() {
		m := &models.Material{}
		var created, updated string
		if err := rows.Scan(&m.ID, &m.Code, &m.Name, &m.CAS, &m.Formula, &m.MolWeight,
			&m.Content, &m.RecoveryRate, &m.Note, &created, &updated); err != nil {
			return nil, err
		}
		m.CreatedAt, _ = ParseTime(created)
		m.UpdatedAt, _ = ParseTime(updated)
		list = append(list, m)
	}
	return list, rows.Err()
}

// Insert 新增物料。
func (r *MaterialRepo) Insert(m *models.Material) (int64, error) {
	now := NowSQL()
	res, err := r.db.Exec(`INSERT INTO materials
		(code,name,cas,formula,mol_weight,content,recovery_rate,note,created_at,updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?)`,
		m.Code, m.Name, m.CAS, m.Formula, m.MolWeight, m.Content, m.RecoveryRate, m.Note, now, now)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Update 更新物料。
func (r *MaterialRepo) Update(m *models.Material) error {
	_, err := r.db.Exec(`UPDATE materials SET
		code=?, name=?, cas=?, formula=?, mol_weight=?, content=?, recovery_rate=?, note=?, updated_at=?
		WHERE id=?`,
		m.Code, m.Name, m.CAS, m.Formula, m.MolWeight, m.Content, m.RecoveryRate, m.Note, NowSQL(), m.ID)
	return err
}

// Delete 删除物料（级联删除价格）。
func (r *MaterialRepo) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM materials WHERE id=?`, id)
	return err
}

// Get 按 id 查询物料。
func (r *MaterialRepo) Get(id int64) (*models.Material, error) {
	row := r.db.QueryRow(`SELECT id,code,name,cas,formula,mol_weight,content,recovery_rate,note,created_at,updated_at FROM materials WHERE id=?`, id)
	return scanMaterial(row)
}

// List 搜索物料：按 编码/名称/CAS/化学式 模糊匹配。
func (r *MaterialRepo) List(keyword string) ([]*models.Material, error) {
	q := `SELECT id,code,name,cas,formula,mol_weight,content,recovery_rate,note,created_at,updated_at FROM materials`
	var args []any
	if k := strings.TrimSpace(keyword); k != "" {
		q += ` WHERE code LIKE ? OR name LIKE ? OR cas LIKE ? OR formula LIKE ?`
		like := "%" + k + "%"
		args = []any{like, like, like, like}
	}
	q += ` ORDER BY name`
	rows, err := r.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanMaterials(rows)
}

// ListWithPrice 返回物料列表并附带最新价格（按日期最新的价格记录）。
func (r *MaterialRepo) ListWithPrice(keyword string) ([]*models.MaterialWithPrice, error) {
	mats, err := r.List(keyword)
	if err != nil {
		return nil, err
	}
	out := make([]*models.MaterialWithPrice, 0, len(mats))
	for _, m := range mats {
		price, count, err := r.LatestPrice(m.ID)
		if err != nil {
			return nil, err
		}
		wp := &models.MaterialWithPrice{Material: *m, PriceCount: count}
		if price != nil {
			wp.Price = price.Price
			wp.PriceUnit = price.Unit
			wp.Supplier = price.Supplier
			wp.PriceDate = price.Date.Format("2006-01-02")
		}
		out = append(out, wp)
	}
	return out, nil
}

// InsertPrice 新增价格记录。
func (r *MaterialRepo) InsertPrice(p *models.Price) (int64, error) {
	if p.CreatedAt.IsZero() {
		p.CreatedAt = time.Now()
	}
	res, err := r.db.Exec(`INSERT INTO prices
		(material_id,price,unit,supplier,date,spec,content,note,created_at)
		VALUES (?,?,?,?,?,?,?,?,?)`,
		p.MaterialID, p.Price, p.Unit, p.Supplier, p.Date.Format("2006-01-02"), p.Spec, p.Content, p.Note, p.CreatedAt.Format("2006-01-02 15:04:05"))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdatePrice 更新价格记录。
func (r *MaterialRepo) UpdatePrice(p *models.Price) error {
	_, err := r.db.Exec(`UPDATE prices SET
		price=?, unit=?, supplier=?, date=?, spec=?, content=?, note=?
		WHERE id=?`,
		p.Price, p.Unit, p.Supplier, p.Date.Format("2006-01-02"), p.Spec, p.Content, p.Note, p.ID)
	return err
}

// DeletePrice 删除价格记录。
func (r *MaterialRepo) DeletePrice(id int64) error {
	_, err := r.db.Exec(`DELETE FROM prices WHERE id=?`, id)
	return err
}

// ListPrices 按条件查询价格：供应商/化合物名称/CAS。
func (r *MaterialRepo) ListPrices(materialID int64, keyword string) ([]*models.Price, error) {
	q := `SELECT p.id,p.material_id,p.price,p.unit,p.supplier,p.date,p.spec,p.content,p.note,p.created_at
		FROM prices p JOIN materials m ON m.id = p.material_id WHERE 1=1`
	var args []any
	if materialID > 0 {
		q += ` AND p.material_id = ?`
		args = append(args, materialID)
	}
	if k := strings.TrimSpace(keyword); k != "" {
		q += ` AND (p.supplier LIKE ? OR m.name LIKE ? OR m.cas LIKE ?)`
		like := "%" + k + "%"
		args = append(args, like, like, like)
	}
	q += ` ORDER BY p.date DESC, p.id DESC`
	rows, err := r.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []*models.Price{}
	for rows.Next() {
		p := &models.Price{}
		var date, created string
		if err := rows.Scan(&p.ID, &p.MaterialID, &p.Price, &p.Unit, &p.Supplier, &date, &p.Spec, &p.Content, &p.Note, &created); err != nil {
			return nil, err
		}
		p.Date, _ = parseDate(date)
		p.CreatedAt, _ = ParseTime(created)
		list = append(list, p)
	}
	return list, rows.Err()
}

// LatestPrice 返回某物料日期最新的价格记录（并列取 id 大者），count 为价格数量。
func (r *MaterialRepo) LatestPrice(materialID int64) (*models.Price, int, error) {
	var count int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM prices WHERE material_id=?`, materialID).Scan(&count); err != nil {
		return nil, 0, err
	}
	row := r.db.QueryRow(`SELECT id,material_id,price,unit,supplier,date,spec,content,note,created_at
		FROM prices WHERE material_id=? ORDER BY date DESC, id DESC LIMIT 1`, materialID)
	p := &models.Price{}
	var date, created string
	if err := row.Scan(&p.ID, &p.MaterialID, &p.Price, &p.Unit, &p.Supplier, &date, &p.Spec, &p.Content, &p.Note, &created); err != nil {
		if err == sql.ErrNoRows {
			return nil, count, nil
		}
		return nil, count, err
	}
	p.Date, _ = parseDate(date)
	p.CreatedAt, _ = ParseTime(created)
	return p, count, nil
}

// FindPrice 按 id 取单条价格记录。
func (r *MaterialRepo) FindPrice(id int64) (*models.Price, error) {
	row := r.db.QueryRow(`SELECT id,material_id,price,unit,supplier,date,spec,content,note,created_at
		FROM prices WHERE id=?`, id)
	p := &models.Price{}
	var date, created string
	if err := row.Scan(&p.ID, &p.MaterialID, &p.Price, &p.Unit, &p.Supplier, &date, &p.Spec, &p.Content, &p.Note, &created); err != nil {
		return nil, err
	}
	p.Date, _ = parseDate(date)
	p.CreatedAt, _ = ParseTime(created)
	return p, nil
}

// GetByCAS 按 CAS 精确查找物料。
func (r *MaterialRepo) GetByCAS(cas string) (*models.Material, error) {
	row := r.db.QueryRow(`SELECT id,code,name,cas,formula,mol_weight,content,recovery_rate,note,created_at,updated_at FROM materials WHERE cas=?`, cas)
	m, err := scanMaterial(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return m, err
}

func parseDate(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	return time.Parse("2006-01-02", s)
}
