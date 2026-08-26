// 方案管理：方案列表、保存与删除
import { useEffect, useState, useCallback } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import { ReactionService } from '../bindings'
import type { Scheme, SchemePayload, StepRow } from '../types'
import { stepsToPayload, stepsFromScheme, newStep } from '../utils/reaction'

// 定义SchemeApi接口
export interface SchemeApi {
  schemes: Scheme[]
  loadSchemes: () => void
  saveScheme: (name: string, note: string, steps: StepRow[]) => Promise<boolean>
  loadScheme: (sch: Scheme) => Promise<void>
  deleteScheme: (sch: Scheme) => Promise<void>
}

/**
 * 方案管理：加载方案列表、保存 / 载入 / 删除方案。
 * @param onLoaded 载入方案后的回调（把步骤注入编辑器）
 * @returns SchemeApi
 */
export function useSchemes(
  messageApi: MessageInstance,
  onLoaded: (rows: StepRow[]) => void,
): SchemeApi {
  const [schemes, setSchemes] = useState<Scheme[]>([])

  // 加载方案列表
  const loadSchemes = useCallback(async () => {
    try {
      const data = await ReactionService.ListSchemes()
      setSchemes((data || []) as Scheme[])
    } catch (e) {
      messageApi.error(String(e))
    }
  }, [messageApi])
  useEffect(() => { loadSchemes() }, [loadSchemes])

  const saveScheme = async (name: string, note: string, steps: StepRow[]): Promise<boolean> => {
    const payload: SchemePayload = {
      id: 0, name, note,
      steps: stepsToPayload(steps),
      // 时间字段由后端生成，不发送（空字符串会触发 time.Time 反序列化报错）
    }
    try {
      await ReactionService.SaveScheme(payload as Scheme)
      messageApi.success('方案已保存')
      loadSchemes()
      return true
    } catch (e) {
      messageApi.error(String(e))
      return false
    }
  }

  const loadScheme = async (sch: Scheme) => {
    try {
      const full = await ReactionService.GetScheme(sch.id)
      if (!full) return
      const rows = stepsFromScheme(full.steps)
      onLoaded(rows.length ? rows : [newStep()])
      messageApi.success(`已载入方案「${full.name}」`)
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  const deleteScheme = async (sch: Scheme) => {
    try {
      await ReactionService.DeleteScheme(sch.id)
      messageApi.success('已删除')
      loadSchemes()
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  return { schemes, loadSchemes, saveScheme, loadScheme, deleteScheme }
}
