# Repository Guidelines

## Project Structure & Module Organization

Wails v3 desktop app — Go backend + React/TypeScript frontend for chemical material cost calculation.

```
├── main.go              # Entry point; wires DB, services, Wails runtime
├── internal/            # Go backend (all business logic)
│   ├── db/              #   SQLite connection & repositories
│   ├── engine/          #   Pure-function calculation engine (unit-tested)
│   ├── models/          #   Shared data models
│   └── service/         #   Wails-exposed services (CRUD, Excel I/O)
├── frontend/src/        # React frontend
│   ├── components/      #   Reusable UI components (PascalCase.tsx)
│   ├── pages/           #   Top-level page components
│   ├── hooks/           #   Custom hooks (useXxx.ts)
│   └── utils/           #   Frontend helpers
├── frontend/bindings/   # Auto-generated Wails TS bindings (do not edit)
└── build/               # Platform build configs
```

**Architectural rule**: Frontend is presentation-only. All computation, validation, and persistence belong in Go.

## Build, Test, and Development Commands

| Command | Purpose |
|---|---|
| `wails3 dev` | Dev mode with hot reload (Vite on port 9245) |
| `wails3 build` | Production build for the current platform |
| `wails3 generate bindings -ts -i` | Regenerate TS bindings after Go changes |
| `go test ./...` | Run all backend unit tests |
| `cd frontend && npm run build` | Frontend-only production build |

## Coding Style & Naming Conventions

- **Go**: Use `gofmt` (tabs for indentation). Run `go fmt ./...` before committing. Exported names: `PascalCase`; unexported: `camelCase`. Group imports: stdlib → third-party → local.
- **TypeScript/React**: Strict mode enabled. Components: `PascalCase.tsx`; hooks: `useXxx.ts`. Use double quotes.
- **UI**: Prefer Ant Design components over hand-rolled ones; use Tailwind utilities for layout.
- **Comments**: Inline comments may be in Chinese (consistent with the codebase).

## Testing Guidelines

- Use Go's standard `testing` package; place `*_test.go` alongside source files (e.g., `internal/engine/engine_test.go`).
- The calculation engine (`internal/engine/`) must remain pure functions — this is the primary test target.
- Define helper assertions locally in tests; do not add external test frameworks.
- Run `go test ./...` before submitting changes. Cover all engine calculation branches.

## Commit & Pull Request Guidelines

- Use the convention **`type(scope): description`** in Chinese:
  - `feat(反应计算): 增加物料成本占比的功能`
  - `fix(物料库): 修复价格历史界面的时间显示问题`
- Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
- Common scopes: `物料库`, `反应计算`, `方案管理`, `all`.
- Keep commits focused (one logical change per commit).
- After changing exported Go structs or service methods, regenerate bindings and commit the updated `frontend/bindings/`.
- PRs should describe the change and note whether bindings were regenerated.
