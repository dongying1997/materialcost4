// 方案管理：方案列表、保存与删除
import { useEffect, useState, useCallback } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import { Modal } from 'antd'
import { SchemeService } from '../bindings'
import type { Scheme, SchemePayload, StepRow } from '../types'
import { stepsToPayload, stepsFromScheme, newStep } from '../utils/reaction'
import { fileToBase64 } from '../utils/file'

// 定义SchemeApi接口
export interface SchemeApi {
  schemes: Scheme[]
  selectedIds: number[]
  exporting: boolean
  importing: boolean
  loadSchemes: () => void
  saveScheme: (name: string, note: string, steps: StepRow[]) => Promise<boolean>
  loadScheme: (sch: Scheme) => Promise<void>
  deleteScheme: (sch: Scheme) => Promise<void>
  toggleSelect: (id: number) => void
  clearSelection: () => void
  exportSchemes: (ids: number[]) => Promise<void>
  importSchemes: (file: File) => Promise<boolean>
  deleteSelected: () => Promise<void>
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
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  // 加载方案列表
  const loadSchemes = useCallback(async () => {
    try {
      const data = await SchemeService.ListSchemes()
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
      await SchemeService.SaveScheme(payload as Scheme)
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
      const full = await SchemeService.GetScheme(sch.id)
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
      await SchemeService.DeleteScheme(sch.id)
      messageApi.success('已删除')
      setSelectedIds((prev) => prev.filter((id) => id !== sch.id))
      loadSchemes()
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  const clearSelection = () => setSelectedIds([])

  const exportSchemes = async (ids: number[]) => {
    setExporting(true)
    try {
      const path = await SchemeService.ExportSchemesToFile(ids)
      if (path) messageApi.success(`已导出 ${ids.length || schemes.length} 个方案到 ${path}`)
    } catch (e) {
      messageApi.error(String(e))
    } finally {
      setExporting(false)
    }
  }

  const importSchemes = async (file: File) => {
    setImporting(true)
    try {
      const b64 = await fileToBase64(file)
      const result = await SchemeService.ImportSchemes(b64)
      const r = result as any
      messageApi.success(`导入完成：成功导入 ${r.imported ?? 0} 个方案`)
      if (r.errors && r.errors.length) {
        Modal.warning({ title: '导入中的问题', content: r.errors.join('\n') })
      }
      loadSchemes()
    } catch (e) {
      messageApi.error(String(e))
    } finally {
      setImporting(false)
    }
    return false
  }

  const deleteSelected = async () => {
    const n = selectedIds.length
    if (n === 0) return
    const confirmed = await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: `删除选中的 ${n} 个方案？`,
        content: '该操作不可恢复。',
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
    if (!confirmed) return
    try {
      for (const id of selectedIds) {
        await SchemeService.DeleteScheme(id)
      }
      messageApi.success(`已删除 ${n} 个方案`)
      setSelectedIds([])
      loadSchemes()
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  return {
    schemes, selectedIds, exporting, importing,
    loadSchemes, saveScheme, loadScheme, deleteScheme,
    toggleSelect, clearSelection, exportSchemes, importSchemes, deleteSelected,
  }
}
