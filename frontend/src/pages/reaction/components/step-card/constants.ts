// 步骤卡内两张表格的栅格与样式常量。两表共用同一套列宽——这是刻意的，见下方注释。

// ── 统一列宽：原料表与产物表共用同一套栅格，保证上下对齐 ──────
// 两表均为 11 列：单选 | 名称区(2列) | 数值列(5列) | 结果列(2列) | 删除
// 名称区合计两表一致（名称 + 选择列），因此两表逐列等宽，栅格完全重合。
// 各列宽度按「该列最宽的表头文字 / 单元格内容」实测反推，取整后配置。
// 度量前提：size="small" 表格字号 14px（antd cellFontSizeSM），左右内边距各 8px，
// 故列宽 = 最宽内容 + 16（阈值见下方各列注释）。
export const COL_RADIO = 46; // 底物/产物单选（单选钮 16 / 表头 28 → 需 44）
// 名称区两列等宽、CAS 与选物料两列等宽，两表的名称区合计一致，保证上下两表栅格对齐
export const COL_NAME = 165; // 原料名称 / 产物名称（自由输入，名称区合计中的余量）
export const COL_SEL = 94; // CAS(65.7) / 选物料(表头 42 → 需 58，均不撑列)
export const COL_NUM = 96; // 数值输入列（表头最宽「实际产量 kg」75.9 → 需 92）
export const COL_RST = 128; // 单价(数字+⚠/🕘 两个图标时需 111) / 理论产量(62.9) → 需 127
export const COL_COST = 122; // 单位成本（表头 102.0 是本列最宽项 → 需 118；占比行仅 77.6）
export const COL_DEL = 44; // 删除按钮（24 → 需 40）

// 两表总宽一致；容器更宽时表格按 minWidth:100% 等比拉伸，两表始终对齐
export const TOTAL_WIDTH = COL_RADIO + COL_NAME + COL_SEL + COL_NUM * 5 + COL_RST + COL_COST + COL_DEL;
//                 = 46 + (165+94) + 96*5 + 128 + 122 + 44 = 1079

// 输入控件铺满所在单元格
export const fullInput = { width: '100%' } as const;

/**
 * 数值输入框内文字居中。
 *
 * antd 给 InputNumber 内层 <input> 写死了 `text-align: start`
 * （见 antd/es/input-number/style），它的优先级高于单元格继承下来的
 * text-align——所以只把列声明成 align:'center' 无效，文字依旧贴左。
 * 这里用语义化 styles.input 把样式直接打到 <input> 元素上，才能压过那条规则。
 */
export const centerText = { input: { textAlign: 'center' } } as const;

// 公共 Table 属性：两表字号、行高、总宽完全一致。
// 放在这里而不是各自的表组件里：两表必须用同一份，否则列宽会各算各的。
export const tableProps = {
  size: 'small' as const,
  rowKey: '_key' as const,
  pagination: false as const,
  style: { marginBottom: 0 },
  // 固定表格布局：列宽严格按声明值分配。
  // 默认的 auto 布局会因内容（两表内容不同）撑开列、再按比例放大，
  // 导致上下两表的数值列逐渐错位（实测分子量列相差 37px）。
  tableLayout: 'fixed' as const,
};
