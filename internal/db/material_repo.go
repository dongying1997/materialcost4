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

// scanMaterial 辅助函数 将sql结果解析到Material结构体
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

// scanMaterials 辅助函数 将sql结果(复数)解析到Material结构体列表
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

// ClearAllResult 清空物料库的结果（删除条数）。
type ClearAllResult struct {
	MaterialsDeleted int64 `json:"materialsDeleted"`
	PricesDeleted    int64 `json:"pricesDeleted"`
}

// ClearAll 清空全部物料与价格记录，返回删除条数。方案数据不受影响。
// 价格不单独删除——prices.material_id 上带 ON DELETE CASCADE，随物料一起走。
func (r *MaterialRepo) ClearAll() (*ClearAllResult, error) {
	// 统计与删除放在同一事务里，避免返回的条数与实际删除的不一致。
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback() //nolint:errcheck // 已提交时回滚是空操作

	res := &ClearAllResult{}
	if err := tx.QueryRow(`SELECT COUNT(*) FROM materials`).Scan(&res.MaterialsDeleted); err != nil {
		return nil, err
	}
	if err := tx.QueryRow(`SELECT COUNT(*) FROM prices`).Scan(&res.PricesDeleted); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM materials`); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return res, nil
}

// Get 按 id 查询物料。
func (r *MaterialRepo) Get(id int64) (*models.Material, error) {
	row := r.db.QueryRow(`SELECT id,code,name,cas,formula,mol_weight,content,recovery_rate,note,created_at,updated_at FROM materials WHERE id=?`, id)
	return scanMaterial(row)
}

// List 搜索物料：按 编码/名称/CAS/化学式/备注 模糊匹配。
// 备注也参与匹配，是为了让别名可搜——导入时同一物质的其它写法会记在备注里。
//
// 排序分两种情形：
//   - 无关键字：最新新增的在前（id DESC）。这样刚建的物料必定落在第一页，
//     不必去翻字母序里它该待的那一页。
//   - 有关键字：与关键字的接近度高的在前（精确 > 前缀 > 包含），同级再按最新在前。
//     纯字母序在搜索结果里没有意义——用户是带着一个具体查询来的，
//     最想要的是「哪个才是我要找的那条」，而不是它们按名称怎么排。
func (r *MaterialRepo) List(keyword string) ([]*models.Material, error) {
	const cols = `id,code,name,cas,formula,mol_weight,content,recovery_rate,note,created_at,updated_at`
	q := `SELECT ` + cols + ` FROM materials`
	k := strings.TrimSpace(keyword)

	var args []any
	if k == "" {
		q += ` ORDER BY id DESC`
	} else {
		// 接近度打分：0 = 编码/名称/CAS 精确等于关键字，1 = 前缀，2 = 包含。
		// 编码/CAS 是标识符，精确匹配的价值最高；名称次之。
		// 备注与化学式只参与「包含」这一档（它们是辅助信息，不该压过名称前缀匹配）。
		q += `
		WHERE code LIKE ? OR name LIKE ? OR cas LIKE ? OR formula LIKE ? OR note LIKE ?
		ORDER BY CASE
			WHEN code = ? OR name = ? OR cas = ? THEN 0
			WHEN code LIKE ? OR name LIKE ? OR cas LIKE ? THEN 1
			ELSE 2
		END, id DESC`
		like := "%" + k + "%"
		prefix := k + "%"
		args = []any{
			like, like, like, like, like,
			k, k, k,
			prefix, prefix, prefix,
		}
	}

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
			wp.PriceScale = price.PriceScale
			wp.PriceNote = price.Note
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
		(material_id,price,unit,price_scale,supplier,date,spec,content,note,created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?)`,
		p.MaterialID, p.Price, p.Unit, p.PriceScale, p.Supplier, p.Date.Format("2006-01-02"), p.Spec, p.Content, p.Note, p.CreatedAt.Format("2006-01-02 15:04:05"))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdatePrice 更新价格记录。
func (r *MaterialRepo) UpdatePrice(p *models.Price) error {
	_, err := r.db.Exec(`UPDATE prices SET
		price=?, unit=?, price_scale=?, supplier=?, date=?, spec=?, content=?, note=?
		WHERE id=?`,
		p.Price, p.Unit, p.PriceScale, p.Supplier, p.Date.Format("2006-01-02"), p.Spec, p.Content, p.Note, p.ID)
	return err
}

// DeletePrice 删除价格记录。
func (r *MaterialRepo) DeletePrice(id int64) error {
	_, err := r.db.Exec(`DELETE FROM prices WHERE id=?`, id)
	return err
}

// ListPrices 按条件查询价格：供应商/化合物名称/CAS/物料备注（含别名）。
func (r *MaterialRepo) ListPrices(materialID int64, keyword string) ([]*models.Price, error) {
	q := `SELECT p.id,p.material_id,p.price,p.unit,p.price_scale,p.supplier,p.date,p.spec,p.content,p.note,p.created_at
		FROM prices p JOIN materials m ON m.id = p.material_id WHERE 1=1`
	var args []any
	if materialID > 0 {
		q += ` AND p.material_id = ?`
		args = append(args, materialID)
	}
	if k := strings.TrimSpace(keyword); k != "" {
		q += ` AND (p.supplier LIKE ? OR m.name LIKE ? OR m.cas LIKE ? OR m.note LIKE ?)`
		like := "%" + k + "%"
		args = append(args, like, like, like, like)
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
		if err := rows.Scan(&p.ID, &p.MaterialID, &p.Price, &p.Unit, &p.PriceScale, &p.Supplier, &date, &p.Spec, &p.Content, &p.Note, &created); err != nil {
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
	row := r.db.QueryRow(`SELECT id,material_id,price,unit,price_scale,supplier,date,spec,content,note,created_at
		FROM prices WHERE material_id=? ORDER BY date DESC, id DESC LIMIT 1`, materialID)
	p := &models.Price{}
	var date, created string
	if err := row.Scan(&p.ID, &p.MaterialID, &p.Price, &p.Unit, &p.PriceScale, &p.Supplier, &date, &p.Spec, &p.Content, &p.Note, &created); err != nil {
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
	row := r.db.QueryRow(`SELECT id,material_id,price,unit,price_scale,supplier,date,spec,content,note,created_at
		FROM prices WHERE id=?`, id)
	p := &models.Price{}
	var date, created string
	if err := row.Scan(&p.ID, &p.MaterialID, &p.Price, &p.Unit, &p.PriceScale, &p.Supplier, &date, &p.Spec, &p.Content, &p.Note, &created); err != nil {
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

// GetByCAS 按 CAS 精确查找物料。
func (r *MaterialRepo) GetByName(name string) (*models.Material, error) {
	row := r.db.QueryRow(`SELECT id,code,name,cas,formula,mol_weight,content,recovery_rate,note,created_at,updated_at FROM materials WHERE name=?`, name)
	m, err := scanMaterial(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return m, err
}

// parseDate 解析价格日期。与 ParseTime 同理，必须按本地时区解析，
// 否则前端 new Date() 会把它当成 UTC 再渲染一次，日期可能整体偏一天。
func parseDate(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	return time.ParseInLocation("2006-01-02", s, time.Local)
}
