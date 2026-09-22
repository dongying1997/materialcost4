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
