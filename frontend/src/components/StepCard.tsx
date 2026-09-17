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
// 名称区合计两表一致（原料：名称190+CAS110，产物：名称140+选物料160=300），
// 其后分子量(第4列)、投料/实际产量kg(第8列)、单位成本(第10列)栅格完全重合。
const COL_RADIO  = 46    // 底物/产物单选
const COL_NAME_R = 190   // 原料名称（Select）
const COL_CAS    = 110   // CAS
const COL_NAME_P = 140   // 产物名称（Input）
const COL_SELP   = 160   // 选物料（Select）
const COL_NUM    = 100   // 数值输入列（分子量/含量/收率/当量/投料量等）
const COL_RST    = 104   // 单价 / 理论产量
const COL_COST   = 130   // 单位成本(元/kg)（原料与产物同列）
const COL_DEL    = 44    // 删除按钮

// 两表总宽一致；容器更宽时表格按 minWidth:100% 等比拉伸，两表始终对齐
const TOTAL_WIDTH = COL_RADIO + COL_NAME_R + COL_CAS + COL_NUM * 5 + COL_RST + COL_COST + COL_DEL
//                 = 46 + (190+110) + 100*5 + 104 + 130 + 44 = 1124

// 输入控件铺满所在单元格
const fullInput = { width: '100%' } as const

// 未关联物料库的行在名称下拉里的哨兵值（真实物料 id 恒为正数，不会冲突）
const UNBOUND_MATERIAL = -1

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
        min={0}
        step={0.01}
        controls={false}
        value={row.price ? current : null}
        placeholder="填单价"
        onChange={(v) => {
          if (v === null || v === undefined) { onChange(null); return }
          const n = typeof v === 'number' ? v : 0
          // 手动改单价视为自定义报价：保留原有供应商/日期信息，仅换数值
          onChange({ ...(row.price || emptyPrice()), unitPriceYuanPerKg: n, price: n, unit: '元/kg' })
        }}
        suffix={
          <Space size={2}>
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
      price: null, priceOptions: [], latestPrice: null,
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
      title: '原料名称', width: COL_NAME_R,
      render: (_, r) => r.inherited ? (
        <Space size={4}>
          <LinkOutlined style={{ color: '#fa8c16', fontSize: 12 }} />
          <Tag color="orange" style={{
            margin: 0, maxWidth: COL_NAME_R - 24, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{r.name}</Tag>
        </Space>
      ) : (() => {
        // 未关联物料库但有名称的行（如导入的方案，导入时 materialId 会被清空）：
        // Select 找不到匹配项就会渲染成空白的「选择物料」，名称明明在数据里却看不见。
        // 因此把当前名称作为一个哨兵选项注入，保证名称始终可见，同时仍可下拉改选。
        const bound = r.materialId > 0 && materials.some(m => m.id === r.materialId)
        const unbound = !bound && !!r.name
        const options = materials.map(m => ({ value: m.id, label: `${m.name}${m.cas ? `（${m.cas}）` : ''}` }))
        if (unbound) options.unshift({ value: UNBOUND_MATERIAL, label: r.name })
        const select = (
          <Select
            size="small" showSearch allowClear style={fullInput} placeholder="选择物料"
            optionFilterProp="label"
            value={bound ? r.materialId : (unbound ? UNBOUND_MATERIAL : undefined)}
            options={options}
            onChange={(v) => {
              if (v === UNBOUND_MATERIAL) return // 哨兵项不可选，重新选物料请挑真实物料
              if (v) { pickMaterial(r, v) }
              else updateReagent(r._key, { materialId: 0, name: '', cas: '', formula: '', molWeight: 0, priceOptions: [], latestPrice: null, price: null })
            }}
          />
        )
        return unbound
          ? <Tooltip title="该原料未关联物料库（来自导入的方案），计算使用方案自带数据；点此可重新关联到物料库中的物料">{select}</Tooltip>
          : select
      })(),
    },
    {
      title: 'CAS', width: COL_CAS, align: 'center',
      render: (_, r) => (
        <span style={{ fontSize: 13, color: r.cas ? '#333' : '#bbb' }}>{r.cas || '-'}</span>
      ),
    },
    {
      title: '分子量', width: COL_NUM, align: 'center',
      render: (_, r) => <span style={{ fontSize: 13 }}>{r.molWeight ? fmtMoney(r.molWeight) : '-'}</span>,
    },
    {
      title: '含量%', width: COL_NUM, align: 'center',
      render: (_, r) => (
        <InputNumber size="small" style={fullInput} min={0} max={100} value={r.content}
          onChange={(v) => updateReagent(r._key, { content: v ?? 100 })} />
      ),
    },
    {
      title: '回收率%', width: COL_NUM, align: 'center',
      render: (_, r) => (
        <InputNumber size="small" style={fullInput} min={0} max={100} value={r.recoveryRate}
          onChange={(v) => updateReagent(r._key, { recoveryRate: v ?? 0 })} />
      ),
    },
    {
      title: '当量', width: COL_NUM, align: 'center',
      render: (_, r) => r.inherited && r.isSubstrate ? (
        <InputNumber size="small" style={fullInput} value={1} disabled />
      ) : (
        <InputNumber size="small" style={fullInput} min={0} step={0.1} value={r.equiv ?? undefined}
          placeholder="可空" onChange={(v) => updateReagent(r._key, { equiv: v ?? null })} />
      ),
    },
    {
      title: '投料量 kg', width: COL_NUM, align: 'center',
      render: (_, r) => (
        <InputNumber size="small" style={fullInput} min={0} step={0.001} value={r.amountKg ?? undefined}
          placeholder="可空" onChange={(v) => updateReagent(r._key, { amountKg: v ?? null })} />
      ),
    },
    {
      title: '单价 元/kg', width: COL_RST, align: 'center',
      render: (_, r) => {
        const idx = step.reagents.indexOf(r)
        if (r.inherited) {
          const up = rr(idx)?.unitPrice
          return <span style={{ color: '#fa8c16', fontWeight: 500, fontSize: 13 }}>{up ? fmtMoney(up) : '（继承）'}</span>
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
                    {fmtNum(stepPct, 1)}% <span style={{ color: '#ccc' }}>/</span> <span style={{ color: '#1677ff' }}>{fmtNum(totalPct, 1)}%</span>
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
      render: (_, r) => (
        <Button size="small" type="text" danger icon={<DeleteOutlined />}
          disabled={step.reagents.length <= 1}
          onClick={() => onChange({ ...step, reagents: step.reagents.filter(x => x._key !== r._key) })} />
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
      title: '产物名称', width: COL_NAME_P,
      render: (_, p) => (
        <Input size="small" style={fullInput} value={p.name} placeholder="产物名称"
          onChange={(e) => updateProduct(p._key, { name: e.target.value })} />
      ),
    },
    {
      title: '选物料', width: COL_SELP,
      render: (_, p) => (
        <Select size="small" showSearch allowClear style={fullInput} placeholder="从物料库选"
          optionFilterProp="label" value={p.materialId || undefined}
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
        <InputNumber size="small" style={fullInput} min={0} value={p.molWeight || undefined}
          placeholder="必填" onChange={(v) => updateProduct(p._key, { molWeight: v ?? 0 })} />
      ),
    },
    {
      title: '计量数', width: COL_NUM, align: 'center',
      render: (_, p) => (
        <InputNumber size="small" style={fullInput} min={0} step={0.1} value={p.molarRatio || undefined}
          onChange={(v) => updateProduct(p._key, { molarRatio: v ?? 1 })} />
      ),
    },
    {
      title: '重量收率%', width: COL_NUM, align: 'center',
      render: (_, p) => (
        <InputNumber size="small" style={fullInput} min={0} max={200} value={p.weightYield ?? undefined}
          placeholder="可空" onChange={(v) => updateProduct(p._key, { weightYield: v ?? null })} />
      ),
    },
    {
      title: '摩尔收率%', width: COL_NUM, align: 'center',
      render: (_, p) => (
        <InputNumber size="small" style={fullInput} min={0} max={200} value={p.molarYield ?? undefined}
          placeholder="可空" onChange={(v) => updateProduct(p._key, { molarYield: v ?? null })} />
      ),
    },
    {
      title: '实际产量 kg', width: COL_NUM, align: 'center',
      render: (_, p) => (
        <InputNumber size="small" style={fullInput} min={0} step={0.001} value={p.actualYield ?? undefined}
          placeholder="可空" onChange={(v) => updateProduct(p._key, { actualYield: v ?? null })} />
      ),
    },
    {
      title: '理论产量 kg', width: COL_RST, align: 'center',
      render: (_, p) => { const x = pr(step.products.indexOf(p))?.theoreticalYieldKg; return <span style={{ fontSize: 13 }}>{x ? fmtMoney(x) : '-'}</span> },
    },
    {
      title: '单位成本(元/kg)', width: COL_COST, align: 'right',
      render: (_, p) => { const x = pr(step.products.indexOf(p))?.unitCost; return <span style={{ fontSize: 13, fontWeight: 500 }}>{x ? fmtMoney(x) : '-'}</span> },
    },
    {
      title: '', width: COL_DEL, align: 'center',
      render: (_, p) => (
        <Button size="small" type="text" danger icon={<DeleteOutlined />}
          disabled={step.products.length <= 1}
          onClick={() => onChange({ ...step, products: step.products.filter(x => x._key !== p._key) })} />
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
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: '8px 12px 10px' } }}
      title={
        <Space size={8}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>步骤 {index + 1}</span>
          <Input size="small" style={{ width: 180 }} value={step.name} placeholder="步骤名称（可选）"
            onChange={(e) => onChange({ ...step, name: e.target.value })} />
        </Space>
      }
      extra={
        <Space>
          <Button size="small" icon={<UpOutlined />} disabled={!onMoveUp} onClick={onMoveUp} />
          <Button size="small" icon={<DownOutlined />} disabled={!onMoveDown} onClick={onMoveDown} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={onRemove}>删除步骤</Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size={6}>
          <span style={{ color: '#666', fontSize: 13 }}>原料</span>
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addReagent}>添加原料</Button>
          {canInherit && !inheritedExists && (
            <Button size="small" type="dashed" icon={<LinkOutlined />} onClick={addInherited}>
              继承上一步产物
            </Button>
          )}
        </Space>
        <Space size={12}>
          <span style={{ fontSize: 13 }}>本步总成本：
            <b style={{ color: '#1677ff', marginLeft: 4 }}>{result ? fmtMoney(result.totalCost) : '-'} 元</b>
          </span>
          {result && <span style={{ fontSize: 12, color: '#999' }}>底物摩尔数 {fmtMoney(result.substrateMoles)} mol</span>}
        </Space>
      </div>

      <Table {...tableProps} dataSource={step.reagents} columns={reagentColumns}
        scroll={{ x: TOTAL_WIDTH }}
        onRow={(r) => (r.inherited ? { style: { background: '#fff7e6' } } : {})}
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
