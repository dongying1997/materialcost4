// 文件工具：处理 Wails bindings 的 base64 []byte 传输

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

/** 数字格式化：千分位，最多保留若干位小数 */
export function fmtNum(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '-'
  if (v === 0) return '0'
  const fixed = v.toFixed(digits)
  const [int, dec] = fixed.split('.')
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decTrim = dec ? dec.replace(/0+$/, '') : ''
  return decTrim ? `${intFmt}.${decTrim}` : intFmt
}

/** 货币格式化：千分位 + 2 位小数 */
export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '-'
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
