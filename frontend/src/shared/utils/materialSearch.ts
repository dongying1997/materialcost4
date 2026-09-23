// 物料下拉的「按接近度搜索」：与物料管理页同一套打分
import type { MaterialWithPrice } from '@/types'

/**
 * 物料搜索的接近度打分——**这是后端 `internal/db/material_repo.go` 的 `List` 的前端镜像**。
 *
 * 物料管理页把关键字透传给后端，由 `List` 的 SQL 排序；反应计算页的两个物料下拉
 * （原料名称 / 选物料）是「一次性拉全库、逐键本地过滤」，拿不到后端那份排序，
 * 所以同一套打分必须在前端再实现一遍，否则同一个关键字在两个页面会排出两种顺序。
 *
 * 档位（数字越小越靠前，对应 `List` 里那段 CASE）：
 *   0 = 编码 / 名称 / CAS 精确等于关键字
 *   1 = 编码 / 名称 / CAS 以关键字开头
 *   2 = 关键字出现在 编码 / 名称 / CAS / 化学式 / 备注 的任意位置
 * 同级再按 id 倒序（最新在前），对应 SQL 的 `id DESC`。
 *
 * ⚠️ 改这里的档位或字段时，`internal/db/material_repo.go` 的 `List` 要同步改——
 * 两处是这套排序仅有的两个表达。
 *
 * 两处刻意的、影响极小的偏差：
 *   - 大小写：前端统一 toLowerCase 折叠（对中文是恒等变换），与 SQLite LIKE 的默认
 *     （ASCII 不敏感）一致；但 SQLite 的 `=` 是大小写敏感的，所以仅大小写不同的
 *     「精确」命中，后端算档 1、前端算档 0。两者都排在所有子串匹配之前，
 *     只有与其他前缀匹配的相对次序可能不同。
 *   - `%` / `_`：后端当 LIKE 通配符，这里按字面匹配。字面读法更符合用户预期，
 *     故不复刻通配符语义。
 */

/** 接近度档位，数字越小越靠前 */
export type MaterialMatchTier = 0 | 1 | 2

/** 参与「精确 / 前缀」两档的字段，对应 SQL 里 CASE 判的 code/name/cas */
const IDENTITY_FIELDS = ['code', 'name', 'cas'] as const
/** 只参与「包含」档的字段：化学式与备注是辅助信息，不该压过名称的前缀匹配 */
const AUX_FIELDS = ['formula', 'note'] as const

/** 字段归一：统一小写后再比（见文件头「大小写」那条偏差说明） */
const fold = (s: string) => s.toLowerCase()

/**
 * 单条物料对关键字的匹配档位；`null` = 不匹配。
 * 关键字为空（含纯空格）时一律返回 `null`——「空关键字」不是一次搜索，
 * 调用方（filterOption / filterSort）会各自走「不过滤 / 不重排」的分支。
 */
export function materialMatchTier(m: MaterialWithPrice, query: string): MaterialMatchTier | null {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const identity = IDENTITY_FIELDS.map((f) => fold(m[f]))
  if (identity.some((v) => v === q)) return 0
  if (identity.some((v) => v.startsWith(q))) return 1
  if (identity.concat(AUX_FIELDS.map((f) => fold(m[f]))).some((v) => v.includes(q))) return 2
  return null
}

/** 选项对应的物料 id；查不到时为 NaN，两处都按「非物料选项」处理 */
function optionMaterialId(option: unknown): number {
  return Number((option as { value?: number })?.value)
}

/** 非物料选项（未关联行的哨兵项，value = -1）的兜底档位：永远排最后 */
const UNKNOWN_TIER = 3

/**
 * 生成 rc-select `showSearch` 的 `filterOption` / `filterSort`，两个物料下拉共用。
 * 直接铺给 `<Select showSearch={materialSearch}>` 即可。
 *
 * 两点是这套实现的前提：
 *   - rc-select 拿到 `filterSort` 后会**无条件**调用（空关键字也调），所以比较器
 *     必须在无关键字时返回 0。配合 Array.prototype.sort 的稳定性，等于保持物料库
 *     原序（后端给的 id 倒序），聚焦下拉不会重排。
 *   - 单选模式下选中会清空搜索值（autoClearSearchValue 默认 true），筛选与排序
 *     随之失效，所以选中一行不会让它跳位。
 */
export function createMaterialShowSearch(materials: MaterialWithPrice[]) {
  // 按 id 建索引：原来的写法是每个候选项都做一次 materials.find（O(n²)），
  // 这里换成一次建表 + O(1) 查表。物料集不变时这张表也不变，调用点用 useMemo 兜住。
  const byId = new Map<number, MaterialWithPrice>()
  for (const m of materials) byId.set(m.id, m)

  const filterOption = (input: string, option?: unknown): boolean => {
    const q = input.trim()
    if (!q) return true // 空关键字：全员保留，与后端「无关键字不过滤」一致
    const m = byId.get(optionMaterialId(option))
    return !!m && materialMatchTier(m, q) !== null
  }

  const filterSort = (a: unknown, b: unknown, info: { searchValue: string }): number => {
    const q = info.searchValue.trim()
    if (!q) return 0 // 空关键字不重排（见上方注释）
    const ma = byId.get(optionMaterialId(a))
    const mb = byId.get(optionMaterialId(b))
    const ra = ma ? materialMatchTier(ma, q) ?? UNKNOWN_TIER : UNKNOWN_TIER
    const rb = mb ? materialMatchTier(mb, q) ?? UNKNOWN_TIER : UNKNOWN_TIER
    if (ra !== rb) return ra - rb
    return (mb?.id ?? 0) - (ma?.id ?? 0) // 同级：最新在前，对应 SQL 的 id DESC
  }

  return { filterOption, filterSort }
}
