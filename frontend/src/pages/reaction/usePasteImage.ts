import { useCallback, useEffect } from 'react'
import { message } from 'antd'

/** 单张图片的体积上限（base64 解码前的字节数，约 6MB）。
 *  图片会随方案存入 SQLite 并写进导出 JSON，过大既不合适、也拖慢每次保存。 */
const MAX_BYTES = 6 * 1024 * 1024

/** 从剪贴板事件里取出第一张图片；没有图片时返回 null */
function imageFromClipboard(items: DataTransferItemList): File | null {
  for (const it of Array.from(items)) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile()
      if (f) return f
    }
  }
  return null
}

/**
 * File → 完整 dataURL（形如 `data:image/jpeg;base64,...`）。
 *
 * 刻意保留 MIME 前缀而不是只存 base64：粘贴进来的可能是 JPEG/WebP/PNG，
 * 只留 base64 就丢了格式信息，展示时只能硬编码一个 MIME 去拼——
 * 声明成 PNG 而数据其实是 JPEG，是在赌浏览器会嗅探修正，不该赌。
 */
function toDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

interface Options {
  onImage: (dataURL: string) => void
  /** 关闭时不监听粘贴（如弹窗打开时） */
  enabled?: boolean
}

/**
 * 粘贴图片：全局 Ctrl/⌘+V + 工具栏按钮两条入口。
 *
 * 全局粘贴会跳过两种情况，否则会抢用户的操作：
 *   - 焦点在输入框/文本域里（用户想粘文字）
 *   - 剪贴板里没有图片（粘贴文本、文件等一律不管）
 */
export function usePasteImage({ onImage, enabled = true }: Options) {
  const [messageApi, contextHolder] = message.useMessage()

  const accept = useCallback(async (file: File | null) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      messageApi.error(`图片过大（${(file.size / 1024 / 1024).toFixed(1)} MB），请压缩到 6 MB 以内`)
      return
    }
    try {
      onImage(await toDataURL(file))
    } catch {
      messageApi.error('读取图片失败')
    }
  }, [onImage, messageApi])

  useEffect(() => {
    if (!enabled) return
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null
      // 焦点在可输入元素里时让浏览器照常粘贴文字
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      const file = e.clipboardData ? imageFromClipboard(e.clipboardData.items) : null
      if (!file) return // 剪贴板里不是图片，不拦截
      e.preventDefault()
      void accept(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [enabled, accept])

  /**
   * 工具栏按钮：提示用户按 Ctrl/⌘+V。
   *
   * 浏览器不允许脚本在非用户手势下读剪贴板图片（navigator.clipboard.read 需要
   * 权限授予且多数浏览器只支持文本/图片的有限读取），所以这里不尝试直接读，
   * 只给出操作指引——粘贴仍由上面的全局 paste 监听完成。
   */
  const requestPaste = useCallback(() => {
    messageApi.info('请按 Ctrl/⌘+V 粘贴图片')
  }, [messageApi])

  return { requestPaste, contextHolder }
}
