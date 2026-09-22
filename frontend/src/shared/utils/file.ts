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
