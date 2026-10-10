import type React from 'react'

interface Props {
  children: React.ReactNode
  /** 底部的间距（默认 16px，与页面里其它区块的间距一致） */
  marginBottom?: number
}

/**
 * 工具栏底框。
 *
 * 三个页面（物料库 / 反应计算 / 方案管理）的工具栏结构一致，这里统一收口，
 * 免得同一套边框、圆角、内边距在三个文件里各写一遍、日后改一处漏两处。
 *
 *
 * 用 flex + 居中对齐：工具栏里的破坏性操作靠子元素的 `marginLeft: 'auto'`
 * 推到最右，居中模式下该外边距依然生效。
 */
function ToolbarStrip({ children, marginBottom = 8 }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom,
      padding: '10px 12px',
      background: '#ffffff',
      borderRadius: 8,
    }}>
      {children}
    </div>
  )
}

export default ToolbarStrip
