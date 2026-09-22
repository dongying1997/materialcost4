// 产物表：每行一种产物。列宽与原料表共享同一套常量（见 ./constants），两表逐列对齐是刻意约束。
import { Table, Radio, Select, Input, Tooltip, Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { StepRow, ProductRow, MaterialWithPrice, StepResult } from '@/types';
import { fmtMoney } from '@/shared/utils/format';
import { normalize } from '@/shared/utils/decimal';
import DecimalInput from '@/shared/components/DecimalInput';
import ReadOnlyCell from './ReadOnlyCell';
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
  /** 行级操作，来自 useStepRows */
  rows: {
    updateProduct: (key: string, patch: Partial<ProductRow>) => void;
    markPrimary: (key: string) => void;
    removeProduct: (key: string) => void;
  };
  /** 鼠标是否悬停在卡片上：删除按钮随卡片一起显隐 */
  hoverActions: React.CSSProperties;
}

export default function ProductTable({ step, materials, result, rows, hoverActions }: Props) {
  const { updateProduct, markPrimary, removeProduct } = rows;
  const pr = (i: number) => result?.products?.[i] || undefined;

  const columns: ColumnsType<ProductRow> = [
    {
      title: '产物',
      width: COL_RADIO,
      align: 'center',
      render: (_, p) => (
        <Tooltip title={p.isSubstrate ? '主产物（供下一步继承）' : '标记为主产物'}>
          <Radio checked={p.isSubstrate} onClick={() => markPrimary(p._key)} />
        </Tooltip>
      ),
    },
    {
      title: '产物名称',
      width: COL_NAME,
      render: (_, p) => (
        // 右侧留出与原料名称列中 🔗 按钮等宽的空间，
        // 使两列的输入框实际宽度一致（列宽相同，但原料那格被按钮占去 28px）
        <Input
          size='small'
          style={{ width: 'calc(100% - 26px)' }}
          value={p.name}
          placeholder='产物名称'
          onChange={(e) => updateProduct(p._key, { name: e.target.value })}
        />
      ),
    },
    {
      title: '选物料',
      width: COL_SEL,
      align: 'center',
      render: (_, p) => (
        // 气泡套在外层 span 上，不能直接包 <Select>：antd Tooltip 需要一个
        // 能接收 ref 的 DOM 元素，包组件时气泡不出现（实测）。
        <Tooltip title={p.name}>
        <span style={{ display: 'block', width: '100%' }}>
        <Select
          size='small'
          allowClear
          style={fullInput}
          placeholder='从物料库选'
          // 顶层的 optionFilterProp / filterOption 已弃用，改挂 showSearch（对象形式自 6.0.0 起支持）
          showSearch={{
            optionFilterProp: 'label',
            // 显示只有名称；搜索按「名称 + CAS」，因此输入 CAS 也能筛出物料
            filterOption: (input, option) => {
              const m = materials.find((x) => x.id === (option as { value?: number })?.value);
              const hay = `${m?.name ?? ''} ${m?.cas ?? ''}`.toLowerCase();
              return hay.includes(input.trim().toLowerCase());
            },
          }}
          value={p.materialId || undefined}
          // 列宽只有 COL_SEL，按列宽弹出的下拉装不下「名称 + CAS」，两者都会被截断。
          // 解绑列宽后由 materialSelect.css 给定固定宽度。
          popupMatchSelectWidth={false}
          classNames={{ popup: { root: 'material-select-popup' } }}
          // 选中值取 displayName（名称），下拉项用 label（名称 + CAS）。
          // 不靠 labelRender 定制：它是否被采纳随 antd 版本而变。
          optionLabelProp='displayName'
          options={materials.map((m) => ({
            value: m.id,
            displayName: m.name,
            // CAS 紧跟名称（不右对齐，否则短名称的行中间会空出一大段）
            label: m.cas ? (
              <>{m.name}<span style={{ color: '#999', marginLeft: 8 }}>{m.cas}</span></>
            ) : m.name,
          }))}
          onChange={(v) => {
            const m = materials.find((x) => x.id === v);
            if (m)
              updateProduct(p._key, {
                materialId: v,
                name: m.name,
                cas: m.cas,
                formula: m.formula,
                molWeight: normalize(m.molWeight) ?? '0',
              });
            else updateProduct(p._key, { materialId: 0 });
          }}
        />
        </span>
        </Tooltip>
      ),
    },
    {
      title: '分子量',
      width: COL_NUM,
      align: 'center',
      render: (_, p) => (
        <DecimalInput
          size='small'
          style={fullInput}
          styles={centerText}
          min={0}
          value={p.molWeight || null}
          placeholder='必填'
          onChange={(v) => updateProduct(p._key, { molWeight: v ?? '0' })}
        />
      ),
    },
    {
      title: '计量数',
      width: COL_NUM,
      align: 'center',
      render: (_, p) => (
        <DecimalInput
          size='small'
          style={fullInput}
          styles={centerText}
          min={0}
          value={p.molarRatio || null}
          onChange={(v) => updateProduct(p._key, { molarRatio: v ?? '1' })}
        />
      ),
    },
    {
      title: '重量收率%',
      width: COL_NUM,
      align: 'center',
      render: (_, p) => (
        <DecimalInput
          size='small'
          style={fullInput}
          styles={centerText}
          min={0}
          max={200}
          allowEmpty
          value={p.weightYield}
          placeholder='可空'
          onChange={(v) => updateProduct(p._key, { weightYield: v })}
        />
      ),
    },
    {
      title: '摩尔收率%',
      width: COL_NUM,
      align: 'center',
      render: (_, p) => (
        <DecimalInput
          size='small'
          style={fullInput}
          styles={centerText}
          min={0}
          max={200}
          allowEmpty
          value={p.molarYield}
          placeholder='可空'
          onChange={(v) => updateProduct(p._key, { molarYield: v })}
        />
      ),
    },
    {
      title: '实际产量 kg',
      width: COL_NUM,
      align: 'center',
      render: (_, p) => (
        <DecimalInput
          size='small'
          style={fullInput}
          styles={centerText}
          min={0}
          allowEmpty
          value={p.actualYield}
          placeholder='可空'
          onChange={(v) => updateProduct(p._key, { actualYield: v })}
        />
      ),
    },
    {
      title: '理论产量 kg',
      width: COL_RST,
      align: 'center',
      render: (_, p) => {
        const x = pr(step.products.indexOf(p))?.theoreticalYieldKg;
        return (
          <ReadOnlyCell>
            <span style={{ fontSize: 13 }}>{x ? fmtMoney(x) : '-'}</span>
          </ReadOnlyCell>
        );
      },
    },
    {
      title: '单位成本(元/kg)',
      width: COL_COST,
      align: 'right',
      render: (_, p) => {
        const x = pr(step.products.indexOf(p))?.unitCost;
        return <span style={{ fontSize: 13, fontWeight: 500 }}>{x ? fmtMoney(x) : '-'}</span>;
      },
    },
    {
      title: '',
      width: COL_DEL,
      align: 'center',
      // 删除按钮与标题栏的操作按钮同一悬停状态：鼠标离开卡片即隐藏
      render: (_, p) => (
        <span style={hoverActions}>
          <Button
            size='small'
            type='text'
            danger
            icon={<DeleteOutlined />}
            disabled={step.products.length <= 1}
            onClick={() => removeProduct(p._key)}
          />
        </span>
      ),
    },
  ];

  return (
    <Table
      {...tableProps}
      dataSource={step.products}
      columns={columns}
      scroll={{ x: TOTAL_WIDTH }}
      style={{ marginTop: 10, marginBottom: 0 }}
      locale={{ emptyText: '暂无产物' }}
    />
  );
}
