# 第三方组件许可

本项目的自有代码以 **PolyForm Noncommercial License 1.0.0** 授权（见 [LICENSE](LICENSE)）——
仅限非商业用途。但它依赖与打包的第三方组件各有各的许可，其中多数是宽松许可
（MIT / BSD），**不影响你按 PolyForm 的条款使用本项目**。本文件把它们列出来，便于分发时一并遵守。

> **尚未逐一核实。** 下表前两栏来自 `go.mod` / `frontend/package.json` 与各组件公开的
> 许可声明，**没有**从安装包里的实际依赖副本重新读取。真要对外分发（尤其商业分发）前，
> 请用 `go-licenses` / `license-checker` 之类的工具重新生成一份。

## 运行时依赖（Go）

| 组件 | 许可 |
|------|------|
| [wailsapp/wails v3](https://github.com/wailsapp/wails) | MIT |

> PolyForm 不是 OSI 认可的开源许可证，`go-licenses` 之类的工具会把它当作
> 「非标准/受限」许可。这是预期的，不是配置问题。
| [xuri/excelize v2](https://github.com/xuri/excelize) | BSD-3-Clause |
| [modernc.org/sqlite](https://gitlab.com/cznic/sqlite) | BSD-3-Clause |
| golang.org/x/{crypto,net,sys,text} | BSD-3-Clause |
| 其余间接依赖（`go.mod` 中标记 `// indirect` 者） | 待核实 |

`modernc.org/sqlite` 是 SQLite 的 **C 转 Go 移植**（`modernc.org/libc` 等），
不是 SQLite 官方源码，因此不适用 SQLite 的公有领域声明。

## 运行时依赖（前端）

| 组件 | 许可 |
|------|------|
| react / react-dom | MIT |
| antd / @ant-design/icons | MIT |
| react-router-dom | MIT |
| dayjs | MIT |
| @wailsio/runtime | MIT |
| @plq/use-persisted-state | MIT |

## 打包与构建工具（不随产物分发）

| 组件 | 许可 |
|------|------|
| [Wails CLI](https://github.com/wailsapp/wails) | MIT |
| [Task](https://github.com/go-task/task) | MIT |
| Vite / esbuild / TypeScript | MIT |
| [nfpm](https://github.com/goreleaser/nfpm) | MIT |
| NSIS 运行时 | zlib/libpng |

## 字体

界面使用的 Inter 字体随前端一起打包（`frontend/public/Inter-Medium.ttf`），
采用 **SIL Open Font License 1.1**，许可全文已随仓库提供：
[frontend/public/Inter Font License.txt](frontend/public/Inter%20Font%20License.txt)。

OFL 允许随软件一起再分发，但要求保留版权声明与许可全文。因此这份 `.txt` 被放在
`frontend/public/` 下——该目录会被 Vite 原样拷进 `frontend/dist/`，而 `dist/` 又被
`main.go` 的 `//go:embed` 嵌进二进制，所以它会随安装包一起分发。
**不要再把它挪回 `frontend/` 根目录**，那样就进不了产物了。
