// 单价单元格：手动输入 + 从物料库历史价下拉选择。
import { Space, Tooltip, Dropdown } from 'antd';
import { HistoryOutlined, WarningOutlined } from '@ant-design/icons';
import { fmtMoney } from '@/shared/utils/format';
import { priceDrifted, priceFromOption, emptyPrice } from '@/lib/reaction';
import { normalize, toNumber } from '@/shared/utils/decimal';
import type { ReagentRow, PriceSnapshot, MaterialPriceOption } from '@/types';
import DecimalInput from '@/shared/components/DecimalInput';
import { centerText } from './constants';

// 需要把换算值补进文案的单位（见 priceOptionLabel）
const CONVERT_UNITS = new Set(['元/g', '元/mol']);

/**
 * 历史价下拉项的文案：日期 + 报价 [+ → 换算值 元/kg] [+ 供应商]。
 *
 * 元/g、元/mol 必须补上换算值：换算后的 元/kg 是反推不回去的（元/mol 要除以
 * 分子量），也是这些不同单位的报价之间唯一能横向比较成本的数字。
 */
function priceOptionLabel(o: MaterialPriceOption): string {
  const raw = `${fmtMoney(o.price)}${o.unit || ''}`;
  const price = CONVERT_UNITS.has((o.unit || '').trim()) ? `${raw} → ${fmtMoney(o.pricePerKg)} 元/kg` : raw;
  return `${o.date} ${price}${o.supplier ? ' · ' + o.supplier : ''}`;
}

export default function PriceCell({ row, onChange }: { row: ReagentRow; onChange: (p: PriceSnapshot | null) => void }) {
  const opts = row.priceOptions || [];
  const drifted = priceDrifted(row.price, row.latestPrice);
  const latest = row.latestPrice;
  const current = row.price?.unitPriceYuanPerKg ?? 0;
  // 单价快照里的金额（元/kg）是 number，编辑器按 DecStr 处理
  const priceText = row.price ? normalize(row.price.unitPriceYuanPerKg) : null;

  const driftMsg = drifted && latest ? `与库中最新价${fmtMoney(latest.pricePerKg)}元/kg存在差异` : '';

  // 价格来源说明：有供应商/日期就显示，便于确认这个数字是从哪来的
  const sourceMsg =
    row.price?.date || row.price?.supplier
      ? `当前单价来自：${row.price?.date || '-'}${row.price?.supplier ? ' · ' + row.price.supplier : ''}${row.price?.spec ? ' · ' + row.price.spec : ''}`
      : '手动输入单价';

  const historyMenu = {
    items: [
      // 与库中最新价不一致时，先把最新价作为不可选中的提示项列在最前
      ...(drifted && latest
        ? [
            {
              key: 'hint',
              disabled: true,
              label: `库中最新价 ${fmtMoney(latest.pricePerKg)}（当前 ${fmtMoney(current)}）`,
            },
          ]
        : []),
      ...opts.map((o) => ({ key: String(o.priceId), label: priceOptionLabel(o) })),
    ],
    onClick: ({ key }: { key: string }) => {
      const o = opts.find((x) => String(x.priceId) === key);
      if (o) onChange(priceFromOption(o));
    },
  };

  return (
    <Tooltip title={drifted ? '' : sourceMsg}>
      <DecimalInput
        size='small'
        style={{ width: '100%' }}
        styles={centerText}
        min={0}
        value={priceText}
        placeholder='填单价'
        onChange={(v) => {
          if (v === null) {
            onChange(null);
            return;
          }
          const n = toNumber(v);
          // 手动输入的单价是自定义报价，不再是物料库里的那条报价记录——
          // 必须丢掉 supplier/date/spec，否则界面会把库里的登记时间当成
          // 这条手填价格的来源显示出来（曾因此误报过）。
          onChange({ ...emptyPrice(), unitPriceYuanPerKg: n, price: n, unit: '元/kg' });
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
            <Tooltip title={opts.length ? '从物料库的历史价格中选择' : ''}>
              <Dropdown
                trigger={['click']}
                disabled={opts.length === 0}
                menu={historyMenu}
                placement='bottomRight'
              >
                <HistoryOutlined
                  style={{
                    fontSize: 13,
                    color: opts.length ? '#1677ff' : '#d9d9d9',
                    cursor: opts.length ? 'pointer' : 'not-allowed',
                  }}
                />
              </Dropdown>
            </Tooltip>
          </Space>
        }
      />
    </Tooltip>
  );
}
