# 贡献指南

感谢你有兴趣为 MaterialCost 做贡献。本文档说明如何搭建开发环境、项目的编码约定，以及提交代码的流程。

## 开发环境

| 依赖 | 版本 | 安装 |
|------|------|------|
| Go | 1.25+ | `brew install go` |
| Node.js | 20+ | `brew install node` |
| Wails CLI | 与 `go.mod` 中的 `v3.0.0-beta.12` 一致 | `go install github.com/wailsapp/wails/v3/cmd/wails3@latest` |
| Task | 3.x（实验证版本 3.53.1） | `brew install go-task`（`wails3 build` / `wails3 package` 依赖） |

```bash
git clone https://github.com/dongying1997/materialcost4.git
cd materialcost4
cd frontend && npm install && cd ..
wails3 dev          # 开发模式，Vite 监听 9245 端口
```

## 架构约束

**前端只负责展示与输入，所有计算、校验与持久化逻辑必须放在 Go 后端。**

这条约束是本项目最重要的设计边界，请勿在 React 侧实现业务规则 —— 否则计算逻辑会分裂成两份，且无法被 Go 单元测试覆盖。

```
main.go → internal/service（对外服务）→ internal/engine（纯函数计算）
                                      → internal/db   （SQLite 仓储）
```

## 编码规范

### Go

- 使用 `gofmt`（Tab 缩进）。提交前执行 `go fmt ./...`。
- 导出名 `PascalCase`，非导出名 `camelCase`。
- import 分组顺序：标准库 → 第三方 → 本项目。
- `internal/engine/` 中的函数必须保持**纯函数**（无 I/O、无全局状态），这是可测试性的基础。

### TypeScript / React

- 开启严格模式，组件文件用 `PascalCase.tsx`，hooks 用 `useXxx.ts`。
- 字符串使用双引号。
- 优先复用 [Ant Design](https://ant.design/) 组件，不要手搓基础控件；布局使用组件库自带的 `Flex` / `Space` / `Row` / `Col`。

### 注释

允许并鼓励使用中文注释，与现有代码库保持一致。

## 测试

- 使用 Go 标准库 `testing`，测试文件与源文件同目录（如 `internal/engine/engine_test.go`）。
- 断言辅助函数在测试文件内本地定义，**不引入外部测试框架**。
- 计算引擎的各个分支必须覆盖。
- 提交前务必运行：

```bash
go test ./...        # 全部后端测试
```

## 修改 Go 导出结构后必须重新生成绑定

Wails 通过代码生成把 Go 的服务方法暴露给前端。只要你改动了**导出的结构体字段或服务方法签名**，就必须重新生成并一并提交绑定文件：

```bash
wails3 generate bindings -ts -i
```

生成结果落在 `frontend/bindings/`，其中路径与 Go 包路径一一对应。**请勿手工编辑这目录下的任何文件** —— 它们会在下次生成时被覆盖。

忘记这一步会导致前端 TS 编译失败，CI 会拦下。

## 提交信息规范

格式：**`type(scope): 中文描述`**

```
feat(反应计算): 增加物料成本占比的功能
fix(物料库): 修复价格历史界面的时间显示问题
docs(all): 重写 README 为开源版
```

| type | 含义 |
|------|------|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `refactor` | 重构（不改变外部行为） |
| `docs` | 文档 |
| `chore` | 构建、依赖、配置等杂项 |
| `test` | 测试 |

常用 scope：`物料库`、`反应计算`、`方案管理`、`all`。

一次提交只做一件事，不要把无关改动混在一起。

## 发布版本

发布由 [`.github/workflows/release.yml`](.github/workflows/release.yml) 在推送 `v*` tag 时自动完成，无需手工构建。

**版本号只有一个来源：[`build/config.yml`](build/config.yml) 的 `info.version`。** 它会被写进 macOS 的 `Info.plist`、Windows 的 `info.json` 与 Linux 的 `nfpm.yaml`。

**改完必须跑生成器同步：**

```bash
wails3 task common:update:build-assets
```

否则 CI 会用仓库里**已提交的**那份旧资源构建——三个平台的发布任务都不跑这个生成器（见 `.github/workflows/release.yml`），只改 `config.yml` 的话，安装包里的版本号会原地不动。v0.2.0 就踩过这个坑：Release 标着 v0.2.0，而 macOS 的 `CFBundleShortVersionString`、Windows 的 `INFO_PRODUCTVERSION`、Linux 包的 `Version:` 全是 `0.1.0`。

**跑完生成器务必 `git diff` 检查 `build/linux/nfpm/nfpm.yaml`。** 该文件既是生成物又含手工定制，生成器会把它整个按模板重写，把两行定制冲掉：

| 字段 | 生成器会写回 | 应当保持 |
|------|-------------|---------|
| `homepage` | `https://wails.io` | 本仓库地址 |
| `license` | `MIT` | `PolyForm-Noncommercial-1.0.0`（见 [LICENSE](LICENSE)，本项目仅限非商业用途，写成 MIT 是错误的许可声明）|

其余生成物（各 `Info.plist`、`info.json`、`wails_tools.nsh`、`wails.exe.manifest`）纯由模板生成，只有版本号会变，可以直接接受。

**发布步骤：**

1. 修改 `build/config.yml` 的 `info.version`（如 `0.1.0` → `0.2.0`）并提交。
2. 推送后打 tag，**tag 名须与版本号一致**：

   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```

3. CI 会并行构建三个平台并汇总发布：
   - **macOS** (`macos-14`)：arm64 + amd64 通用二进制，产出 `.dmg`
   - **Windows** (`windows-latest`)：NSIS 安装程序 `.exe`
   - **Linux** (`ubuntu-24.04`)：`.deb` 与 `.rpm`

所有产物均**未做代码签名**（未持有 Apple Developer / Windows 代码签名证书）。Windows 上 NSIS 需要 runner 自带，由 `choco install nsis` 安装。

### 为什么不用 arduino/setup-task

Release 工作流中的 Task 运行器是**固定版本、直连下载**的，没有使用常见的 `arduino/setup-task` action，也不用 Task 官方 `install.sh`。原因是这两者都要访问 GitHub API 解析版本号，在 CI 共享出口 IP 上会撞上速率限制（实测 `arduino/setup-task` 报 `API rate limit exceeded`）。固定版本号并直接下载 release 资产可完全规避。升级 Task 版本时，需同时修改三个平台的下载步骤（macOS/Linux 为 `.tar.gz`，Windows 为 `.zip`）。

### 为什么 Linux 必须原生构建

Linux 的 Wails 后端需要 GTK4 与 WebKitGTK，且 `CGO_ENABLED=1`，无法从 macOS/Windows 简单交叉编译。因此 Linux 产物在 `ubuntu-24.04` 上原生构建 —— 该版本提供 GTK 4.14.5，满足 Wails 要求的 **GTK >= 4.14**（Debian 13 / Ubuntu 24.04 是基线，见 [`build/docker/Dockerfile.cross`](build/docker/Dockerfile.cross)）。

## 提交 Pull Request

1. 从 `main` 切出特性分支。
2. 完成改动，确保 `go test ./...` 与 `cd frontend && npm run build` 均通过。
3. 若改动了导出结构，重新生成绑定并提交。
4. 开 PR，说明改动内容，并注明**是否重新生成了绑定**。

CI 会对每个 PR 自动运行后端测试与前端构建，两项都通过才会被合入。
