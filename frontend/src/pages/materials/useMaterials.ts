// 物料库：列表查询、增删改、Excel 导入、价格抽屉状态
import { useEffect, useState, useCallback, useRef } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import { Modal } from 'antd'
import { MaterialService, ExcelService } from '@/lib/bindings'
import type { MaterialWithPrice } from '@/types'
import { fileToBase64 } from '@/shared/utils/file'
import { usePersistedState } from '@/shared/hooks/useStorage'
import { useMaterialEditor } from '@/shared/hooks/useMaterialEditor'
import type { MaterialEditorApi } from '@/shared/hooks/useMaterialEditor'

export interface MaterialsApi {
  list: MaterialWithPrice[]
  loading: boolean
  importing: boolean
  exporting: boolean
  exportOpen: boolean
  clearOpen: boolean
  drawerMaterial: MaterialWithPrice | null
  /** 物料新增 / 编辑：表单、弹窗与落库全在 useMaterialEditor 里，这里只透出给页面 */
  materialEditor: MaterialEditorApi
  search: (kw: string) => void
  refresh: () => void
  openEdit: (m: MaterialWithPrice) => void
  deleteMaterial: (m: MaterialWithPrice) => Promise<void>
  onImport: (file: File) => Promise<boolean>
  downloadTemplate: () => Promise<void>
  openExport: () => void
  closeExport: () => void
  doExport: (allPrices: boolean) => Promise<void>
  openClear: () => void
  closeClear: () => void
  doClear: () => Promise<void>
  openPrice: (m: MaterialWithPrice | null) => void
  /** 分页状态提到这里持有：新增物料后要回第一页，跨组件手改 localStorage 太脆 */
  current: number
  pageSize: number
  onPageChange: (page: number, size: number) => void
}

/** 物料库数据与业务逻辑：列表查询、增删改、Excel 导入、价格抽屉 */
export function useMaterials(messageApi: MessageInstance): MaterialsApi {
  const [keyword, setKeyword] = useState('')
  const [list, setList] = useState<MaterialWithPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [drawerMaterial, setDrawerMaterial] = useState<MaterialWithPrice | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  // 分页（持久化）：新增物料后要把页码拨回 1，否则用户停在第二页时
  // 看不到刚建的物料——列表已按「最新在前」排序，但那只保证它在第一页。
  const [pageSize, setPageSize] = usePersistedState('pageSize', 20)
  const [current, setCurrent] = usePersistedState('current', 1)

  const load = useCallback(async (kw = keyword) => {
    setLoading(true)
    try {
      const data = await MaterialService.ListMaterials(kw)
      setList((data || []) as MaterialWithPrice[])
    } catch (e) {
      messageApi.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [keyword, messageApi])

  useEffect(() => { load() }, []) // eslint-disable-line

  const search = (kw: string) => {
    setKeyword(kw)
    // 搜索结果通常比全量少得多，停在第 5 页会直接显示空表，看着像「搜不到」
    setCurrent(1)
    load(kw)
  }
  const refresh = () => load()

  // 新增 / 编辑走共享 hook。回调拿得到这次保存的物料：
  // 新建的 id 是刚拿到的自增 id，编辑的则早就在 list 里——据此分辨是哪种模式，
  // 不必去读 hook 内部的 editing 状态。新增时还要把页码拨回第 1 页，
  // 否则列表按「最新在前」排序、新物料在第 1 页顶部，停在第二页会看不到它。
  const materialEditor = useMaterialEditor(messageApi, (saved) => {
    const isNew = !saved || !rowsRef.current.some((r) => r.id === saved.id)
    if (isNew) setCurrent(1)
    load()
  })

  // 列表快照：上面的回调用它判断「这条物料是不是新出现的」。
  // 直接闭包捕获 list 会拿到渲染那一刻的旧值，故用 ref 跟随最新。
  const rowsRef = useRef<MaterialWithPrice[]>([])
  rowsRef.current = list

  const openEdit = (m: MaterialWithPrice) => materialEditor.edit(m)

  const deleteMaterial = async (m: MaterialWithPrice) => {
    try {
      await MaterialService.DeleteMaterial(m.id)
      messageApi.success('已删除')
      load()
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  // Excel 导入
  const onImport = async (file: File) => {
    setImporting(true)
    try {
      const b64 = await fileToBase64(file)
      const result = await ExcelService.ImportFromBytes(b64, file.name)
      const r = result as any
      messageApi.success(
        `导入完成：新增物料 ${r.materialsImported}，更新 ${r.materialsUpdated}，导入价格 ${r.pricesImported}，跳过 ${r.skipped}`,
      )
      if (r.errors && r.errors.length) {
        Modal.warning({ title: '导入中的问题', content: r.errors.join('\n') })
      }
      load()
    } catch (e) {
      messageApi.error(String(e))
    } finally {
      setImporting(false)
    }
    return false
  }

  const downloadTemplate = async () => {
    try {
      // 桌面 WebView 不支持前端 a[download] 下载，由后端弹保存对话框并写文件
      const path = await ExcelService.DownloadTemplateToFile()
      if (path) messageApi.success(`模板已保存到 ${path}`)
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  const doExport = async (allPrices: boolean) => {
    setExporting(true)
    try {
      const path = await ExcelService.ExportMaterialsToFile(allPrices)
      if (path) messageApi.success(`已导出 ${list.length} 条物料到 ${path}`)
    } catch (e) {
      messageApi.error(String(e))
    } finally {
      setExporting(false)
    }
  }

  const openExport = () => setExportOpen(true)
  const closeExport = () => setExportOpen(false)

  const openClear = () => setClearOpen(true)
  const closeClear = () => setClearOpen(false)

  // 清空物料库（不可恢复，确认交互在 ClearMaterialsModal 里）
  const doClear = async () => {
    try {
      const res = await MaterialService.ClearAllMaterials()
      messageApi.success(`已清空 ${res?.materialsDeleted ?? 0} 条物料`)
      setClearOpen(false)
      setDrawerMaterial(null) // 抽屉指向的物料已不存在
      load()
    } catch (e) {
      messageApi.error(String(e))
    }
  }

  const openPrice = (m: MaterialWithPrice | null) => setDrawerMaterial(m)

  const onPageChange = (page: number, size: number) => {
    setCurrent(page)
    setPageSize(size)
  }

  return {
    list, loading, importing, exporting, exportOpen, clearOpen,
    drawerMaterial, materialEditor,
    search, refresh, openEdit,
    deleteMaterial, onImport, downloadTemplate,
    openExport, closeExport, doExport, openClear, closeClear, doClear, openPrice,
    current, pageSize, onPageChange,
  }
}
