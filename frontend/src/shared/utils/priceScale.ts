/**
 * 价格「数量级」常量。
 *
 * 与后端 models.PriceScales 一一对应（千克 / 十千克 / 百千克 / 吨），空串表示未填写。
 * 这里是枚举展示的唯一出处：价格抽屉的下拉、新增物料弹窗的下拉、反应计算页历史价
 * 下拉项的文案都取它，避免各处各写一份而漂移。
 */

export const PRICE_SCALES = ['千克', '十千克', '百千克', '吨'] as const

export type PriceScale = (typeof PRICE_SCALES)[number]

/** 下拉选项（用于 antd Select 的 options） */
export const PRICE_SCALE_OPTIONS = PRICE_SCALES.map(v => ({ value: v, label: v }))
