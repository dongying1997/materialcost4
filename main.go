package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/dongying1997/materialcost4/internal/db"
	"github.com/dongying1997/materialcost4/internal/service"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// 数据库位置：用户数据目录下（Mac: ~/Library/Application Support/MaterialCost4）
	dataDir := application.Path(application.PathDataHome)
	dbPath := filepath.Join(dataDir, "MaterialCost4", "materialcost.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer database.Close()

	materialRepo := db.NewMaterialRepo(database)
	schemeRepo := db.NewSchemeRepo(database)

	materialSvc := service.NewMaterialService(materialRepo)
	reactionSvc := service.NewReactionService(materialRepo, schemeRepo)
	excelSvc := service.NewExcelService(materialRepo)

	app := application.New(application.Options{
		Name:        "MaterialCost4",
		Description: "物料成本计算工具",
		Services: []application.Service{
			application.NewService(materialSvc),
			application.NewService(reactionSvc),
			application.NewService(excelSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "物料成本计算",
		Width:  1280,
		Height: 820,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(250, 250, 250),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
