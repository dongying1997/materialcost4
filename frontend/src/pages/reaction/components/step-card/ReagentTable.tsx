// 原料表：每行一种原料。列宽与产物表共享同一套常量（见 ./constants），两表逐列对齐是刻意约束。
import { Table, Radio, Tooltip, Button } from 'antd';
import { DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { StepRow, ReagentRow, MaterialWithPrice, StepResult } from '@/types';
import { fmtNum, fmtMoney } from '@/shared/utils/format';
import { toNumber } from '@/shared/utils/decimal';
import DecimalInput from '@/shared/components/DecimalInput';
import ReagentNameCell from '../ReagentNameCell';
import ReadOnlyCell, { ReadOnlyTextCell } from './ReadOnlyCell';
import PriceCell from './PriceCell';
import {
  COL_RADIO,
  COL_NAME,
  COL_SEL,
  COL_NUM,
  COL_RST,
  COL_COST,
  COL_DEL,
  TOTAL_WIDTH,
  fullInput,
  centerText,
  tableProps,
} from './constants';

interface Props {
  step: StepRow;
  materials: MaterialWithPrice[];
  result?: StepResult | null;
  /** 本步成本在总成本中的链式乘数（供原料占比展示，无 result 时为 1） */
  totalShareMultiplier?: number;
  /** 行级操作，来自 useStepRows */
  rows: {
    updateReagent: (key: string, patch: Partial<ReagentRow>) => void;
    markSubstrate: (key: string) => void;
    removeReagent: (key: string) => void;
  };
  /** 鼠标是否悬停在卡片上：删除按钮随卡片一起显隐 */
  hoverActions: React.CSSProperties;
  onPickMaterial: (row: ReagentRow, materialId: number) => void;
  onPriceOptions?: (materialId: number) => void;
}

export default function ReagentTable({
  step,
  materials,
  result,
  totalShareMultiplier = 1,
  rows,
  hoverActions,
  onPickMaterial,
  onPriceOptions,
}: Props) {
  const { updateReagent, markSubstrate, removeReagent } = rows;
  const rr = (i: number) => result?.reagents?.[i] || undefined;

  const columns: ColumnsType<ReagentRow> = [
    {
      title: '底物',
      width: COL_RADIO,
      align: 'center',
      render: (_, r) => (
        <Tooltip title={r.isSubstrate ? '底物(1eq基准)' : '标记为底物'}>
          <Radio checked={r.isSubstrate} onClick={() => markSubstrate(r._key)} />
        </Tooltip>
      ),
    },
    {
      // 本列不设 align：antd 的 thead 默认就是 text-align:start，
      // 而 rc-table 的 align 会同时作用于 th 与 td，设了反而把表头也改掉。
      title: '原料名称',
      width: COL_NAME,
      render: (_, r) =>
        r.inherited ? (
          // 继承行：常规字色 + 灰底，右侧放一个橙色链接图标（位置与普通行的 🔗 一致，仅颜色与提示不同）
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ReadOnlyCell align='left'>
                <span
                  style={{
                    fontSize: 13,
                    color: '#333',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.name}
                </span>
              </ReadOnlyCell>
            </div>
            <Tooltip title='继承自上一步的产物，分子量与单价随上一步自动带入'>
              <Button
                size='small'
                type='text'
                disabled
                style={{ padding: '0 4px', flex: '0 0 auto' }}
                icon={<LinkOutlined style={{ fontSize: 12, color: '#fa8c16' }} />}
              />
            </Tooltip>
          </div>
        ) : (
          // 其余三种形态（已关联 / 未关联可自动关联 / 未关联需手选）见 ReagentNameCell.tsx
          <ReagentNameCell row={r} materials={materials} onPick={onPickMaterial} onClear={updateReagent} />
        ),
    },
    {
      title: 'CAS',
      width: COL_SEL,
      align: 'center',
      // CAS 长度不受控（库里的值来自导入的 Excel），超出列宽时省略并挂气泡。
      // 未填时仍走同一个单元格（内容「-」占位），只是灰显，与实填值区分开。
      render: (_, r) => <ReadOnlyTextCell text={r.cas || '-'} color={r.cas ? '#333' : '#bbb'} />,
    },
    {
      title: '分子量',
      width: COL_NUM,
      align: 'center',
      render: (_, r) => (
        <ReadOnlyCell>
          <span style={{ fontSize: 13 }}>
            {r.molWeight && toNumber(r.molWeight) !== 0 ? fmtMoney(r.molWeight) : '-'}
          </span>
        </ReadOnlyCell>
      ),
    },
    {
      title: '含量%',
      width: COL_NUM,
      align: 'center',
      render: (_, r) => (
        <DecimalInput
          size='small'
          style={fullInput}
          styles={centerText}
          min={0}
          max={100}
          value={r.content}
          onChange={(v) => updateReagent(r._key, { content: v ?? '100' })}
        />
      ),
    },
    {
      title: '回收率%',
      width: COL_NUM,
      align: 'center',
      render: (_, r) => (
        <DecimalInput
          size='small'
          style={fullInput}
          styles={centerText}
          min={0}
          max={100}
          value={r.recoveryRate}
          onChange={(v) => updateReagent(r._key, { recoveryRate: v ?? '0' })}
        />
      ),
    },
    {
      title: '当量',
      width: COL_NUM,
      align: 'center',
      // 底物固定 1 eq，不可修改
      render: (_, r) =>
        r.isSubstrate ? (
          <Tooltip title='底物为 1 eq 基准，不可修改'>
            <DecimalInput
              size='small'
              style={fullInput}
              styles={centerText}
              value='1'
              disabled
              onChange={() => {}}
            />
          </Tooltip>
        ) : (
          <DecimalInput
            size='small'
            style={fullInput}
            styles={centerText}
            min={0}
            allowEmpty
            value={r.equiv}
            placeholder='可空'
            onChange={(v) => updateReagent(r._key, { equiv: v })}
          />
        ),
    },
    {
      title: '投料量 kg',
      width: COL_NUM,
      align: 'center',
      render: (_, r) => (
        <DecimalInput
          size='small'
          style={fullInput}
          styles={centerText}
          min={0}
          allowEmpty
          value={r.amountKg}
          placeholder='可空'
          onChange={(v) => updateReagent(r._key, { amountKg: v })}
        />
      ),
    },
    {
      title: '单价 元/kg',
      width: COL_RST,
      align: 'center',
      render: (_, r) => {
        const idx = step.reagents.indexOf(r);
        if (r.inherited) {
          const up = rr(idx)?.unitPrice;
          return (
            <ReadOnlyCell>
              <span style={{ color: '#333', fontWeight: 500, fontSize: 13 }}>
                {up ? fmtMoney(up) : '（继承）'}
              </span>
            </ReadOnlyCell>
          );
        }
        return <PriceCell row={r} onChange={(p) => updateReagent(r._key, { price: p })} />;
      },
    },
    {
      title: '单位成本(元/kg)',
      width: COL_COST,
      align: 'right',
      render: (_, r) => {
        const idx = step.reagents.indexOf(r);
        const res = rr(idx);
        const c = res?.cost;
        const warn = res?.warnings?.length;
        if (!c) return <span style={{ color: '#bbb' }}>-</span>;
        // 单位成本 = 本原料成本 ÷ 本步主产物产量（与产物表同一分母，便于横向比较）
        const unit = res?.unitCost;
        const stepPct = result && result.totalCost > 0 ? (c / result.totalCost) * 100 : 0;
        // 占总成本比例：本步占比 × 链式乘数（承载前续步骤成本）
        const totalPct = stepPct * totalShareMultiplier;
        const isLastChain = result && result.totalCost > 0 && Math.abs(totalShareMultiplier - 1) < 1e-9;
        return (
          <div style={{ textAlign: 'right', lineHeight: 1.35 }}>
            <Tooltip title={`成本 ${fmtMoney(c)} 元 ÷ 主产物产量`}>
              <div style={{ color: warn ? '#faad14' : '#333', fontWeight: 500 }}>
                {unit ? fmtMoney(unit) : '-'}
              </div>
            </Tooltip>
            {result &&
              result.totalCost > 0 &&
              (isLastChain ? (
                <Tooltip title='占本步成本比例'>
                  <div style={{ fontSize: 11, color: '#999' }}>{fmtNum(stepPct, 1)}%</div>
                </Tooltip>
              ) : (
                <Tooltip title='本步占比 / 占总成本占比'>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {fmtNum(stepPct, 1)}% <span style={{ color: '#ccc' }}>/</span>{' '}
                    <span style={{ color: '#333' }}>{fmtNum(totalPct, 1)}%</span>
                  </div>
                </Tooltip>
              ))}
          </div>
        );
      },
    },
    {
      title: '',
      width: COL_DEL,
      align: 'center',
      // 删除按钮与标题栏的操作按钮同一悬停状态：鼠标离开卡片即隐藏
      render: (_, r) => (
        <span style={hoverActions}>
          <Button
            size='small'
            type='text'
            danger
            icon={<DeleteOutlined />}
            disabled={step.reagents.length <= 1}
            onClick={() => removeReagent(r._key)}
          />
        </span>
      ),
    },
  ];

  return (
    <Table
      {...tableProps}
      dataSource={step.reagents}
      columns={columns}
      scroll={{ x: TOTAL_WIDTH }}
      // 被标记为底物、继承上一步产物的行不再使用深色背景
      // onRow={(r) => {
      //   const highlight = r.inherited || (index === 0 && r.isSubstrate)
      //   return highlight ? { style: { background: HIGHLIGHT_ROW_BG } } : {}
      // }}
      locale={{ emptyText: '暂无原料' }}
    />
  );
}
