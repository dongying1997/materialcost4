// Package db 提供 SQLite 数据库访问层（modernc.org/sqlite，免 CGO）。
package db

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// DB 封装 database/sql 连接。
type DB struct {
	*sql.DB
}

// Open 打开（或创建）指定路径下的 SQLite 数据库并迁移表结构。
func Open(path string) (*DB, error) {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create data dir: %w", err)
		}
	}
	sqlDB, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1) // SQLite 单写者
	if err := sqlDB.Ping(); err != nil {
		return nil, err
	}
	d := &DB{DB: sqlDB}
	if err := d.migrate(); err != nil {
		return nil, err
	}
	return d, nil
}

// migrate 建表并补齐历史库缺失的列。
func (d *DB) migrate() error {
	if err := d.rebuildCASIndex(); err != nil {
		return err
	}
	stmts := []string{
		`PRAGMA foreign_keys = ON;`,
		`CREATE TABLE IF NOT EXISTS materials (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			code TEXT NOT NULL DEFAULT '',
			name TEXT NOT NULL,
			cas TEXT NOT NULL DEFAULT '',
			formula TEXT NOT NULL DEFAULT '',
			mol_weight REAL NOT NULL DEFAULT 0,
			content REAL NOT NULL DEFAULT 0,
			recovery_rate REAL NOT NULL DEFAULT 0,
			note TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		// 部分索引：CAS 为选填，空值不参与唯一约束（否则多条无 CAS 物料会互相冲突）。
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_cas ON materials(cas) WHERE cas <> '';`,
		`CREATE INDEX IF NOT EXISTS idx_materials_name ON materials(name);`,
		`CREATE TABLE IF NOT EXISTS prices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
			price REAL NOT NULL DEFAULT 0,
			unit TEXT NOT NULL DEFAULT '元/kg',
			supplier TEXT NOT NULL DEFAULT '',
			date TEXT NOT NULL,
			spec TEXT NOT NULL DEFAULT '',
			content REAL NOT NULL DEFAULT 0,
			note TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_prices_material ON prices(material_id);`,
		`CREATE TABLE IF NOT EXISTS schemes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			note TEXT NOT NULL DEFAULT '',
			image TEXT NOT NULL DEFAULT '',
			steps TEXT NOT NULL DEFAULT '[]',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
	}
	for _, s := range stmts {
		if _, err := d.Exec(s); err != nil {
			return err
		}
	}
	return d.addSchemeImageColumn()
}

// addSchemeImageColumn 给升级前建的 schemes 表补上 image 列。
//
// SQLite 不支持 ADD COLUMN IF NOT EXISTS，重复执行会报 duplicate column name，
// 所以先查表结构确认列不存在再改。新库由上面的 CREATE TABLE 直接带上该列，
// 这里会走「已存在」分支直接返回。
func (d *DB) addSchemeImageColumn() error {
	has, err := d.hasColumn("schemes", "image")
	if err != nil || has {
		return err
	}
	_, err = d.Exec(`ALTER TABLE schemes ADD COLUMN image TEXT NOT NULL DEFAULT ''`)
	return err
}

// hasColumn 判断表上是否已有某列。
func (d *DB) hasColumn(table, column string) (bool, error) {
	rows, err := d.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return false, err
		}
		if strings.EqualFold(name, column) {
			return true, nil
		}
	}
	return false, rows.Err()
}

// rebuildCASIndex 删除旧的无条件唯一索引，交由 migrate 重建为部分索引。
// 旧索引会约束空字符串 CAS，导致多条无 CAS 物料互相冲突。
func (d *DB) rebuildCASIndex() error {
	var def *string
	err := d.QueryRow(`SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_materials_cas'`).Scan(&def)
	if errors.Is(err, sql.ErrNoRows) {
		return nil // 尚未建过该索引
	}
	if err != nil {
		return err
	}
	if def != nil && strings.Contains(strings.ToUpper(*def), "WHERE") {
		return nil // 已是部分索引
	}
	_, err = d.Exec(`DROP INDEX IF EXISTS idx_materials_cas`)
	return err
}

// NowSQL 返回存储用的时间字符串（本地时区）。
func NowSQL() string {
	return time.Now().Format("2006-01-02 15:04:05")
}

// ParseTime 解析数据库中存储的时间字符串。
//
// 库里的时间字符串都是 NowSQL() 按本地时区写入的（不带时区后缀），
// 必须用 time.ParseInLocation 按本地时区解析。若用 time.Parse，得到的是
// UTC 时间，前端 new Date() 会再按本地时区渲染一次，等于凭空加了时差
// （例如本地的 20:45 被显示成次日 04:45）。
func ParseTime(s string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02 15:04:05", s, time.Local)
}
