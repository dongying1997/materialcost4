# 自建 DecimalInput：底层高精度、展示按修约规则、聚焦可编辑原值

## 范围（已确定）

- **只改前端**，不引 `shopspring/decimal`、不动 Go、不重新生成 bindings。
- **只覆盖反应计算页（StepCard）** 的 9 处数值输入 + `PriceCell` 的单价。
- 物料库表单（`MaterialForm` / `PriceDrawer`）本次不动。

底层"高精度"= 全精度 `float64`（15–16 位有效数字，十进制最短往返）。源数据（分子量、投料量、百分比、单价）远达不到这个量级，够用。代价是仍走 double，但**不再被显式截断到 2 位**。

## 一、现状：精度丢失的四个环节

| 环节 | 位置 | 问题 |
|---|---|---|
| 输入控件 | `StepCard.tsx` 的 `precision={2}` | 输入即被截到 2 位 |
| **回填逻辑** | `utils/reaction.ts:116` `round2()` | **把存储值本身改写成 2 位小数** |
| 结果展示 | `utils/file.ts` `fmtNum` / `fmtMoney` | `toFixed` 固定位数 |
| 后端 | `engine.go` `float64` | 无损失，本次不改 |

第 2 条是真正破坏数据的：`backfillFromResult` 把引擎推算的投料量 `round2` 后写回 `StepRow`，之后看到、保存、导出的都是被截断的值。第 1、3 条是输入/展示限制。

## 二、修约规则（自定义，需精确定义）

```
规则 R(v):
  若 |v| ≥ 1  → 保留 2 位小数
  若 |v| < 1  → 小数部分去掉前导零后，保留 3 位有效数字
```

**边界定死**：`|v| ≥ 1` 归到"2 位小数"一支，所以 `1` 展示为 `1.00`（3 位有效数字的读法也是 1.00，两种读法在这个点上恰好一致，但规则本身必须唯一，选前者）。

| 输入 | 展示 | 说明 |
|---|---|---|
| `1234.56789` | `1234.57` | |
| `1.2345` | `1.23` | |
| `1` | `1.00` | 边界 |
| `0.23456` | `0.235` | 3 位有效数字 |
| `0.023456` | `0.0235` | |
| `0.0023456` | `0.00235` | |
| `0.0000002345` | `0.000000235` | 见下方「副作用」 |
| `0` | `0` | 特殊：不补零 |

半进位方式随此规则一并确定，写死为**绝对值进位（half-up）**：`0.1235 → 0.124`、`1.005 → 1.01`。前端用定点字符串运算实现，避开 `Math.round(1.005 * 100) / 100 === 1` 的经典坑。

### 副作用（必须在实现时处理）

1. **`|v| < 1` 且极小**（如 `0.0000012345`）会展示出 7 位以上小数，固定列宽 `COL_NUM = 96` 会截断/撑破栅格。对策：这类值在本场景里只可能来自误输入，实现时按"超过 N 位小数（建议 N=6）时降级为 `fmtNum` 千分位科学化或截断加 `Tooltip`"处理，不静默丢位。
2. **`fmtMoney`（千分位）不再统一适用于数值列**：`|v| ≥ 1` 时 `1234.57` 带千分位更好读，但 `COL_NUM = 96` 只按 `999.99` 设计。对策：数值列用**不带千分位**的 `formatRule`，带千分位的 `fmtMoney` 只留给只读的结果列（单价/单位成本/理论产量，列宽 122–128 是按带千分位设计的）。
3. `Rule(0)` 输出 `0` 而非 `0.00`——与现有 `fmtNum` 的 `if (v === 0) return '0'` 一致，保持视觉不变。

## 三、数值表示

### 存储：`StepRow` 内的字段改存字符串

**为什么必须改存储而不只是改展示**：`DecimalInput` 拿到 `value: number` 时，数字已经是一次 double 了，字符串化没有意义；要真正"底层存高精度"，state 里就得是字符串，只在**传后端前**转回 `number`。

字符串形式限定为十进制字面量（**不接受科学计数法**，`1e-7` 一律按无效输入处理）：

```ts
export type Dec = string   // -?\d+(\.\d+)?
```

新增 `frontend/src/utils/decimal.ts`（无依赖的字符串定点运算）：

```ts
parseDecimal(s: string): { sign: 1 | -1; int: string; frac: string } | null
roundDecimal(v: Dec, digitsAfterPoint: number | 'sig3ift1', rule: 'half-up'): Dec
formatRule(v: Dec | number): string        // 上表的规则 R，返回展示串
isDecimal(s: string): boolean
compareDecimal(a: Dec, b: Dec): number
toNumber(v: Dec): number                   // 仅用于跨过 bindings 边界
```

**有效数字定位**：`|v| < 1` 时，`frac` 去掉前导零后的位数 `k`，则保留小数位 = `k + 2`（例：`0.023456` → `frac="023456"` → 前导零 1 个 → 有效数字起点在第 2 位 → 保留 2+2=4 位 → `0.0235`）。`|v| ≥ 1` 恒为 2 位。

### 边界转换

`StepRow` 的数值字段类型从 `number` 改为 `Dec` 后，转换只发生在两个地方：

- `utils/reaction.ts` 的 `stepsToPayload()` —— `Dec → number`（`toNumber`），这是唯一出口
- `utils/reaction.ts` 的 `stepsFromScheme()` —— 后端来的 `number → Dec`

`types.ts` 里 `ReagentRow` / `ProductRow` / `StepRow` 的字段类型相应改为 `Dec` / `Dec | null`。**`bindings/**` 不动**，Go 侧完全无感。

## 四、组件

`frontend/src/components/DecimalInput.tsx`：

```ts
interface DecimalInputProps {
  value: Dec | null
  onChange: (v: Dec | null) => void
  /** 空值语义：true 时空串 → null（投料量/当量/收率可空） */
  allowEmpty?: boolean
  placeholder?: string
  disabled?: boolean
  size?: 'small' | 'middle'
  suffix?: React.ReactNode
  style?: React.CSSProperties
  onBlur?: () => void
}
```

**套壳而非从零画**：内部用 antd 的 `InputNumber` 传 `stringMode`（已确认 antd 只在类型上 omit 了它，运行时直通到 rc）→ 样式、`styles.input/textAlign` 居中 hack、`suffix`、`size` 全部沿用，列宽不受影响。

```tsx
const DecimalInput = ({ value, onChange, allowEmpty, ...rest }) => (
  <InputNumber<string>
    stringMode
    value={value ?? undefined}
    // 焦点期间原样回显 → 可编辑完整精度；失焦后 formatter 重跑 → 回到修约展示
    formatter={(v, { userTyping, input }) => userTyping ? input : formatRule(v)}
    parser={(s) => (isDecimal(s ?? '') ? s! : '')}
    onChange={(v) => onChange(v === '' || v == null ? (allowEmpty ? null : '0') : v)}
    {...rest}
  />
)
```

关键语义：

- **`onFocus` 快照 + `onBlur` 未变更则不 `onChange`**：聚焦看一眼原值再离开，不产生任何数据写入（否则展示值会被当成新值写回，等于又做了一次隐式修约）。
- `min` / `max` 只在 `onBlur` 用 `compareDecimal` 校验，越界给 `status="error"`，**不硬改写**用户输入。

## 五、改动清单

**新增**
- `frontend/src/utils/decimal.ts` —— 字符串十进制运算 + 规则 R
- `frontend/src/components/DecimalInput.tsx`

**修改**
- `frontend/src/components/StepCard.tsx` —— 替换 9 处数值 `InputNumber`（含量、回收率、当量、投料量、分子量、计量数、重量收率、摩尔收率、实际产量）+ `PriceCell` 单价；去掉 `precision={2}`、`step={0.01}`
- `frontend/src/utils/reaction.ts` —— 删除 `round2` 对存储值的改写，回填改为写引擎给的原始值（不修约）；`stepsToPayload` / `stepsFromScheme` 加边界转换
- `frontend/src/utils/file.ts` —— `fmtNum` / `fmtMoney` 内部改走 `formatRule`（保留调用签名，只读结果列行为微调）
- `frontend/src/types.ts` —— `StepRow` / `ReagentRow` / `ProductRow` 数值字段 → `Dec`

**顺带**
- `readOnlyCellStyle` 的硬编码 `height: 24` 与 `size="middle"` 不一致，改为跟随 size。
- 只读结果列（单价/单位成本/理论产量）当前用 `fmtMoney`，本次保持千分位不变，只调整其修约位数。

**不做**
- Go engine 内部十进制化、精确字符串输出字段（本次选"只改前端"）
- 物料库表单（`MaterialForm` / `PriceDrawer`）
- Excel 导出路径

## 六、验证清单

1. **最高风险项**：实测 rc `InputNumber` 的 `formatter` 在 `blur`（失焦重算）与 `value` prop 变化时是否重跑 —— 搭最小页面确认，这决定组件能否成立。若 `stringMode` + `formatter` 组合有坑，退回：内部自管 `displayText` state + 受控 `onInput`，不用 `formatter`。
2. 规则 R 全部用例逐条对照（含 `1`、`0`、`0.023456`、`0.0000002345`、`1234.56789`、负数）。
3. `1.005` → `1.01`（验证没有走 `Math.round` 的 double 路径）。
4. `backfillFromResult` 后存储值是全精度；连续两次回填幂等（不抖动）。
5. `cd frontend && npm run build`（tsc 严格模式必须过）。
6. 端到端：编辑 → 保存方案 → 导出 JSON → 重开 → 导入，数值逐位一致（export/import 是本次精度是否真的保住的判据）。
7. 真实 UI 走查：StepCard 栅格对齐不因新组件变化；修约后的最长串（`1234.57`、`0.0235`）在 `COL_NUM = 96` 下不被截断。`.claude/settings.local.json` 已放行 `http://localhost:9245`，dev server 起来后可直接开前端页面截图核对。
