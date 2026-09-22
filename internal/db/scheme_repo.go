package db

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/dongying1997/materialcost4/internal/models"
)

// SchemeRepo 反应方案仓储。
type SchemeRepo struct {
	db *DB
}

func NewSchemeRepo(db *DB) *SchemeRepo { return &SchemeRepo{db: db} }

// Insert 保存方案（steps 以 JSON 存储）。
func (r *SchemeRepo) Insert(s *models.Scheme) (int64, error) {
	if s.CreatedAt.IsZero() {
		s.CreatedAt = time.Now()
	}
	s.UpdatedAt = time.Now()
	stepsJSON, err := json.Marshal(s.Steps)
	if err != nil {
		return 0, err
	}
	res, err := r.db.Exec(`INSERT INTO schemes (name,note,image,steps,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
		s.Name, s.Note, s.Image, string(stepsJSON),
		s.CreatedAt.Format("2006-01-02 15:04:05"), s.UpdatedAt.Format("2006-01-02 15:04:05"))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Update 更新方案。
func (r *SchemeRepo) Update(s *models.Scheme) error {
	s.UpdatedAt = time.Now()
	stepsJSON, err := json.Marshal(s.Steps)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(`UPDATE schemes SET name=?, note=?, image=?, steps=?, updated_at=? WHERE id=?`,
		s.Name, s.Note, s.Image, string(stepsJSON),
		s.UpdatedAt.Format("2006-01-02 15:04:05"), s.ID)
	return err
}

// Rename 只更新方案名称与备注，不触碰 updated_at 与方案内容。
//
// 与 Update 分开是有意的：updated_at 记录的是「内容最后变更时间」，
// 而它同时还是 List 的排序键（ORDER BY updated_at DESC）。走 Update 改名
// 会让一次纯改名的操作把方案顶到列表最前，看起来像内容也变了。
// 这里刻意不在 SQL 里出现 updated_at，也不要求调用方先读出整行。
func (r *SchemeRepo) Rename(id int64, name, note string) error {
	_, err := r.db.Exec(`UPDATE schemes SET name=?, note=? WHERE id=?`, name, note, id)
	return err
}

// Delete 删除方案。
func (r *SchemeRepo) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM schemes WHERE id=?`, id)
	return err
}

// List 方案列表。
func (r *SchemeRepo) List() ([]*models.Scheme, error) {
	rows, err := r.db.Query(`SELECT id,name,note,image,steps,created_at,updated_at FROM schemes ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []*models.Scheme{}
	for rows.Next() {
		s := &models.Scheme{}
		var stepsJSON, created, updated string
		if err := rows.Scan(&s.ID, &s.Name, &s.Note, &s.Image, &stepsJSON, &created, &updated); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(stepsJSON), &s.Steps); err != nil {
			return nil, err
		}
		s.CreatedAt, _ = ParseTime(created)
		s.UpdatedAt, _ = ParseTime(updated)
		list = append(list, s)
	}
	return list, rows.Err()
}

// Get 取单个方案。
func (r *SchemeRepo) Get(id int64) (*models.Scheme, error) {
	row := r.db.QueryRow(`SELECT id,name,note,image,steps,created_at,updated_at FROM schemes WHERE id=?`, id)
	s := &models.Scheme{}
	var stepsJSON, created, updated string
	if err := row.Scan(&s.ID, &s.Name, &s.Note, &s.Image, &stepsJSON, &created, &updated); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if err := json.Unmarshal([]byte(stepsJSON), &s.Steps); err != nil {
		return nil, err
	}
	s.CreatedAt, _ = ParseTime(created)
	s.UpdatedAt, _ = ParseTime(updated)
	return s, nil
}
