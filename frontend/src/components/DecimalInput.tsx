/**
 * 高精度数值输入框。
 *
 * 三态行为（这是本组件的全部意义）：
 *   1. **底层存高精度原值** —— value 是 DecStr（十进制字面量字符串），用户敲多少位就是多少位；
 *   2. **失焦态按修约规则展示** —— formatRule(value)，规则 R 见 utils/decimal.ts；
 *   3. **聚焦态原样回显原值** —— 可直接继续编辑完整精度，而不是编辑一个已修约过的数。
 *
 * 为什么用 antd 的 Input 而不是 InputNumber：
 *   InputNumber 自己掌控输入框内容（value 由它内部同步，只把初始值交给调用方），
 *   聚焦期想把「显示值」换成「高精度原值」时会和它的受控同步反复争夺输入框，
 *   实测出现「重新聚焦仍显示修约值」且难以稳定修好（它内部有 value 变化才重同步、
 *   失焦重排、formatter 时序等多条路径）。
 *   Input 的内容完全由调用方的 value 决定，聚焦时 value 从 "1.23" 换成 "1.23456789"
 *   React 必然更新 DOM，没有中间层可以覆盖——行为完全可控。
 *   本组件本就只有十进制数值，且自己做了 min/max 校验与标红，
 *   InputNumber 的数值能力（步进、范围夹取、格式化）一样都没用上。
 */
import { useCallback, useRef, useState } from 'react'
import { Input, Tooltip } from 'antd'
import type { DecStr } from '../utils/decimal'
import {
  MAX_SIG_DIGITS, compareDecimal, formatRule, isClampedForDisplay,
  isDecimal, normalize,
} from '../utils/decimal'

interface Props {
  value: DecStr | null
  onChange: (v: DecStr | null) => void
  /** 空值语义：true 时清空 → null（投料量 / 当量 / 收率可空） */
  allowEmpty?: boolean
  /** 最小值 / 最大值（仅在失焦时校验，越界标红，不硬改写用户输入） */
  min?: number
  max?: number
  placeholder?: string
  disabled?: boolean
  size?: 'small' | 'middle'
  style?: React.CSSProperties
  /** 输入框语义样式（数值列居中沿用 StepCard 的 centerText） */
  styles?: { input?: React.CSSProperties; root?: React.CSSProperties; suffix?: React.CSSProperties }
  suffix?: React.ReactNode
  onBlur?: () => void
}

/** 失焦时把编辑结果归一化：空 / 非法 → null，否则十进制原值（去尾零，"1.50" → "1.5"） */
function commitText(text: string): DecStr | null {
  if (text === '' || !isValid(text)) return null
  return normalize(text)
}

/** 校验十进制串：语法合法，且位数在 double 能表达的量级内（超过视为误输入，拒绝而非静默截断） */
function isValid(v: DecStr | null | undefined): boolean {
  if (!isDecimal(v)) return false
  const dot = v.indexOf('.')
  return dot < 0 || v.length - dot - 1 <= MAX_SIG_DIGITS
}

/** 是否在 [min, max] 内（未设边界的一侧不算越界） */
function inRange(s: DecStr, min?: number, max?: number): boolean {
  if (min !== undefined && compareDecimal(s, min) < 0) return false
  if (max !== undefined && compareDecimal(s, max) > 0) return false
  return true
}

function DecimalInput({
  value, onChange, allowEmpty, min, max, placeholder, disabled,
  size = 'small', style, styles, suffix, onBlur,
}: Props) {
  const [focused, setFocused] = useState(false)
  // 聚焦期间的输入缓冲。聚焦时用当前原值初始化，之后完全跟随用户输入；
  // 失焦后失效，显示改回 formatRule(value)。
  const [text, setText] = useState<DecStr>('')
  // 本轮编辑开始时的原值，失焦时据此判断「数值变没变」
  const sessionStart = useRef<DecStr>('')

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const start = normalize(value) ?? ''
    sessionStart.current = start
    setText(start)
    setFocused(true)
    // 聚焦不做全选：用户多为「补看/微调」，全选会误删。
    // 但要在浏览器把光标放到点击处之后收尾，且用户已自行选中时不去动它。
    const el = e.target
    requestAnimationFrame(() => {
      if (!el || el.selectionStart !== el.selectionEnd) return
      const end = el.value.length
      try { el.setSelectionRange(end, end) } catch { /* 某些浏览器对未聚焦元素会抛，忽略 */ }
    })
  }, [value])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value)
  }, [])

  const handleBlur = useCallback(() => {
    setFocused(false)
    // 只有**数值真的变了**才回写。
    // 刻意不把「文本变了但数值没变」也算成变更（如 "1.23" 被敲成 "1.2300"）：
    // 那种情况只需显示归位，而回写要付实际代价——上层 setSteps 产出新数组，
    // 触发整条链重算 + 草稿落盘 + 回填。为一串尾零不值得。
    // 回写用归一化值而非 formatRule：后者会把展示规则烧进存储值，
    // 用户输入的高精度就被永久修约掉了。
    if (compareDecimal(commitText(text), sessionStart.current) !== 0) {
      onChange(commitText(text) ?? (allowEmpty ? null : '0'))
    }
    onBlur?.()
  }, [text, allowEmpty, onChange, onBlur])

  // 聚焦期（原样文本）与失焦期（修约展示）各自判断是否越界 / 非法
  const bad = focused
    ? (text !== '' && (!isValid(text) || !inRange(text, min, max)))
    : !isValid(value)

  const node = (
    <Input
      size={size}
      style={style}
      styles={styles}
      value={focused ? text : formatRule(value)}
      placeholder={placeholder}
      disabled={disabled}
      status={bad ? 'error' : undefined}
      suffix={suffix}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  )

  // 降级展示（修约后小数位 > 6）时，Tooltip 里给出完整的高精度原值，
  // 否则被截断的 "0.000000" 会被误读成 0。
  return isClampedForDisplay(value)
    ? <Tooltip title={`完整值 ${normalize(value) ?? ''}`}>{node}</Tooltip>
    : node
}

export default DecimalInput
