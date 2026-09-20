import { Button, Select, Tooltip } from 'antd'
import { LinkOutlined } from '@ant-design/icons'
import type { MaterialWithPrice, ReagentRow } from '../types'

/**
 * 原料「名称」单元格。
 *
 * 这一格有四种互斥形态，全部收敛在本文件内：
 *   1. 继承行（inherited）——只读文本 + 灰色底 + 橙色链接图标
 *   2. 已关联   （bound）——普通下拉
 *   3. 未关联且库中恰有一条同名（unbound + canAutoLink）——哨兵项 + 可点的 🔗
 *   4. 未关联且无法自动关联（unbound + !canAutoLink）——哨兵项置灰，用下拉选
 *
 * 由 StepCard 的名称列调用，自身不持有 state（数据全部来自 props）。
 */

/** 输入控件铺满所在单元格 */
const fullInput = { width: '100%' } as const

// 未关联物料库的行在名称下拉里的哨兵值（真实物料 id 恒为正数，不会冲突）
const UNBOUND_MATERIAL = -1

/** 名称列的形态：继承行 / 已关联 / 未关联（有名称但不在库中） */
export type NameCellState = {
    /** 已关联且该物料仍在库中 */
    bound: boolean
    /** 有名称但未关联（如导入方案时 materialId 被清空） */
    unbound: boolean
    /** 库中同名物料；仅在 unbound 时非空 */
    sameName: MaterialWithPrice[]
    /** 库中恰有一条同名物料，可一键关联 */
    canAutoLink: boolean
}

/** 判定名称列形态。同一批判断在哨兵项、下拉提示、关联按钮里共用，集中一处避免改漏 */
function nameCellState(r: ReagentRow, materials: MaterialWithPrice[]): NameCellState {
    const bound = r.materialId > 0 && materials.some(m => m.id === r.materialId)
    const unbound = !bound && !!r.name
    const sameName = unbound ? materials.filter(m => m.name === r.name) : []
    return { bound, unbound, sameName, canAutoLink: sameName.length === 1 }
}

/** 未关联行在名称下拉里的哨兵项文案：说明为何不能自动关联 */
function sentinelText(name: string, sameName: MaterialWithPrice[]): string {
    if (sameName.length === 1) return name
    if (sameName.length > 1) return `${name}（库中有 ${sameName.length} 条同名，请从下方选择）`
    return `${name}（物料库中没有此物料）`
}

/** 同一批形态判断派生的三处 Tooltip 文案：下拉框、关联按钮、整格 */
function nameHints(r: ReagentRow, s: NameCellState): { select: string; link: string; wrap: string } {
    if (!s.unbound) return { select: '', link: '', wrap: '' }
    if (s.canAutoLink) {
        return {
            select: '该原料未关联物料库（来自导入的方案），计算使用方案自带数据；点右侧 🔗 可关联到库中同名物料',
            link: `关联到物料库中的「${r.name}」`,
            wrap: '该原料未关联物料库（来自导入的方案），计算使用方案自带数据；点右侧 🔗 可关联到库中同名物料',
        }
    }
    if (s.sameName.length > 1) {
        const n = s.sameName.length
        return {
            select: `该原料未关联物料库；库中有 ${n} 条同名物料，请从下拉里选择`,
            link: `库中有 ${n} 条同名物料，无法自动关联，请从下拉里选择`,
            wrap: `该原料未关联物料库；库中有 ${n} 条同名物料，请从下拉里选择`,
        }
    }
    return {
        select: '该原料未关联物料库（来自导入的方案），计算使用方案自带数据；请从下拉里选择对应物料',
        link: '物料库中没有同名物料，无法自动关联',
        wrap: '该原料未关联物料库（来自导入的方案），计算使用方案自带数据；请从下拉里选择对应物料',
    }
}

/** 名称下拉的候选项：库中全部物料；未关联行在最前插入哨兵项保持名称可见 */
function materialOptions(materials: MaterialWithPrice[], s: NameCellState, name: string) {
    const options: { value: number; label: string; disabled?: boolean }[] =
        materials.map(m => ({ value: m.id, label: m.name }))
    if (s.unbound) {
        options.unshift({ value: UNBOUND_MATERIAL, label: sentinelText(name, s.sameName), disabled: !s.canAutoLink })
    }
    return options
}

interface Props {
    row: ReagentRow
    materials: MaterialWithPrice[]
    /** 选中物料（或点 🔗 关联）时回调 */
    onPick: (row: ReagentRow, materialId: number) => void
    /** 清空选择时回调；字段含义与 StepCard 里的清空逻辑一致 */
    onClear: (key: string, patch: Partial<ReagentRow>) => void
}

/**
 * 原料名称单元格。
 *
 * 继承行由调用方（StepCard 的 render）先行分流，本组件只处理另外三种形态——
 * 这样这里的 props 就能保持简单，不必再传 prevProduct 之类的继承信息。
 */
function ReagentNameCell({ row: r, materials, onPick, onClear }: Props) {
    const state = nameCellState(r, materials)
    const { bound, unbound, sameName, canAutoLink } = state
    const hints = nameHints(r, state)
    const options = materialOptions(materials, state, r.name)

    const select = (
        <Select
            size="small" allowClear style={fullInput} placeholder="选择物料"
            showSearch={{
                optionFilterProp: 'label',
                // 显示只有名称（避免长名称被 CAS 挤掉），但搜索按「名称 + CAS」，CAS 依然可搜
                filterOption: (input, option) => {
                    const m = materials.find(x => x.id === (option as { value?: number })?.value)
                    const hay = `${m?.name ?? ''} ${m?.cas ?? ''}`.toLowerCase()
                    return hay.includes(input.trim().toLowerCase())
                },
            }}
            value={bound ? r.materialId : (unbound ? UNBOUND_MATERIAL : undefined)}
            options={options}
            // 未关联物料库的行用橙色字体标出
            labelRender={(props: { value?: unknown; label?: React.ReactNode }) =>
                props.value === UNBOUND_MATERIAL
                    ? <span style={{ color: '#faad14' }}>{props.label}</span>
                    : <>{props.label}</>
            }
            onChange={(v) => {
                if (v === UNBOUND_MATERIAL) return // 哨兵只用于显示名称，关联走右侧按钮
                if (v) { onPick(r, v) }
                else onClear(r._key, { materialId: 0, name: '', cas: '', formula: '', molWeight: 0, priceOptions: [], latestPrice: null, price: null })
            }}
        />
    )

    // 关联动作单独给一个按钮：哨兵项本就处于「已选中」状态，
    // rc-select 单选模式下点击它不会触发 onChange（值没变），用户会以为点了没反应。
    const linkBtn = (
        <Tooltip title={hints.link}>
            <Button size="small" type="text" disabled={!unbound || !canAutoLink}
                style={{ padding: '0 4px', flex: '0 0 auto' }}
                icon={<LinkOutlined style={{ fontSize: 12, color: !unbound ? '#d9d9d9' : canAutoLink ? '#1677ff' : '#bfbfbf' }} />}
                onClick={() => { if (unbound && canAutoLink) onPick(r, sameName[0].id) }} />
        </Tooltip>
    )

    // 已关联行也渲染同样的 flex 容器与按钮占位，
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title={hints.wrap}>
                <div style={{ flex: 1, minWidth: 0 }}>{select}</div>
            </Tooltip>
            {linkBtn}
        </div>
    )
}

export default ReagentNameCell
