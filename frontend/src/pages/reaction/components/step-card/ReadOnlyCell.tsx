import { Tooltip } from 'antd';

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
  // 高度对齐 size="small" 的输入框（24px）。若将来把表格换成 middle，
  // 这里要同步改成 32——写死是刻意的，避免边框与相邻输入框不齐。
  height: 24,
  boxSizing: 'border-box',
  padding: '0 7px',
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  background: '#fff',
};

/** 只读数值单元格：套上 readOnlyCellStyle 的外框 */
export default function ReadOnlyCell({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <div
      style={{
        ...readOnlyCellStyle,
        justifyContent: align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center',
      }}
    >
      {children}
    </div>
  );
}

/**
 * 只读文本单元格：内容超出列宽时省略号截断，并挂气泡显示完整值。
 *
 * 与 ReadOnlyCell 分开是因为取舍不同——那个放的是数值，宽度可控，装不下说明
 * 列宽配错了；这里放的是 CAS 这类外部录入的字符串，长度不受控（导入的 Excel
 * 里可能出现任意写法），只能截断兜底。
 *
 * 截断交给 CSS（text-overflow: ellipsis），不做 JS 量宽：列宽固定，量宽要等
 * 布局完成、还要在窗口缩放时重算，代价远大于收益。代价是内容恰好等于列宽时
 * 也会带上气泡，但那本来也无害。
 */
export function ReadOnlyTextCell({
  text,
  align = 'center',
  color,
}: {
  text: string
  align?: 'left' | 'center' | 'right'
  /** 文字颜色。空值等「弱化」的内容传灰，与实填值区分开 */
  color?: string
}) {
  return (
    <ReadOnlyCell align={align}>
      <Tooltip title={text}>
        <span
          style={{
            fontSize: 13,
            color,
            display: 'block',
            width: '100%',
            textAlign: align,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </span>
      </Tooltip>
    </ReadOnlyCell>
  );
}
