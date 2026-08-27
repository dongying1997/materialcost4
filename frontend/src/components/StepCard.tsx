import { Card, Table, Radio, Select, InputNumber, Input, Button, Space, Tooltip, Tag } from 'antd'
import { PlusOutlined, DeleteOutlined, UpOutlined, DownOutlined, LinkOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type {
  MaterialWithPrice, StepResult, ReagentRow, ProductRow, StepRow, IntermediateProduct,
  ReagentResult, ProductResult,
} from '../types'
import { fmtNum } from '../utils/file'

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
  onPriceOptions?: (materialId: number, rowKey: string) => void
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
        equiv: null, amountKg: null, unitPriceYuanPerKg: null, priceSourceId: 0, priceOptions: [],
      }],
    })
  }
  const addInherited = () => {
    const key = `r${Math.random().toString(36).slice(2)}`
    const inheritedRow: ReagentRow = {
      _key: key, materialId: 0, inherited: true, name: prevProduct?.name || '（继承上一步产物）',
      cas: '', formula: '', molWeight: prevProduct?.molWeight || 0,
      content: 100, recoveryRate: 0, isSubstrate: step.reagents.length === 0,
      equiv: null, amountKg: null, unitPriceYuanPerKg: null, priceSourceId: 0, priceOptions: [],
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
  // const addProduct = () => {
  //   onChange({
  //     ...step,
  //     products: [...step.products, {
  //       _key: `p${Math.random().toString(36).slice(2)}`,
  //       materialId: 0, inherited: false, name: '', cas: '', formula: '', molWeight: 0,
  //       isSubstrate: step.products.length === 0, molarRatio: 1,
  //       weightYield: null, molarYield: null, actualYield: null,
  //     }],
  //   })
  // }

  const pickMaterial = (row: ReagentRow, materialId: number) => {
    const m = materials.find(x => x.id === materialId)
    if (!m) return
    updateReagent(row._key, {
      materialId, inherited: false, name: m.name, cas: m.cas, formula: m.formula,
      molWeight: m.molWeight, content: m.content || row.content,
      recoveryRate: row.recoveryRate || m.recoveryRate || 0,
      priceSourceId: 0, unitPriceYuanPerKg: null, priceOptions: row.priceOptions,
    })
  }

  const reagentColumns: ColumnsType<ReagentRow> = [
    {
      title: '底物', width: 40, align: 'center',
      render: (_, r) => (
        <Tooltip title={r.isSubstrate ? '底物（1 eq 基准）' : '标记为底物'}>
          <Radio checked={r.isSubstrate} onClick={() => markSubstrate(r._key)} />
        </Tooltip>
      ),
    },
    {
      title: '原料名称', width: 200,
      render: (_, r) => r.inherited ? (
        <Space size={4}>
          <LinkOutlined style={{ color: '#fa8c16' }} />
          <Tag color="orange" style={{ margin: 0 }}>{r.name}</Tag>
        </Space>
      ) : (
        <Select
          size="small" showSearch allowClear style={{ width: 200 }} placeholder="选择物料"
          optionFilterProp="label" value={r.materialId || undefined}
          options={materials.map(m => ({ value: m.id, label: `${m.name}${m.cas ? `（${m.cas}）` : ''}` }))}
          onChange={(v) => {
            pickMaterial(r, v)
            if (v) onPriceOptions?.(v, r._key)
          }}
        />
      ),
    },
    {
      title: 'CAS', width: 60, render: (_, r) => <span style={{ fontSize: 12 }}>{r.cas || '-'}</span>,
    },
    {
      title: '分子量', width: 60, align: 'left',
      render: (_, r) => <span>{r.molWeight ? fmtNum(r.molWeight) : '-'}</span>,
    },
    {
      title: '含量%', width: 60,
      render: (_, r) => (
        <InputNumber size="small" style={{ width: 60 }} min={0} max={100} value={r.content}
          onChange={(v) => updateReagent(r._key, { content: v ?? 100 })} />
      ),
    },
    {
      title: '回收率%', width: 60,
      render: (_, r) => (
        <InputNumber size="small" style={{ width: 60 }} min={0} max={100} value={r.recoveryRate}
          onChange={(v) => updateReagent(r._key, { recoveryRate: v ?? 0 })} />
      ),
    },
    {
      title: '当量', width: 60,
      render: (_, r) => r.inherited && r.isSubstrate ? <span style={{ color: '#999' }}>1</span> : (
        <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.1} value={r.equiv ?? undefined}
          placeholder="可空" onChange={(v) => updateReagent(r._key, { equiv: v ?? null })} />
      ),
    },
    {
      title: '投料量 kg', width: 60,
      render: (_, r) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.001} value={r.amountKg ?? undefined}
          placeholder="可空" onChange={(v) => updateReagent(r._key, { amountKg: v ?? null })} />
      ),
    },
    {
      title: '单价 元/kg', width: 60,
      render: (_, r) => {
        if (r.inherited) {
          const up = rr(step.reagents.indexOf(r))?.unitPrice
          return <span style={{ color: '#fa8c16' }}>{up ? fmtNum(up) : '（继承）'}</span>
        }
        const opts = r.priceOptions || []
        if (opts.length > 1) {
          return (
            <Select size="small" style={{ width: '100%' }} value={r.priceSourceId || 0}
              options={opts.map(o => ({ value: o.priceId, label: `${o.date} ${o.price}${o.unit} ${o.spec} ${o.supplier}` }))}
              onChange={(v) => updateReagent(r._key, { priceSourceId: v || 0 })}
            />
          )
        }
        const up = rr(step.reagents.indexOf(r))?.unitPrice
        return <span style={{ fontSize: 12 }}>{up ? fmtNum(up) : <span style={{ color: '#bbb' }}>自动</span>}</span>
      },
    },
    {
      title: '成本(元)', width: 90, align: 'right',
      render: (_, r) => {
        const c = rr(step.reagents.indexOf(r))?.cost
        const warn = rr(step.reagents.indexOf(r))?.warnings?.length
        if (!c) return <span>-</span>
        const stepPct = result && result.totalCost > 0 ? (c / result.totalCost * 100) : 0
        // 占总成本比例：本步占比 × 链式乘数（承载前续步骤成本）
        const totalPct = stepPct * totalShareMultiplier
        const isLastChain = result && result.totalCost > 0 && Math.abs(totalShareMultiplier - 1) < 1e-9
        return (
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: warn ? '#faad14' : undefined }}>{fmtNum(c, 2)}</div>
            {result && result.totalCost > 0 && (
              isLastChain ? (
                <Tooltip title="占本步成本比例">
                  <div style={{ fontSize: 11, color: '#999' }}>{fmtNum(stepPct, 1)}%</div>
                </Tooltip>
              ) : (
                <Tooltip title="本步占比 / 占总成本占比">
                  <div style={{ fontSize: 11, color: '#999' }}>
                    <span style={{ color: '#999' }}>{fmtNum(stepPct, 1)}%</span>
                    <span style={{ color: '#bbb' }}> / </span>
                    <span style={{ color: '#1677ff' }}>{fmtNum(totalPct, 1)}%</span>
                  </div>
                </Tooltip>
              )
            )}
          </div>
        )
      },
    },
    {
      title: '', width: 40,
      render: (_, r) => (
        <Button size="small" type="text" danger icon={<DeleteOutlined />}
          disabled={step.reagents.length <= 1}
          onClick={() => onChange({ ...step, reagents: step.reagents.filter(x => x._key !== r._key) })} />
      ),
    },
  ]

  const productColumns: ColumnsType<ProductRow> = [
    {
      title: '产物', width: 40, align: 'center',
      render: (_, p) => (
        <Tooltip title={p.isSubstrate ? '主产物（供下一步继承）' : '标记为主产物'}>
          <Radio checked={p.isSubstrate} onClick={() => markPrimary(p._key)} />
        </Tooltip>
      ),
    },
    {
      title: '产物名称', width: 100,
      render: (_, p) => (
        <Input size="small" value={p.name} placeholder="手动输入产物名称"
          onChange={(e) => updateProduct(p._key, { name: e.target.value })} />
      ),
    },
    {
      title: '选物料', width: 100,
      render: (_, p) => (
        <Select size="small" showSearch allowClear style={{ width: '100%' }} placeholder="从物料库选"
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
      title: '分子量', width: 60,
      render: (_, p) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} value={p.molWeight || undefined}
          placeholder="必填" onChange={(v) => updateProduct(p._key, { molWeight: v ?? 0 })} />
      ),
    },
    {
      title: '计量数', width: 60,
      render: (_, p) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.1} value={p.molarRatio || undefined}
          onChange={(v) => updateProduct(p._key, { molarRatio: v ?? 1 })} />
      ),
    },
    {
      title: '重量收率%', width: 60,
      render: (_, p) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} max={200} value={p.weightYield ?? undefined}
          placeholder="可空" onChange={(v) => updateProduct(p._key, { weightYield: v ?? null })} />
      ),
    },
    {
      title: '摩尔收率%', width: 60,
      render: (_, p) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} max={200} value={p.molarYield ?? undefined}
          placeholder="可空" onChange={(v) => updateProduct(p._key, { molarYield: v ?? null })} />
      ),
    },
    {
      title: '实际产量 kg', width: 60,
      render: (_, p) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.001} value={p.actualYield ?? undefined}
          placeholder="可空" onChange={(v) => updateProduct(p._key, { actualYield: v ?? null })} />
      ),
    },
    {
      title: '理论产量', width: 60, align: 'right',
      render: (_, p) => { const x = pr(step.products.indexOf(p))?.theoreticalYieldKg; return <span>{x ? fmtNum(x) : '-'}</span> },
    },
    {
      title: '推算产量', width: 60, align: 'right',
      render: (_, p) => { const x = pr(step.products.indexOf(p))?.actualYieldKg; return <span>{x ? fmtNum(x) : '-'}</span> },
    },
    {
      title: '单位成本(元/kg)', width: 60, align: 'right',
      render: (_, p) => { const x = pr(step.products.indexOf(p))?.unitCost; return <span>{x ? fmtNum(x, 2) : '-'}</span> },
    },
    {
      title: '', width: 40,
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

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      styles={{ body: { paddingTop: 8 } }}
      title={
        <Space>
          <span style={{ fontWeight: 600 }}>步骤 {index + 1}</span>
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
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
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
            <b style={{ color: '#1677ff' }}>{result ? fmtNum(result.totalCost, 2) : '-'} 元</b>
          </span>
          {result && <span style={{ fontSize: 12, color: '#999' }}>底物摩尔数 {fmtNum(result.substrateMoles)} mol</span>}
        </Space>
      </div>

      <Table size="small" rowKey="_key" dataSource={step.reagents} columns={reagentColumns}
        pagination={false} scroll={{ x: 1150 }}
        locale={{ emptyText: '暂无原料' }} />

      {/* <div style={{ margin: '12px 0 8px' }}>
        <Space>
          <span style={{ color: '#666', fontSize: 13 }}>产物</span>
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addProduct}>添加产物</Button>
        </Space>
      </div> */}

      <Table size="small" rowKey="_key" dataSource={step.products} columns={productColumns}
        pagination={false} scroll={{ x: 1250 }}
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
