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
 * 配色取舍：页面容器是白底，StepCard 也是白底（靠边框与阴影区分），
 * 所以底框不能再用白色——会和卡片糊成一片。选 #f5f5f5 而不是更常见的 #fafafa，
 * 是为了和白色卡片拉开足够的明度差；也刻意不画边框，避免和工具栏内
 * 本来就多的描边按钮（默认 variant 自带 1px 边框）抢视觉。
 *
 * 用 flex + 居中对齐：工具栏里的破坏性操作靠子元素的 `marginLeft: 'auto'`
 * 推到最右，居中模式下该外边距依然生效。
 */
function ToolbarStrip({ children, marginBottom = 16 }: Props) {
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
