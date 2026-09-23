// 步骤卡外壳：标题栏、悬停操作、两张表与警告条。
// 表格本身拆在 ./step-card 下（ReagentTable / ProductTable），这里只负责编排与卡片级状态。
import { useState } from 'react'
import { Card, Input, Button, Space, Tag } from 'antd'
import { PlusOutlined, DeleteOutlined, UpOutlined, DownOutlined, LinkOutlined } from '@ant-design/icons'
import type {
  MaterialWithPrice, StepResult, ReagentRow, StepRow, IntermediateProduct, PriceSnapshot,
} from '@/types'
import { normalize, toNumber } from '@/shared/utils/decimal'
import { fmtMoney } from '@/shared/utils/format'
import { COL_NAME } from './step-card/constants'
import ReagentTable from './step-card/ReagentTable'
import ProductTable from './step-card/ProductTable'
import { useStepRows } from './step-card/useStepRows'

interface Props {
  index: number;
  step: StepRow;
  materials: MaterialWithPrice[];
  result?: StepResult | null;
  /** 本步成本在总成本中的链式乘数（供原料占比展示，无 result 时为 1） */
  totalShareMultiplier?: number;
  prevProduct?: IntermediateProduct | null;
  canInherit: boolean;
  onChange: (step: StepRow) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onPriceOptions?: (materialId: number) => void;
}

/** 步骤卡：一步反应的全部编辑控件 */
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

  const rowOps = useStepRows({ step, onChange, prevProduct })
  const { addReagent, addInherited } = rowOps

  /** 价格快照归一化：金额字段去掉尾零，避免 number 的 100.0 与 DecStr 的 "100" 反复互转 */
  const canonicalPrice = (p: PriceSnapshot | null): PriceSnapshot | null => {
    if (!p) return null
    return {
      ...p,
      unitPriceYuanPerKg: toNumber(normalize(p.unitPriceYuanPerKg) ?? '0'),
      price: toNumber(normalize(p.price) ?? '0'),
    }
  }

  /** 选中物料后把物料库中的字段灌进该行；用户已填的单价保留不动 */
  const pickMaterial = (row: ReagentRow, materialId: number) => {
    const m = materials.find(x => x.id === materialId)
    if (!m) return
    rowOps.updateReagent(row._key, {
      materialId, inherited: false, name: m.name, cas: m.cas, formula: m.formula,
      molWeight: normalize(m.molWeight) ?? '0', content: m.content ? normalize(m.content)! : row.content,
      recoveryRate: row.recoveryRate || normalize(m.recoveryRate) || '0',
      // 单价：保留已填的值，换/关联物料不应把用户手填的价格抹掉。
      // 想改用库中价，点单价右侧的历史价图标选择即可（差异会在单元格里提示）。
      // 价格快照仍是后端的 number 字段（价格不在本次高精度改造范围内），
      // 这里归一化一遍，保证输入框的「未改动即不回写」判断不会被 100.0 之类的尾零干扰。
      // 含量/回收率的空值语义与改造前一致：content 为空才用库值，
      // recoveryRate 沿用「0 也视为未填」的旧行为（虽然是 DecStr，"0" 同样是 falsy 之外的非空串，
      // 这里显式用 normalize 兜底，避免把 "0" 误当成需要覆盖）。
      price: canonicalPrice(row.price),
      priceOptions: [], latestPrice: null,
    })
    // 选完物料后拉取该物料的历史价格，供下拉选择与价格变动提示
    onPriceOptions?.(materialId)
  }

  // 主产物 = 被标记为底物的那个产物（每步最多一个），引擎也用它作为「本步成本」的除数，
  // 是下一步继承的来源。不能假定它在 products[0]：产品的行序是用户可改的。
  const primaryIdx = step.products.findIndex(p => p.isSubstrate)
  const primaryResult = primaryIdx >= 0 ? result?.products?.[primaryIdx] : undefined

  const inheritedExists = step.reagents.some(r => r.inherited)
  const hasBlocking = !!result && (result.blockingErrors || []).length > 0
  const warnings = result?.warnings || []

  return (
    <Card
      size='small'
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
              size='small'
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
                visibility: !step.name && !nameActive ? 'hidden' : 'visible',
                // 非激活时把边框/底色透明化，看起来就是一段纯文本。
                // 这里刻意固定用 outlined、只改颜色：若在 borderless↔outlined 之间切换，
                // antd 会过渡 border-width 0→1px，而此刻边框色仍是 currentColor（黑），
                // 于是悬停瞬间闪出一道黑边。
                ...(nameActive ? {} : { borderColor: 'transparent', background: 'transparent' }),
              }}
              variant='outlined'
              value={step.name}
              // 16px 下「步骤名称（可选）」需 128px、而输入框内容宽仅 121px 会被截断；
              // 左侧已有「步骤 n」标签，「步骤」二字冗余，缩短后 96px，留有余量
              placeholder='名称（可选）'
              onFocus={() => setNameFocus(true)}
              onBlur={() => setNameFocus(false)}
              onChange={(e) => onChange({ ...step, name: e.target.value })}
            />
          </span>
          <Space size={6} style={hoverActions}>
            <Button size='small' type='dashed' icon={<PlusOutlined />} onClick={addReagent}>
              添加原料
            </Button>
            {canInherit && !inheritedExists && (
              <Button size='small' type='dashed' icon={<LinkOutlined />} onClick={addInherited}>
                继承产物
              </Button>
            )}
          </Space>
        </div>
      }
      extra={
        <Space>
          <span style={{ fontSize: 14, color: '#999' }}>
            {/* 主产物单位成本 = 本步总成本 ÷ 主产物产量，与产物表「单位成本」列同一口径 */}
            主产物单位成本：
            <b style={{ color: '#1677ff', marginLeft: 4 }}>
              {primaryResult ? fmtMoney(primaryResult.unitCost) : '-'} 元/kg
            </b>
          </span>
          <span style={{ fontSize: 14, color: '#999' }}>
            本步成本：
            {/* 总成本只精确到元（个位），金额取整显示，避免标题栏被小数撑长 */}
            <b style={{ color: '#1677ff', marginLeft: 4 }}>
              {result ? Math.round(result.totalCost).toLocaleString('zh-CN') : '-'} 元
            </b>
          </span>
          <Space size={8} style={hoverActions}>
            <Button size='small' icon={<UpOutlined />} disabled={!onMoveUp} onClick={onMoveUp} />
            <Button size='small' icon={<DownOutlined />} disabled={!onMoveDown} onClick={onMoveDown} />
            <Button size='small' danger icon={<DeleteOutlined />} onClick={onRemove}>
              删除步骤
            </Button>
          </Space>
        </Space>
      }
    >
      {/* 被标记为底物、继承上一步产物的行不再使用深色背景（原有实现即注释掉的状态，保留备查）
      onRow={(r) => {
        const highlight = r.inherited || (index === 0 && r.isSubstrate)
        return highlight ? { style: { background: HIGHLIGHT_ROW_BG } } : {}
      }} */}
      <ReagentTable
        step={step}
        materials={materials}
        result={result}
        totalShareMultiplier={totalShareMultiplier}
        rows={rowOps}
        hoverActions={hoverActions}
        onPickMaterial={pickMaterial}
        onPriceOptions={onPriceOptions}
      />

      <ProductTable
        step={step}
        materials={materials}
        result={result}
        rows={rowOps}
        hoverActions={hoverActions}
      />

      {hasBlocking && (
        <div style={{ marginTop: 8 }}>
          <Tag color='red'>阻塞</Tag>
          {(result?.blockingErrors || []).map((e, i) => (
            <span key={i} style={{ color: '#cf1322', fontSize: 12, marginRight: 12 }}>
              {e}
            </span>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <Tag color='gold'>警告</Tag>
          {warnings.map((e, i) => (
            <span key={i} style={{ color: '#d48806', fontSize: 12, marginRight: 12 }}>
              {e}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export default StepCard
