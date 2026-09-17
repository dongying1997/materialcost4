import { useState } from 'react'
import { Card, Table, Radio, Select, InputNumber, Input, Button, Space, Tooltip, Tag, Dropdown } from 'antd'
import { PlusOutlined, DeleteOutlined, UpOutlined, DownOutlined, LinkOutlined, HistoryOutlined, WarningOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type {
  MaterialWithPrice, StepResult, ReagentRow, ProductRow, StepRow, IntermediateProduct,
  ReagentResult, ProductResult, PriceSnapshot,
} from '../types'
import { fmtNum, fmtMoney } from '../utils/file'
import { priceDrifted, priceFromOption, emptyPrice, PRICE_DRIFT_THRESHOLD } from '../utils/reaction'

// ── 统一列宽：原料表与产物表共用同一套栅格，保证上下对齐 ──────
// 两表均为 11 列：单选 | 名称区(2列) | 数值列(5列) | 结果列(2列) | 删除
// 名称区合计两表一致（名称 + 选择列），因此两表逐列等宽，栅格完全重合。
// 各列宽度按「该列最宽的表头文字 / 单元格内容」实测反推，取整后配置。
// 度量前提：size="small" 表格字号 14px（antd cellFontSizeSM），左右内边距各 8px，
// 故列宽 = 最宽内容 + 16（阈值见下方各列注释）。
const COL_RADIO = 46   // 底物/产物单选（单选钮 16 / 表头 28 → 需 44）
// 名称区两列等宽、CAS 与选物料两列等宽，两表的名称区合计一致，保证上下两表栅格对齐
const COL_NAME = 165  // 原料名称 / 产物名称（自由输入，名称区合计中的余量）
const COL_SEL = 94   // CAS(65.7) / 选物料(表头 42 → 需 58，均不撑列)
const COL_NUM = 96   // 数值输入列（表头最宽「实际产量 kg」75.9 → 需 92）
const COL_RST = 128  // 单价(数字+⚠/🕘 两个图标时需 111) / 理论产量(62.9) → 需 127
const COL_COST = 122  // 单位成本（表头 102.0 是本列最宽项 → 需 118；占比行仅 77.6）
const COL_DEL = 44   // 删除按钮（24 → 需 40）

// 两表总宽一致；容器更宽时表格按 minWidth:100% 等比拉伸，两表始终对齐
const TOTAL_WIDTH = COL_RADIO + COL_NAME + COL_SEL + COL_NUM * 5 + COL_RST + COL_COST + COL_DEL
//                 = 46 + (165+94) + 96*5 + 128 + 122 + 44 = 1079

// 输入控件铺满所在单元格
const fullInput = { width: '100%' } as const

/**
 * 数值输入框内文字居中。
 *
 * antd 给 InputNumber 内层 <input> 写死了 `text-align: start`
 * （见 antd/es/input-number/style），它的优先级高于单元格继承下来的
 * text-align——所以只把列声明成 align:'center' 无效，文字依旧贴左。
 * 这里用语义化 styles.input 把样式直接打到 <input> 元素上，才能压过那条规则。
 */
const centerText = { input: { textAlign: 'center' } } as const

// 未关联物料库的行在名称下拉里的哨兵值（真实物料 id 恒为正数，不会冲突）
const UNBOUND_MATERIAL = -1

/**
 * 需要淡灰底的行：多步反应里继承上一步产物的原料行，以及首步中作为底物的行。
 * 这两类都是「基准/承接」性质的行，用比表头稍浅的灰底与普通输入行区分开。
 */
const HIGHLIGHT_ROW_BG = '#f2f2f2'

/**
 * 只读数值单元格的外框，样式对齐 InputNumber / Select：
 * 1px #d9d9d9 边框、4px 圆角、24px 高、白底、左右 7px 内边距。
 * 只读列如果不画这个框，就会和旁边的可编辑列一虚一实，看起来像缺失了控件。
 */
const readOnlyCellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: 24,
  boxSizing: 'border-box',
  padding: '0 7px',
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  background: '#fff',
}

/** 只读数值单元格：套上 readOnlyCellStyle 的外框 */
function ReadOnlyCell({ children, align = 'center' }: {
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
}) {
  return (
    <div style={{
      ...readOnlyCellStyle,
      justifyContent: align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center',
    }}>{children}</div>
  )
}

/**
 * 单价单元格：可直接手动输入，也可从右侧图标下拉选物料库的历史价格。
 *
 * 布局：两个状态图标都放进输入框自带的 suffix 里，而不是并排的 flex 兄弟节点——
 * 后者会挤占本就很窄的数值区域。suffix 由输入框内部留位，数值区宽度稳定。
 *
 * 价格冲突时以方案自带的快照为准，仅在差异超过阈值时提示，不自动改写。
 */
function PriceCell({ row, onChange }: { row: ReagentRow; onChange: (p: PriceSnapshot | null) => void }) {
  const opts = row.priceOptions || []
  const drifted = priceDrifted(row.price, row.latestPrice)
  const latest = row.latestPrice
  const current = row.price?.unitPriceYuanPerKg ?? 0

  const driftMsg = drifted && latest
    ? `库中最新价 ${fmtMoney(latest.pricePerKg)} 元/kg（${latest.date}${latest.supplier ? ' · ' + latest.supplier : ''}），与方案当前单价相差超过 ${PRICE_DRIFT_THRESHOLD} 元/kg。方案按快照计算，未自动更新。`
    : ''

  // 价格来源说明：有供应商/日期就显示，便于确认这个数字是从哪来的
  const sourceMsg = row.price?.date || row.price?.supplier
    ? `当前单价来自：${row.price?.date || '-'}${row.price?.supplier ? ' · ' + row.price.supplier : ''}${row.price?.spec ? ' · ' + row.price.spec : ''}`
    : '手动输入单价'

  const historyMenu = {
    items: [
      ...(drifted && latest
        ? [{ key: 'hint', disabled: true, label: `库中最新价 ${fmtMoney(latest.pricePerKg)}（当前 ${fmtMoney(current)}）` }]
        : []),
      ...opts.map(o => ({
        key: String(o.priceId),
        label: `${o.date} ${o.price}${o.unit} → ${fmtMoney(o.pricePerKg)} 元/kg${o.supplier ? ' · ' + o.supplier : ''}`,
      })),
    ],
    onClick: ({ key }: { key: string }) => {
      const o = opts.find(x => String(x.priceId) === key)
      if (o) onChange(priceFromOption(o))
    },
  }

  return (
    <Tooltip title={drifted ? driftMsg : sourceMsg}>
      <InputNumber
        size="small"
        style={{ width: '100%' }}
        styles={centerText}
        min={0}
        step={0.01}
        controls={false}
        value={row.price ? current : null}
        placeholder="填单价"
        onChange={(v) => {
          if (v === null || v === undefined) { onChange(null); return }
          const n = typeof v === 'number' ? v : 0
          // 手动输入的单价是自定义报价，不再是物料库里的那条报价记录——
          // 必须丢掉 supplier/date/spec，否则界面会把库里的登记时间当成
          // 这条手填价格的来源显示出来（曾因此误报过）。
          onChange({ ...emptyPrice(), unitPriceYuanPerKg: n, price: n, unit: '元/kg' })
        }}
        suffix={
          // antd 给 -suffix 设了 pointer-events:none（它默认只用于放单位之类的装饰），
          // 不覆盖的话这里的图标既点不动、Tooltip 也悬不出来，会直接穿透到输入框。
          <Space size={2} style={{ pointerEvents: 'auto' }}>
            {drifted && (
              <Tooltip title={driftMsg}>
                <WarningOutlined style={{ color: '#faad14', fontSize: 13 }} />
              </Tooltip>
            )}
            <Tooltip title={opts.length ? '从物料库的历史价格中选择' : '该物料在库中没有价格记录'}>
              <Dropdown
                trigger={['click']}
                disabled={opts.length === 0}
                menu={historyMenu}
                placement="bottomRight"
              >
                <HistoryOutlined style={{
                  fontSize: 13,
                  color: opts.length ? '#1677ff' : '#d9d9d9',
                  cursor: opts.length ? 'pointer' : 'not-allowed',
                }} />
              </Dropdown>
            </Tooltip>
          </Space>
        }
      />
    </Tooltip>
  )
}

interface Props {
  index: number
  step: StepRow
  materials: MaterialWithPrice[]
  result?: StepResult | null
  /** 本步成本在总成本中的链式乘数（供原料占比展示，无 result 时为 1） */
  totalShareMultiplier?: number
  prevProduct?: IntermediateProduct | null
  canInherit: boolean
  onChange: (step: StepRow) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onPriceOptions?: (materialId: number) => void
}

function StepCard({ index, step, materials, result, totalShareMultiplier = 1, prevProduct, canInherit, onChange, onRemove, onMoveUp, onMoveDown, onPriceOptions }: Props) {
  // 步骤名称的三种状态：
  //   无内容且未激活 → 完全不显示（用 visibility 隐藏，仍保留热区，否则无法唤出）
  //   悬停 / 聚焦    → 显示完整输入框
  //   有内容且未激活 → 只显示文字，不显示边框
  const [nameHover, setNameHover] = useState(false)
  const [nameFocus, setNameFocus] = useState(false)
  const nameActive = nameHover || nameFocus

  // 操作按钮（添加原料 / 继承产物 / 上下移 / 删除步骤）只在鼠标进入本卡片时出现。
  // 用 visibility 而不是 display：按钮始终占位，显隐时行高与相邻控件位置不会跳动。
  const [hovered, setHovered] = useState(false)
  const hoverActions = { visibility: hovered ? 'visible' : 'hidden' } as const

  const rr = (i: number): ReagentResult | undefined => result?.reagents?.[i] || undefined
  const pr = (i: number): ProductResult | undefined => result?.products?.[i] || undefined

  const updateReagent = (key: string, patch: Partial<ReagentRow>) => {
    onChange({ ...step, reagents: step.reagents.map(r => (r._key === key ? { ...r, ...patch } : r)) })
  }
  const updateProduct = (key: string, patch: Partial<ProductRow>) => {
    onChange({ ...step, products: step.products.map(p => (p._key === key ? { ...p, ...patch } : p)) })
  }
  const markSubstrate = (key: string) => {
    onChange({ ...step, reagents: step.reagents.map(r => ({ ...r, isSubstrate: r._key === key })) })
  }
  const markPrimary = (key: string) => {
    onChange({ ...step, products: step.products.map(p => ({ ...p, isSubstrate: p._key === key })) })
  }
  const addReagent = () => {
    onChange({
      ...step,
      reagents: [...step.reagents, {
        _key: `r${Math.random().toString(36).slice(2)}`,
        materialId: 0, inherited: false, name: '', cas: '', formula: '', molWeight: 0,
        content: 100, recoveryRate: 0, isSubstrate: step.reagents.length === 0,
        equiv: null, amountKg: null, price: null, priceOptions: [], latestPrice: null,
      }],
    })
  }
  const addInherited = () => {
    const key = `r${Math.random().toString(36).slice(2)}`
    const inheritedRow: ReagentRow = {
      _key: key, materialId: 0, inherited: true, name: prevProduct?.name || '（继承上一步产物）',
      cas: '', formula: '', molWeight: prevProduct?.molWeight || 0,
      content: 100, recoveryRate: 0, isSubstrate: step.reagents.length === 0,
      equiv: null, amountKg: null, price: null, priceOptions: [], latestPrice: null,
    }
    const reagents = [...step.reagents]
    const last = reagents[reagents.length - 1]
    // 最后一行是空白行（未选物料/未填数据）时直接替代，避免残留空白行
    if (last && !last.inherited && !last.materialId && !last.name && !last.equiv && !last.amountKg) {
      reagents[reagents.length - 1] = { ...last, ...inheritedRow, _key: last._key, isSubstrate: last.isSubstrate }
    } else {
      reagents.push(inheritedRow)
    }
    onChange({ ...step, reagents })
  }

  const pickMaterial = (row: ReagentRow, materialId: number) => {
    const m = materials.find(x => x.id === materialId)
    if (!m) return
    updateReagent(row._key, {
      materialId, inherited: false, name: m.name, cas: m.cas, formula: m.formula,
      molWeight: m.molWeight, content: m.content || row.content,
      recoveryRate: row.recoveryRate || m.recoveryRate || 0,
      // 保留已填的单价：换/关联物料不应把用户手填的价格抹掉。
      // 想改用库中价，点单价右侧的历史价图标选择即可（差异会在单元格里提示）。
      price: row.price, priceOptions: [], latestPrice: null,
    })
    // 选完物料后拉取该物料的历史价格，供下拉选择与价格变动提示
    onPriceOptions?.(materialId)
  }

  const reagentColumns: ColumnsType<ReagentRow> = [
    {
      title: '底物', width: COL_RADIO, align: 'center',
      render: (_, r) => (
        <Tooltip title={r.isSubstrate ? '底物（1 eq 基准）' : '标记为底物'}>
          <Radio checked={r.isSubstrate} onClick={() => markSubstrate(r._key)} />
        </Tooltip>
      ),
    },
    {
      // 表头与内容同为左对齐：本列不设 align，antd 的 thead 规则默认 text-align:start，
      // 无需额外覆盖（rc-table 的 align 会同时作用于 th 和 td，设了反而会把两处一起改掉）
      title: '原料名称', width: COL_NAME,
      render: (_, r) => r.inherited ? (
        // 继承行：文字沿用常规颜色（只靠灰底区分），
        // 右侧放一个橙色链接图标——位置与普通行的「关联物料库」按钮一致，仅换颜色与提示。
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ReadOnlyCell align="left">
              <span style={{
                fontSize: 13, color: '#333',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.name}</span>
            </ReadOnlyCell>
          </div>
          <Tooltip title="继承自上一步的产物，分子量与单价随上一步自动带入">
            <Button size="small" type="text" disabled
              style={{ padding: '0 4px', flex: '0 0 auto' }}
              icon={<LinkOutlined style={{ fontSize: 12, color: '#fa8c16' }} />} />
          </Tooltip>
        </div>
      ) : (() => {
        // 未关联物料库但有名称的行（如导入的方案，导入时 materialId 会被清空）：
        // Select 找不到匹配项就会渲染成空白的「选择物料」，名称明明在数据里却看不见。
        // 因此把当前名称作为哨兵项注入，保证名称始终可见。
        //
        // 哨兵项的标签写成「点此关联：XXX」而不是裸名称——原来看起来和真实选项
        // 一模一样，用户点它却毫无反应（点的是哨兵，不是物料）。现在：
        //   · 库中恰有一条同名物料 → 点哨兵即自动关联
        //   · 搜不到或多条同名   → 哨兵置灰，改用下拉里的真实物料
        const bound = r.materialId > 0 && materials.some(m => m.id === r.materialId)
        const unbound = !bound && !!r.name
        const sameName = unbound ? materials.filter(m => m.name === r.name) : []
        const canAutoLink = sameName.length === 1
        // 哨兵项只显示名称本身（未关联状态由橙色字体体现，详见 labelRender）；
        // 无法自动关联时补一句原因，避免用户找不到可点的项。
        const sentinelLabel = !unbound ? ''
          : canAutoLink ? r.name
            : sameName.length > 1 ? `${r.name}（库中有 ${sameName.length} 条同名，请从下方选择）`
              : `${r.name}（物料库中没有此物料）`
        // 标签只显示名称（不再带 CAS 后缀，避免长名称被挤掉），
        // 但把名称与 CAS 拼在一个隐藏字段里参与搜索，CAS 依然可搜。
        const options: { value: number; label: string; disabled?: boolean }[] =
          materials.map(m => ({ value: m.id, label: m.name }))
        if (unbound) {
          options.unshift({ value: UNBOUND_MATERIAL, label: sentinelLabel, disabled: !canAutoLink })
        }
        const select = (
          <Select
            size="small" showSearch allowClear style={fullInput} placeholder="选择物料"
            optionFilterProp="label"
            // 搜索用「名称 + CAS」的复合串，显示仍只有名称
            filterOption={(input, option) => {
              const m = materials.find(x => x.id === (option as { value?: number })?.value)
              const hay = `${m?.name ?? ''} ${m?.cas ?? ''}`.toLowerCase()
              return hay.includes(input.trim().toLowerCase())
            }}
            value={bound ? r.materialId : (unbound ? UNBOUND_MATERIAL : undefined)}
            options={options}
            // 未关联物料库的行用橙色字体标出，替代原先在名称前加「点此关联：」前缀
            labelRender={(props: { value?: unknown; label?: React.ReactNode }) =>
              props.value === UNBOUND_MATERIAL
                ? <span style={{ color: '#faad14' }}>{props.label}</span>
                : <>{props.label}</>
            }
            onChange={(v) => {
              if (v === UNBOUND_MATERIAL) return // 哨兵只用于显示名称，关联走右侧按钮
              if (v) { pickMaterial(r, v) }
              else updateReagent(r._key, { materialId: 0, name: '', cas: '', formula: '', molWeight: 0, priceOptions: [], latestPrice: null, price: null })
            }}
          />
        )
        // 关联动作单独给一个按钮，而不是复用下拉项：
        // 哨兵项本来就处于「已选中」状态，rc-select 单选模式下点击它不会触发
        // onChange（值没变），用户会以为点了没反应。
        const linkBtn = (
          <Tooltip title={
            !unbound ? '' : canAutoLink ? `关联到物料库中的「${r.name}」`
              : sameName.length > 1 ? `库中有 ${sameName.length} 条同名物料，无法自动关联，请从下拉里选择`
                : '物料库中没有同名物料，无法自动关联'
          }>
            <Button size="small" type="text" disabled={!unbound || !canAutoLink}
              style={{ padding: '0 4px', flex: '0 0 auto' }}
              icon={<LinkOutlined style={{ fontSize: 12, color: !unbound ? '#d9d9d9' : canAutoLink ? '#1677ff' : '#bfbfbf' }} />}
              onClick={() => { if (unbound && canAutoLink) pickMaterial(r, sameName[0].id) }} />
          </Tooltip>
        )
        // 不论是否已关联都渲染同样的 flex 容器与按钮占位：
        // 否则未关联行会多出一个 26px 的按钮，把 Select 挤窄（实测两行输入框宽度差 26px），
        // 两行的输入框宽度就不一致了。
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title={
              !unbound ? '' : canAutoLink
                ? '该原料未关联物料库（来自导入的方案），计算使用方案自带数据；点右侧 🔗 可关联到库中同名物料'
                : sameName.length > 1
                  ? `该原料未关联物料库；库中有 ${sameName.length} 条同名物料，请从下拉里选择`
                  : '该原料未关联物料库（来自导入的方案），计算使用方案自带数据；请从下拉里选择对应物料'
            }>
              <div style={{ flex: 1, minWidth: 0 }}>{select}</div>
            </Tooltip>
            {linkBtn}
          </div>
        )
      })(),
    },
    {
      title: 'CAS', width: COL_SEL, align: 'center',
      render: (_, r) => (
        <ReadOnlyCell>
          <span style={{ fontSize: 13, color: r.cas ? '#333' : '#bbb' }}>{r.cas || '-'}</span>
        </ReadOnlyCell>
      ),
    },
    {
      title: '分子量', width: COL_NUM, align: 'center',
      render: (_, r) => (
        <ReadOnlyCell>
          <span style={{ fontSize: 13 }}>{r.molWeight ? fmtMoney(r.molWeight) : '-'}</span>
        </ReadOnlyCell>
      ),
    },
    {
      title: '含量%', width: COL_NUM, align: 'center',
      render: (_, r) => (
        <InputNumber size="small" style={fullInput} styles={centerText} min={0} max={100} value={r.content}
          onChange={(v) => updateReagent(r._key, { content: v ?? 100 })} />
      ),
    },
    {
      title: '回收率%', width: COL_NUM, align: 'center',
      render: (_, r) => (
        <InputNumber size="small" style={fullInput} styles={centerText} min={0} max={100} value={r.recoveryRate}
          onChange={(v) => updateReagent(r._key, { recoveryRate: v ?? 0 })} />
      ),
    },
    {
      title: '当量', width: COL_NUM, align: 'center',
      render: (_, r) => r.inherited && r.isSubstrate ? (
        <InputNumber size="small" style={fullInput} styles={centerText} value={1} disabled />
      ) : (
        <InputNumber size="small" style={fullInput} styles={centerText} min={0} step={0.1} value={r.equiv ?? undefined}
          placeholder="可空" onChange={(v) => updateReagent(r._key, { equiv: v ?? null })} />
      ),
    },
    {
      title: '投料量 kg', width: COL_NUM, align: 'center',
      render: (_, r) => (
        <InputNumber size="small" style={fullInput} styles={centerText} min={0} step={0.01} precision={2} value={r.amountKg ?? undefined}
          placeholder="可空" onChange={(v) => updateReagent(r._key, { amountKg: v ?? null })} />
      ),
    },
    {
      title: '单价 元/kg', width: COL_RST, align: 'center',
      render: (_, r) => {
        const idx = step.reagents.indexOf(r)
        if (r.inherited) {
          const up = rr(idx)?.unitPrice
          return (
            <ReadOnlyCell>
              <span style={{ color: '#333', fontWeight: 500, fontSize: 13 }}>{up ? fmtMoney(up) : '（继承）'}</span>
            </ReadOnlyCell>
          )
        }
        return <PriceCell row={r} onChange={(p) => updateReagent(r._key, { price: p })} />
      },
    },
    {
      title: '单位成本(元/kg)', width: COL_COST, align: 'right',
      render: (_, r) => {
        const idx = step.reagents.indexOf(r)
        const res = rr(idx)
        const c = res?.cost
        const warn = res?.warnings?.length
        if (!c) return <span style={{ color: '#bbb' }}>-</span>
        // 单位成本 = 本原料成本 ÷ 本步主产物产量（与产物表同一分母，便于横向比较）
        const unit = res?.unitCost
        const stepPct = result && result.totalCost > 0 ? (c / result.totalCost * 100) : 0
        // 占总成本比例：本步占比 × 链式乘数（承载前续步骤成本）
        const totalPct = stepPct * totalShareMultiplier
        const isLastChain = result && result.totalCost > 0 && Math.abs(totalShareMultiplier - 1) < 1e-9
        return (
          <div style={{ textAlign: 'right', lineHeight: 1.35 }}>
            <Tooltip title={`成本 ${fmtMoney(c)} 元 ÷ 主产物产量`}>
              <div style={{ color: warn ? '#faad14' : '#333', fontWeight: 500 }}>
                {unit ? fmtMoney(unit) : '-'}
              </div>
            </Tooltip>
            {result && result.totalCost > 0 && (
              isLastChain ? (
                <Tooltip title="占本步成本比例">
                  <div style={{ fontSize: 11, color: '#999' }}>{fmtNum(stepPct, 1)}%</div>
                </Tooltip>
              ) : (
                <Tooltip title="本步占比 / 占总成本占比">
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {fmtNum(stepPct, 1)}% <span style={{ color: '#ccc' }}>/</span> <span style={{ color: '#333' }}>{fmtNum(totalPct, 1)}%</span>
                  </div>
                </Tooltip>
              )
            )}
          </div>
        )
      },
    },
    {
      title: '', width: COL_DEL, align: 'center',
      // 删除按钮与标题栏的操作按钮同一悬停状态：鼠标离开卡片即隐藏
      render: (_, r) => (
        <span style={hoverActions}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />}
            disabled={step.reagents.length <= 1}
            onClick={() => onChange({ ...step, reagents: step.reagents.filter(x => x._key !== r._key) })} />
        </span>
      ),
    },
  ]

  const productColumns: ColumnsType<ProductRow> = [
    {
      title: '产物', width: COL_RADIO, align: 'center',
      render: (_, p) => (
        <Tooltip title={p.isSubstrate ? '主产物（供下一步继承）' : '标记为主产物'}>
          <Radio checked={p.isSubstrate} onClick={() => markPrimary(p._key)} />
        </Tooltip>
      ),
    },
    {
      title: '产物名称', width: COL_NAME,
      render: (_, p) => (
        // 右侧留出与原料名称列中 🔗 按钮等宽的空间，
        // 使两列的输入框实际宽度一致（列宽相同，但原料那格被按钮占去 28px）
        <Input size="small" style={{ width: 'calc(100% - 26px)' }} value={p.name} placeholder="产物名称"
          onChange={(e) => updateProduct(p._key, { name: e.target.value })} />
      ),
    },
    {
      title: '选物料', width: COL_SEL, align: 'center',
      render: (_, p) => (
        <Select size="small" showSearch allowClear style={fullInput} placeholder="从物料库选"
          optionFilterProp="label"
          // 显示只有名称；搜索按「名称 + CAS」，因此输入 CAS 也能筛出物料
          filterOption={(input, option) => {
            const m = materials.find(x => x.id === (option as { value?: number })?.value)
            const hay = `${m?.name ?? ''} ${m?.cas ?? ''}`.toLowerCase()
            return hay.includes(input.trim().toLowerCase())
          }}
          value={p.materialId || undefined}
          options={materials.map(m => ({ value: m.id, label: m.name }))}
          onChange={(v) => {
            const m = materials.find(x => x.id === v)
            if (m) updateProduct(p._key, { materialId: v, name: m.name, cas: m.cas, formula: m.formula, molWeight: m.molWeight })
            else updateProduct(p._key, { materialId: 0 })
          }}
        />
      ),
    },
    {
      title: '分子量', width: COL_NUM, align: 'center',
      render: (_, p) => (
        <InputNumber size="small" style={fullInput} styles={centerText} min={0} value={p.molWeight || undefined}
          placeholder="必填" onChange={(v) => updateProduct(p._key, { molWeight: v ?? 0 })} />
      ),
    },
    {
      title: '计量数', width: COL_NUM, align: 'center',
      render: (_, p) => (
        <InputNumber size="small" style={fullInput} styles={centerText} min={0} step={0.1} value={p.molarRatio || undefined}
          onChange={(v) => updateProduct(p._key, { molarRatio: v ?? 1 })} />
      ),
    },
    {
      title: '重量收率%', width: COL_NUM, align: 'center',
      render: (_, p) => (
        <InputNumber size="small" style={fullInput} styles={centerText} min={0} max={200} value={p.weightYield ?? undefined}
          placeholder="可空" onChange={(v) => updateProduct(p._key, { weightYield: v ?? null })} />
      ),
    },
    {
      title: '摩尔收率%', width: COL_NUM, align: 'center',
      render: (_, p) => (
        <InputNumber size="small" style={fullInput} styles={centerText} min={0} max={200} value={p.molarYield ?? undefined}
          placeholder="可空" onChange={(v) => updateProduct(p._key, { molarYield: v ?? null })} />
      ),
    },
    {
      title: '实际产量 kg', width: COL_NUM, align: 'center',
      render: (_, p) => (
        <InputNumber size="small" style={fullInput} styles={centerText} min={0} step={0.01} precision={2} value={p.actualYield ?? undefined}
          placeholder="可空" onChange={(v) => updateProduct(p._key, { actualYield: v ?? null })} />
      ),
    },
    {
      title: '理论产量 kg', width: COL_RST, align: 'center',
      render: (_, p) => {
        const x = pr(step.products.indexOf(p))?.theoreticalYieldKg
        return <ReadOnlyCell><span style={{ fontSize: 13 }}>{x ? fmtMoney(x) : '-'}</span></ReadOnlyCell>
      },
    },
    {
      title: '单位成本(元/kg)', width: COL_COST, align: 'right',
      render: (_, p) => {
        const x = pr(step.products.indexOf(p))?.unitCost
        return <span style={{ fontSize: 13, fontWeight: 500 }}>{x ? fmtMoney(x) : '-'}</span>
      },
    },
    {
      title: '', width: COL_DEL, align: 'center',
      // 删除按钮与标题栏的操作按钮同一悬停状态：鼠标离开卡片即隐藏
      render: (_, p) => (
        <span style={hoverActions}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />}
            disabled={step.products.length <= 1}
            onClick={() => onChange({ ...step, products: step.products.filter(x => x._key !== p._key) })} />
        </span>
      ),
    },
  ]

  const inheritedExists = step.reagents.some(r => r.inherited)
  const hasBlocking = !!result && (result.blockingErrors || []).length > 0
  const warnings = result?.warnings || []

  // 公共 Table 属性：两表字号、行高、总宽完全一致
  const tableProps = {
    size: 'small' as const,
    rowKey: '_key' as const,
    pagination: false as const,
    style: { marginBottom: 0 },
    // 固定表格布局：列宽严格按声明值分配。
    // 默认的 auto 布局会因内容（两表内容不同）撑开列、再按比例放大，
    // 导致上下两表的数值列逐渐错位（实测分子量列相差 37px）。
    tableLayout: 'fixed' as const,
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: '8px 12px 10px' } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={
        // 步骤编号、名称、添加按钮同处一行：高度一致、垂直居中
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 16, color: '#1677ff' }}>步骤 {index + 1}</span>
          <span
            // 宽度取原料名称列的列宽，与之保持一致（实测原料侧输入框 = 165-28=137）
            style={{ display: 'inline-flex', alignItems: 'center', width: COL_NAME }}
            onMouseEnter={() => setNameHover(true)}
            onMouseLeave={() => setNameHover(false)}
          >
            <Input
              size="small"
              style={{
                width: '100%',
                // 与「步骤 n」标签一致：16px + 600 字重 + 主蓝色
                fontSize: 16,
                fontWeight: 600,
                color: '#1677ff',
                // 关键：文本输入框的高度由 行高×字号 + 边框 撑出，不是固定 24px。
                // 16px 配 antd 默认行高 1.571 会撑到 27.1px，比同排 24px 的按钮高出 3px、
                // 把整行顶歪。这里把行高压到 1.375（16×1.375=22 + 边框 2 = 24），
                // 与按钮、下方的查询输入框严格等高。
                lineHeight: 1.375,
                // 空名称且未悬停/聚焦时彻底不显示；元素仍在，保证热区与布局稳定
                visibility: (!step.name && !nameActive) ? 'hidden' : 'visible',
                // 非激活时把边框/底色透明化，看起来就是一段纯文本。
                // 这里刻意固定用 outlined、只改颜色：若在 borderless↔outlined 之间切换，
                // antd 会过渡 border-width 0→1px，而此刻边框色仍是 currentColor（黑），
                // 于是悬停瞬间闪出一道黑边。
                ...(nameActive ? {} : { borderColor: 'transparent', background: 'transparent' }),
              }}
              variant="outlined"
              value={step.name}
              // 16px 下「步骤名称（可选）」需 128px、而输入框内容宽仅 121px 会被截断；
              // 左侧已有「步骤 n」标签，「步骤」二字冗余，缩短后 96px，留有余量
              placeholder="名称（可选）"
              onFocus={() => setNameFocus(true)}
              onBlur={() => setNameFocus(false)}
              onChange={(e) => onChange({ ...step, name: e.target.value })} />
          </span>
          <Space size={6} style={hoverActions}>
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addReagent}>添加原料</Button>
            {canInherit && !inheritedExists && (
              <Button size="small" type="dashed" icon={<LinkOutlined />} onClick={addInherited}>
                继承产物
              </Button>
            )}
          </Space>
        </div>
      }
      extra={
        <Space>
          <span style={{ fontSize: 14, color: '#999' }}>本步总成本：
            {/* 总成本只精确到元（个位），金额取整显示，避免标题栏被小数撑长 */}
            <b style={{ color: '#1677ff', marginLeft: 4 }}>
              {result ? Math.round(result.totalCost).toLocaleString('zh-CN') : '-'} 元
            </b>
          </span>
          <Space size={8} style={hoverActions}>
            <Button size="small" icon={<UpOutlined />} disabled={!onMoveUp} onClick={onMoveUp} />
            <Button size="small" icon={<DownOutlined />} disabled={!onMoveDown} onClick={onMoveDown} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={onRemove}>删除步骤</Button>
          </Space>
        </Space>
      }
    >
      <Table {...tableProps} dataSource={step.reagents} columns={reagentColumns}
        scroll={{ x: TOTAL_WIDTH }}
        onRow={(r) => {
          const highlight = r.inherited || (index === 0 && r.isSubstrate)
          return highlight ? { style: { background: HIGHLIGHT_ROW_BG } } : {}
        }}
        locale={{ emptyText: '暂无原料' }} />

      <Table {...tableProps} dataSource={step.products} columns={productColumns}
        scroll={{ x: TOTAL_WIDTH }}
        style={{ marginTop: 10, marginBottom: 0 }}
        locale={{ emptyText: '暂无产物' }} />

      {hasBlocking && (
        <div style={{ marginTop: 8 }}>
          <Tag color="red">阻塞</Tag>
          {(result?.blockingErrors || []).map((e, i) => (
            <span key={i} style={{ color: '#cf1322', fontSize: 12, marginRight: 12 }}>{e}</span>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <Tag color="gold">警告</Tag>
          {warnings.map((e, i) => (
            <span key={i} style={{ color: '#d48806', fontSize: 12, marginRight: 12 }}>{e}</span>
          ))}
        </div>
      )}
    </Card>
  )
}

export default StepCard
