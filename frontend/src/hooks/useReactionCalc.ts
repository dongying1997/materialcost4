// 反应计算的核心状态与计算逻辑
import { useEffect, useState, useCallback, useRef } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import { MaterialService, ReactionService } from '../bindings'
import type {
  MaterialWithPrice, StepRow, MultiStepResult, MaterialPriceOption,
} from '../types'
import { newStep, stepsToPayload, backfillFromResult } from '../utils/reaction'
import { usePersistedState } from './useStorage'

const STORAGE_KEY = 'materialcost4:reaction-steps'


export interface ReactionCalcApi {
  steps: StepRow[]
  setSteps: React.Dispatch<React.SetStateAction<StepRow[]>>
  materials: MaterialWithPrice[]
  result: MultiStepResult | null
  calculating: boolean
  updateStep: (index: number, step: StepRow) => void
  addStep: () => void
  removeStep: (index: number) => void
  moveStep: (index: number, direction: 1 | -1) => void
  clearAll: () => void
  recalculate: () => void
  ensurePriceOptions: (materialId: number, rowKey: string, stepIdx: number) => void
}

/** 反应计算主状态：步骤编辑行、物料库、计算结果与实时计算（步骤内容持久化到 localStorage） */
export function useReactionCalc(messageApi: MessageInstance): ReactionCalcApi {
  const [steps, setSteps] = usePersistedState(STORAGE_KEY, [newStep()])
  const [materials, setMaterials] = useState<MaterialWithPrice[]>([])
  const [result, setResult] = useState<MultiStepResult | null>(null)
  const [calculating, setCalculating] = useState(false)
  const priceOptionsCache = useRef<Record<number, MaterialPriceOption[]>>({})

  // 初始化一步
  useEffect(() => {
    if (steps.length === 0) setSteps([newStep()])
  }, [steps.length])

  

  // 加载物料库
  const loadMaterials = useCallback(async () => {
    try {
      const data = await MaterialService.ListMaterials('')
      setMaterials((data || []) as MaterialWithPrice[])
    } catch (e) {
      messageApi.error(String(e))
    }
  }, [messageApi])
  useEffect(() => { loadMaterials() }, [loadMaterials])

  // 实时计算：steps 变化时（debounce 300ms）
  const calcRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const calculate = useCallback(async () => {
    setCalculating(true)
    try {
      const r = await ReactionService.Calculate({ steps: stepsToPayload(steps) })
      setResult(r as MultiStepResult)
    } catch (e) {
      messageApi.error(String(e))
    } finally {
      setCalculating(false)
    }
  }, [steps, messageApi])

  useEffect(() => {
    if (calcRef.current) clearTimeout(calcRef.current)
    calcRef.current = setTimeout(() => { calculate() }, 300)
    return () => { if (calcRef.current) clearTimeout(calcRef.current) }
  }, [steps, calculate])

  const updateStep = (i: number, s: StepRow) => {
    setSteps(prev => prev.map((x, idx) => idx === i ? s : x))
  }
  const addStep = () => setSteps(prev => [...prev, newStep()])
  const removeStep = (i: number) => {
    if (steps.length <= 1) { messageApi.warning('至少保留一个步骤'); return }
    setSteps(prev => prev.filter((_, idx) => idx !== i))
  }
  const moveStep = (i: number, direction: 1 | -1) => {
    const j = i + direction
    setSteps(prev => {
      if (j < 0 || j >= prev.length) return prev
      const a = [...prev]
      ;[a[i], a[j]] = [a[j], a[i]]
      return a
    })
  }
  const clearAll = () => {
    setSteps([newStep()])
    setResult(null)
  }

  // 拉取某物料的价格选项
  const ensurePriceOptions = async (materialId: number, rowKey: string, stepIdx: number) => {
    if (!materialId) return
    if (priceOptionsCache.current[materialId]) {
      applyPriceOptions(materialId, rowKey, stepIdx)
      return
    }
    try {
      const opts = await ReactionService.PriceOptionsForMaterial(materialId)
      priceOptionsCache.current[materialId] = (opts || []) as MaterialPriceOption[]
      applyPriceOptions(materialId, rowKey, stepIdx)
    } catch { /* ignore */ }
  }
  const applyPriceOptions = (materialId: number, rowKey: string, stepIdx: number) => {
    const opts = priceOptionsCache.current[materialId]
    setSteps(prev => prev.map((s, idx) => idx !== stepIdx ? s : ({
      ...s,
      reagents: s.reagents.map(r => r._key === rowKey ? { ...r, priceOptions: opts } : r),
    })))
  }

  // 重新计算按钮：计算结果后回填空缺字段
  const recalculate = async () => {
    setCalculating(true)
    try {
      const r = await ReactionService.Calculate({ steps: stepsToPayload(steps) })
      setResult(r as MultiStepResult)
      // 数据无误时补全空缺数据（回填为推算值）
      const filled = backfillFromResult(steps, r as MultiStepResult)
      if (filled !== steps) setSteps(filled)
    } catch (e) {
      messageApi.error(String(e))
    } finally {
      setCalculating(false)
    }
  }

  return {
    steps, setSteps, materials, result, calculating,
    updateStep, addStep, removeStep, moveStep, clearAll,
    recalculate, ensurePriceOptions,
  }
}
