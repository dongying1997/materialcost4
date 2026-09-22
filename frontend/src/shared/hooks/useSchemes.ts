// 方案管理：方案列表、保存、改名与删除
import { useEffect, useState, useCallback } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import type { FormInstance } from 'antd'
import { Modal } from 'antd'
import { SchemeService } from '@/lib/bindings'
import type { Scheme, SchemePayload, SchemeSummary, StepRow } from '@/types'
import { stepsToPayload, stepsFromScheme, newStep } from '@/lib/reaction'
import { fileToBase64 } from '@/shared/utils/file'

/** 已载入/已保存方案在库中的身份。编辑器据此决定「保存」是写回还是新建。 */
export interface SchemeMeta {
  id: number
  name: string
  note: string
}

// 定义SchemeApi接口
export interface SchemeApi {
  schemes: SchemeSummary[]
  selectedIds: number[]
  exporting: boolean
  importing: boolean
  /** 正在改名的方案；null 表示改名弹窗关闭 */
  renaming: SchemeSummary | null
  /** 改名请求进行中（用于弹窗确认按钮的 loading） */
  renamingSaving: boolean
  loadSchemes: () => void
  /** 保存：id > 0 写回该行，id 为 0 新建。返回落库后的方案 */
  saveScheme: (name: string, note: string, steps: StepRow[], image: string, id: number) => Promise<Scheme | null>
  /** 另存为：只新增一行，绝不覆盖已有方案 */
  saveSchemeAs: (name: string, note: string, steps: StepRow[], image: string) => Promise<Scheme | null>
  loadSchemeById: (id: number) => Promise<void>
  deleteSchemeById: (id: number) => Promise<void>
  openRename: (s: SchemeSummary) => void
  closeRename: () => void
  renameScheme: (form: FormInstance) => Promise<void>
  toggleSelect: (id: number) => void
  clearSelection: () => void
  exportSchemes: (ids: number[]) => Promise<void>
  importSchemes: (file: File) => Promise<boolean>
  deleteSelected: () => Promise<void>
}

/**
 * 方案管理：加载方案列表、保存 / 载入 / 改名 / 删除方案。
 * @param onLoaded 载入方案后的回调（把步骤注入编辑器）。
 * 带上方案 id 与名称：编辑器据此把「保存方案」变成写回这一行，
 * 而不是每次都新建（见 ReactionPage 的 currentScheme）。
 * @returns SchemeApi
 */
export function useSchemes(
  messageApi: MessageInstance,
  onLoaded: (rows: StepRow[], image: string, meta: SchemeMeta) => void,
): SchemeApi {
  const [schemes, setSchemes] = useState<SchemeSummary[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [renaming, setRenaming] = useState<SchemeSummary | null>(null)
  const [renamingSaving, setRenamingSaving] = useState(false)

  // 加载方案列表
  const loadSchemes = useCallback(async () => {
    try {
      const data = await SchemeService.ListSchemes()
      setSchemes((data || []) as SchemeSummary[])
    } catch (e) {
      messageApi.error(String(e))
    }
  }, [messageApi])
  useEffect(() => { loadSchemes() }, [loadSchemes])

  // id > 0 时写回那一行（后端 SaveScheme 的整行更新），id 为 0 时新建
  const saveScheme = async (name: string, note: string, steps: StepRow[], image: string, id: number): Promise<Scheme | null> => {
    const payload: SchemePayload = {
      id, name, note, image,
      steps: stepsToPayload(steps),
      // 时间字段由后端生成，不发送（空字符串会触发 time.Time 反序列化报错）
    }
    try {
      const saved = await SchemeService.SaveScheme(payload as Scheme)
      messageApi.success(id > 0 ? '方案已保存' : '方案已新建')
      loadSchemes()
      return saved as Scheme | null
    } catch (e) {
      messageApi.error(String(e))
      return null
    }
  }

  // 另存为走 CreateScheme 而不是传 id:0 给 SaveScheme：后者在 id 传错时
  // 会整行覆盖已有方案，而另存为的语义是「一定产生新行」，交给服务端钉死。
  const saveSchemeAs = async (name: string, note: string, steps: StepRow[], image: string): Promise<Scheme | null> => {
    const payload: SchemePayload = {
      id: 0, name, note, image,
      steps: stepsToPayload(steps),
    }
    try {
      const created = await SchemeService.CreateScheme(payload as Scheme)
      messageApi.success('已另存为新方案')
      loadSchemes()
      return created as Scheme | null
    } catch (e) {
      messageApi.error(String(e))
      return null
    }
  }

  // 列表项只有摘要（不含 steps），完整方案在载入时才拉取
  const loadSchemeById = async (id: number) => {
    try {
      const full = await SchemeService.GetScheme(id)
      if (!full) return
      const rows = stepsFromScheme(full.steps)
      // 图片为空串表示该方案没附图——此时应清掉当前图，否则会把上一张图带进新方案
      onLoaded(rows.length ? rows : [newStep()], full.image || '',
        { id: full.id, name: full.name, note: full.note })
      messageApi.success(`已载入方案「${full.name}」`)
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  const deleteSchemeById = async (id: number) => {
    try {
      await SchemeService.DeleteScheme(id)
      messageApi.success('已删除')
      setSelectedIds((prev) => prev.filter((x) => x !== id))
      loadSchemes()
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  const openRename = (s: SchemeSummary) => setRenaming(s)
  const closeRename = () => setRenaming(null)

  // 改名走 RenameScheme 专用接口，而不是 SaveScheme：后者是整行更新
  // （steps / image / updated_at 全写一遍），改名只需动名称。用专用接口
  // 既不用为了改名把整行方案（含 base64 附图）拉回来再写回去，也保住了
  // updated_at 的语义——它是列表的排序键，刷新它会让纯改名把方案顶到最前。
  const renameScheme = async (form: FormInstance) => {
    const current = renaming
    if (!current) return
    const values = await form.validateFields()
    setRenamingSaving(true)
    try {
      await SchemeService.RenameScheme(current.id, values.name)
      messageApi.success('方案已重命名')
      closeRename()
      loadSchemes()
    } catch (e) {
      messageApi.error(String(e))
    } finally {
      setRenamingSaving(false)
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
    schemes, selectedIds, exporting, importing, renaming, renamingSaving,
    loadSchemes, saveScheme, saveSchemeAs, loadSchemeById, deleteSchemeById,
    openRename, closeRename, renameScheme,
    toggleSelect, clearSelection, exportSchemes, importSchemes, deleteSelected,
  }
}
