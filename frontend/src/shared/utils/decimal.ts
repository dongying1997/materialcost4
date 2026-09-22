/**
 * 高精度十进制数值（DecStr）：以字符串保存十进制字面量，避免经过 double 时被截断。
 *
 * 形式固定为 `-?\d+(\.\d+)?`——不接受科学计数法（`1e-7` 一律按无效输入处理），
 * 因为科学计数法在前端没有输入途径，且会让「有效数字」的判定产生歧义。
 *
 * 本模块只做展示与修约，不做四则运算；唯一对外转换出口是 toNumber()
 * （见 utils/reaction.ts 的 stepsToPayload），用于跨过 Wails bindings 传给 Go。
 */

/** 十进制字面量字符串，如 "0.0234"、"-12.5" */
export type DecStr = string

const DEC_RE = /^-?\d+(\.\d+)?$/

/** 是否为合法的十进制字面量 */
export function isDecimal(s: string | null | undefined): s is DecStr {
  return typeof s === 'string' && DEC_RE.test(s)
}

/**
 * 展示时小数位数的上限：修约后小数位超过它的值降级展示（截断 + Tooltip 给出完整值），
 * 见 isClampedForDisplay。**不是**输入合法性上限——超限的值依然合法，只是显示不下。
 */
export const MAX_FRAC_DIGITS = 6
/** 输入合法性上限：小数位超过它就视为误输入（double 也表达不了这个量级） */
export const MAX_SIG_DIGITS = 17

interface Parts {
  neg: boolean
  /** 整数部分，无前导零（"0" 表示零） */
  int: string
  /** 小数部分，无尾随零（"" 表示无小数） */
  frac: string
}

/** 拆解十进制字面量；非法输入返回 null */
export function parseDecimal(s: string): Parts | null {
  if (!DEC_RE.test(s)) return null
  const neg = s.startsWith('-')
  const body = neg ? s.slice(1) : s
  const dot = body.indexOf('.')
  const int = (dot < 0 ? body : body.slice(0, dot)).replace(/^0+(?=\d)/, '')
  const frac = (dot < 0 ? '' : body.slice(dot + 1)).replace(/0+$/, '')
  return { neg, int, frac }
}

/** 保留的小数位数：小数点后要跳过多少个前导零，才能数满 3 位有效数字 */
export const SIG_DIGITS = 3

/**
 * 修约规则 R 的「|v| < 1」一支：保留 3 位有效数字，返回「保留几位小数」。
 *
 * 小数部分去前导零后剩下的位数就是有效数字个数，因此
 *   保留小数位 = 前导零个数 + SIG_DIGITS
 * 例：frac="023456"（前导零 1 个）→ 1 + 3 = 4 位 → 0.023456 展示为 0.0235
 *
 * 注意不是「去前导零后 + 2」——那是把「有效数字起点」误当成了「有效数字位数」。
 */
export function digitsOf(frac: string): number {
  const leadZeros = frac.length - frac.replace(/^0+/, '').length
  if (leadZeros === frac.length) return 0
  return leadZeros + SIG_DIGITS
}

/**
 * 按 half-up（绝对值进位）把十进制串修约到指定小数位。
 * 用字符串定点实现，避开 `Math.round(1.005 * 100) / 100 === 1` 这类
 * 「先乘 100 再取整」在浮点下必然踩到的坑。
 */
export function roundDecimal(p: Parts, digits: number): Parts {
  if (p.frac.length <= digits) return p
  const keep = p.frac.slice(0, digits)
  const nextDigit = p.frac.charCodeAt(digits) - 48 // '0' = 48
  if (nextDigit < 5) return { ...p, frac: keep }
  // 进位：对 int + keep 组成的整数字符串做逐位加一
  const scaled = (p.int + keep).split('')
  let carry = 1
  for (let i = scaled.length - 1; i >= 0 && carry; i--) {
    const d = scaled[i].charCodeAt(0) - 48 + carry
    if (d >= 10) {
      scaled[i] = '0'
      carry = 1
    } else {
      scaled[i] = String.fromCharCode(48 + d)
      carry = 0
    }
  }
  const digitsStr = (carry ? '1' : '') + scaled.join('')
  // 进位可能让整数部分多出一位（999.99 → 1000.00），故按 digits 从右切回
  const splitAt = digitsStr.length - digits
  const int = splitAt <= 0 ? '0' : digitsStr.slice(0, splitAt)
  const frac = splitAt <= 0 ? '0'.repeat(-splitAt) + digitsStr : digitsStr.slice(splitAt)
  return { neg: p.neg, int: int.replace(/^0+(?=\d)/, ''), frac: frac.replace(/0+$/, '') }
}

/** 小数部分的位数（合法输入；非法或空返回 0） */
export function fracLen(v: DecStr | number | null | undefined): number {
  const s = normalize(v)
  if (s === null) return 0
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : s.length - dot - 1
}

/**
 * 把 DecStr / number / null 统一成「规范 DecStr」或 null。
 *
 * 规范形式 = 十进制字面量 **去尾零**（"1.50" → "1.5"，"0.00" → "0"），
 * 且必须能做字符串相等比较——DecimalInput 失焦时用「值是否变了」决定要不要
 * 回写，一旦两侧规范形式不同就会产生无意义的回写，所以去尾零是必要条件。
 */
export function normalize(v: DecStr | number | null | undefined): DecStr | null {
  if (v === null || v === undefined) return null
  let s: string
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    // String() 给的是 double 的最短往返表示（1.23456789 → "1.23456789"）。
    // 不能用 toFixed(17)：那会展开成完整二进制近似（"1.23456788999999989"），
    // 既难看，又会被 isValid 当成超长小数判为非法，方案一载入就满屏红框。
    s = expandExponential(String(v))
  } else {
    if (!DEC_RE.test(v)) return null
    s = v
  }
  const p = parseDecimal(s)
  if (!p) return null
  const head = (p.neg && !(p.int === '0' && p.frac === '') ? '-' : '') + p.int
  return p.frac ? `${head}.${p.frac}` : head
}

/**
 * 把科学计数法展开成十进制字面量（"1e-7" → "0.0000001"，"1.5e+21" → "1500000000000000000000"）。
 * String() 对极小 / 极大的 double 会用科学计数法，而 DecStr 不接受这种写法。
 */
function expandExponential(s: string): string {
  if (!/[eE]/.test(s)) return s
  const neg = s.startsWith('-')
  const body = neg ? s.slice(1) : s
  const [mant, expPart] = body.toLowerCase().split('e')
  const [mi, mf = ''] = mant.split('.')
  const digits = mi + mf
  const pointPos = mi.length + parseInt(expPart, 10)
  let out: string
  if (pointPos <= 0) out = `0.${'0'.repeat(-pointPos)}${digits}`
  else if (pointPos >= digits.length) out = digits + '0'.repeat(pointPos - digits.length)
  else out = `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`
  return (neg ? '-' : '') + out
}

/** 数值串是否全为零（"0"、"0.00"、"0."） */
function isZero(p: Parts): boolean {
  return p.int.replace(/0/g, '') === '' && p.frac === ''
}

/**
 * 是否因「修约后小数位超过 MAX_FRAC_DIGITS」而被降级展示。
 * 只有 |v| < 1 且有效数字起点很靠后的误输入（如 0.0000002345 → 0.00000025 位）会命中，
 * 调用方据此决定要不要挂 Tooltip 显示完整值。
 */
export function isClampedForDisplay(v: DecStr | number | null | undefined): boolean {
  const p = parseDecimal(formatRule(v))
  if (!p) return false
  return p.frac.length > MAX_FRAC_DIGITS
}

/**
 * 对外展示：按规则 R 修约 + **去尾零**（1.5 → "1.5"，1 → "1"）。
 *   formatRule("1234.56789") → "1234.57"
 *   formatRule("0.023456")   → "0.0235"
 *   formatRule("1")          → "1"
 *   formatRule("0")          → "0"
 */
export function formatRule(v: DecStr | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const p = parseDecimal(typeof v === 'number' ? String(v) : v)
  if (!p) {
    // 非十进制字面量（如科学计数法）：退回 JS 自身表示，不静默丢位
    return String(v)
  }
  if (isZero(p)) return '0'

  // 分支按 |v| 判定，但进位可能跨过 1：999.999 修约到 2 位后是 1000，
  // 此时分支要跟着翻到「2 位小数」，否则 0.999999 这类边界会取到错的位数。
  let digits = p.int === '0' ? digitsOf(p.frac) : 2
  let r = roundDecimal(p, digits)
  if (p.int === '0' && r.int !== '0') {
    digits = 2
    r = roundDecimal(p, digits)
  }
  const head = (p.neg ? '-' : '') + r.int
  // 尾零已由 roundDecimal 去掉，这里不再补回
  return r.frac ? `${head}.${r.frac}` : head
}


/**
 * 千分位 + 修约，用于只读结果列（单价 / 单位成本 / 理论产量 / 占总成本比例）。
 * 与原 fmtMoney 的差别：修约位数按规则 R，而不是固定 2 位。
 */
export function formatRuleGrouped(v: DecStr | number | null | undefined): string {
  const s = formatRule(v)
  if (s === '') return ''
  const neg = s.startsWith('-')
  const body = neg ? s.slice(1) : s
  const [int, frac] = body.split('.')
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + (frac ? `${intFmt}.${frac}` : intFmt)
}

/** 比较两个十进制串：a < b 返回 -1，相等 0，a > b 返回 1（非法输入按 0 处理） */
export function compareDecimal(a: DecStr | number | null, b: DecStr | number | null): number {
  const pa = parseDecimal(String(normalize(a) ?? '0'))
  const pb = parseDecimal(String(normalize(b) ?? '0'))
  if (!pa || !pb) return 0
  // 负数比较：符号相反时符号定胜负，同号时绝对值比较后取反
  if (pa.neg !== pb.neg) return pa.neg ? -1 : 1
  const flip = pa.neg ? -1 : 1
  const ia = pa.int.padStart(pb.int.length, '0')
  const ib = pb.int.padStart(pa.int.length, '0')
  if (ia !== ib) return ia < ib ? -flip : flip
  const fa = pa.frac.padEnd(pb.frac.length, '0')
  const fb = pb.frac.padEnd(pa.frac.length, '0')
  if (fa === fb) return 0
  return fa < fb ? -flip : flip
}

/** 转成 JS number，仅用于跨过 Wails bindings 边界传给 Go */
export function toNumber(v: DecStr | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
