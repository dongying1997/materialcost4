import { useEffect, useRef, useState } from 'react'
import { Image } from 'antd'

/**
 * 图片框的目标比例（宽 : 高）。高度由实测宽度按此比例算出，
 * 而不是固定像素高——固定高度会让实际比例随窗口宽度漂移。
 */
const TARGET_RATIO = 12
/** 高度上下限：窗口极窄/极宽时兜底，避免框矮到看不清或高到挤走 StepCard */
const MIN_BOX_HEIGHT = 80
const MAX_BOX_HEIGHT = 200

interface Props {
  /** 完整 dataURL（`data:image/png;base64,...`）；空串表示未附图 */
  image: string
}

/**
 * 方案附图框。
 *
 * 图片随方案保存（Scheme.image）。框宽跟随内容区、高按 12:1 反推。
 *
 * 缩放策略（两种取舍各取所长）：
 *   比框宽的图（比例 > 12）→ cover，裁掉两侧，这样能「上下占满」不留白；
 *   比框矮的图（比例 ≤ 12）→ contain，完整显示，不为占满而裁掉内容。
 * 比例要到图片加载完才测得到，因此首帧按 cover 渲染、测得后立即纠正——
 * 由宽高比>12 切到 contain 时框的高与宽都没变（只把 cover 的裁切改成留白），
 * 视觉上是连续的，不会跳。
 *
 * **没有图片时整个框不渲染**——空框会把 StepCard 往下挤，而它本身不传递信息。
 * 「当前有没有图」由工具栏的「粘贴图片 / 移除图片」两个按钮的显隐表达。
 */
function SchemeImageBox({ image }: Props) {
  // 实测的框宽：标注与高度都要按真实宽度算，写死数字会在窗口缩放后失准。
  // 用 ResizeObserver 而不是 ref 回调里读 clientWidth——后者只在 React 重新渲染时
  // 才可能更新，而窗口缩放本身不触发本组件的渲染，宽度会一直停在旧值。
  const [boxWidth, setBoxWidth] = useState(0)
  // 测量对象是外层容器而不是图片框本身：无图时图片框不渲染，
  // 若只测它，宽度会一直停在 0，标注就只能按兜底高度画，形同虚设。
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const sync = () => setBoxWidth(el.clientWidth)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 按 12:1 由实测宽度反推高度；拿不到宽度时先给个合理值，避免首帧塌成 0 高
  const boxHeight = boxWidth > 0
    ? Math.min(MAX_BOX_HEIGHT, Math.max(MIN_BOX_HEIGHT, Math.round(boxWidth / TARGET_RATIO)))
    : MIN_BOX_HEIGHT

  // 图片实际宽高比，加载完才有。null = 尚未测得，按「比框宽」处理。
  const [natural, setNatural] = useState<number | null>(null)
  // 图片会随方案切换，比例要跟着重置，否则会短暂沿用上一张图的判断
  useEffect(() => { setNatural(null) }, [image])

  const fit: 'cover' | 'contain' = natural === null || natural > TARGET_RATIO ? 'cover' : 'contain'

  return (
    <div
      ref={wrapRef}
      style={{ marginBottom: 12, display: 'flex', flexDirection: 'column' }}
    >
      {/* 没有图片就不占位：空框会把 StepCard 往下挤，而它本身不传递信息 */}
      {!image ? null : (
        <div
          style={{
            height: boxHeight,
            background: '#fff',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            // 图片按上面的策略缩放；这里兜一层 overflow:hidden 是防
            // 「点击预览」等内部元素溢出框体
            overflow: 'hidden',
          }}
        >
          <Image
            src={image}
            alt="方案附图"
            // antd 的 .ant-image 是 display:inline-block，宽度由内容决定而非满宽，
            // 图片因此会贴左。这里给出明确的宽高 + margin:auto：
            //   - 宽度按 min(框宽, 按比例缩放后的宽度) 算，宽度小于框宽时
            //     （即 contain 留白的情形）margin:auto 自然把它摆到正中；
            //   - 首帧拿不到比例时按框宽算，即贴满，不会先闪一下窄图。
            // 注：Image 的 style 与 wrapperStyle 落在同一元素上（antd 源码里
            // 两者都传给外层 div），所以只给 style 一份，避免重复。
            style={{
              display: 'block',
              height: boxHeight,
              width: natural === null ? '100%' : Math.min(boxWidth, boxHeight * natural),
              margin: '0 auto',
              objectFit: fit,
            }}
            onLoad={e => {
              const el = e.currentTarget
              if (el.naturalHeight > 0) setNatural(el.naturalWidth / el.naturalHeight)
            }}
            preview={{ mask: '点击预览' }}
          />
        </div>
      )}

    </div>
  )
}

export default SchemeImageBox
