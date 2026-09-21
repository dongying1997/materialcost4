// 文件工具：处理 Wails bindings 的 base64 []byte 传输
import { formatRuleGrouped } from './decimal'

/** 读取 File 为 base64 字符串（传给 Go 的 []byte 参数） */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // FileReader 的 dataURL 形如 data:application/...;base64,XXXX
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 数字格式化：按修约规则 R 展示（|v| ≥ 1 保留 2 位小数，|v| < 1 保留 3 位有效数字），
 * 千分位、去尾零。规则与输入框（DecimalInput）一致，见 utils/decimal.ts。
 * 保留 digits 参数是为了兼容既有调用点，显式传入时按调用方指定的小数位。
 */
export function fmtNum(v: number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '-'
  if (digits !== undefined) {
    const fixed = v.toFixed(digits)
    const [int, dec] = fixed.split('.')
    const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const decTrim = dec ? dec.replace(/0+$/, '') : ''
    return decTrim ? `${intFmt}.${decTrim}` : intFmt
  }
  return formatRuleGrouped(v)
}

/** 金额格式化：规则 R 修约 + 千分位（修约位数不再是固定 2 位） */
export function fmtMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '-'
  // 调用方可能直接传高精度串（DecStr），字符串走规则 R 的定点路径，
  // 不经过 Number()；只有 number 才需要判 NaN
  if (typeof v === 'number' && Number.isNaN(v)) return '-'
  return formatRuleGrouped(v)
}

/** 时间格式化：输出「2026年3月2日 16点32分」；解析失败时原样返回，空值返回 '-' */
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}点${p(d.getMinutes())}分`
}
