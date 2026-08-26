// Package db 提供 SQLite 数据库访问层（modernc.org/sqlite，免 CGO）。
package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
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

// migrate 建表。
func (d *DB) migrate() error {
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
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_cas ON materials(cas);`,
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
	return nil
}

// NowSQL 返回存储用的时间字符串（本地时区）。
func NowSQL() string {
	return time.Now().Format("2006-01-02 15:04:05")
}

// ParseTime 解析数据库中存储的时间字符串。
func ParseTime(s string) (time.Time, error) {
	return time.Parse("2006-01-02 15:04:05", s)
}
