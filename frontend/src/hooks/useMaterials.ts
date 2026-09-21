// 物料库：列表查询、增删改、Excel 导入、价格抽屉状态
import { useEffect, useState, useCallback } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import { Form, Modal } from 'antd'
import { MaterialService, ExcelService } from '../bindings'
import type { Material, MaterialPayload, MaterialWithPrice, Price, PricePayload } from '../types'
import { fileToBase64 } from '../utils/file'
import { usePersistedState } from './useStorage'
import dayjs from 'dayjs'

export interface MaterialsApi {
  list: MaterialWithPrice[]
  loading: boolean
  importing: boolean
  exporting: boolean
  exportOpen: boolean
  clearOpen: boolean
  form: ReturnType<typeof Form.useForm>[0]
  editOpen: boolean
  editing: Material | null
  drawerMaterial: MaterialWithPrice | null
  search: (kw: string) => void
  refresh: () => void
  openCreate: () => void
  openEdit: (m: MaterialWithPrice) => void
  closeEdit: () => void
  saveMaterial: () => Promise<void>
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
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [drawerMaterial, setDrawerMaterial] = useState<MaterialWithPrice | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [form] = Form.useForm()
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

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    // 价格的单位给个默认值（与价格抽屉一致），其余留空由用户按需填
    form.setFieldsValue({ priceUnit: '元/kg' })
    setEditOpen(true)
  }

  const openEdit = (m: MaterialWithPrice) => {
    setEditing(m)
    form.setFieldsValue({
      code: m.code, name: m.name, cas: m.cas, formula: m.formula,
      molWeight: m.molWeight, content: m.content, recoveryRate: m.recoveryRate,
      note: m.note,
    })
    setEditOpen(true)
  }
  const closeEdit = () => setEditOpen(false)

  const saveMaterial = async () => {
    const values = await form.validateFields()
    const payload: MaterialPayload = {
      id: editing?.id || 0,
      code: values.code || '', name: values.name, cas: values.cas || '',
      formula: values.formula || '', molWeight: values.molWeight || 0,
      content: values.content || 0, recoveryRate: values.recoveryRate || 0,
      note: values.note || '',
    }

    // 价格整体可选：只有用户真的动了价格表单才处理。
    // 判据只看价格块自己的字段（都以 price 开头），刻意不含：
    //   - 物料自身的字段（名称/分子量/含量 等），那是建物料的信号，不是填价格的信号
    //   - priceUnit：它带默认值「元/kg」，有值不代表用户填过价格
    // 注意价格块的「含量(%)」命名成 priceContent 而不是 content，两者分属两块表单，
    // 同名会互相覆盖。
    const touchedPrice = editing === null && (
      values.priceValue != null || values.priceDate != null ||
      !!values.priceSupplier || !!values.priceSpec || values.priceContent != null
    )
    if (touchedPrice && (values.priceValue == null || values.priceValue <= 0)) {
      messageApi.warning('已填写价格信息，请补上价格金额（或清空价格栏只新增物料）')
      return
    }

    try {
      const saved = await MaterialService.SaveMaterial(payload as Material)
      if (!saved) {
        messageApi.error('物料保存失败：后端未返回物料')
        return
      }
      if (touchedPrice) {
        // 物料必须先落库拿到 id，价格才能挂到它下面——
        // 因此这里是两次调用而不是一个事务；价格存失败不影响已建好的物料。
        const pricePayload: PricePayload = {
          id: 0,
          materialId: saved.id,
          price: values.priceValue,
          unit: values.priceUnit || '元/kg',
          supplier: values.priceSupplier || '',
          // 后端 time.Time 需要完整 RFC3339（本地时区偏移），纯日期会解析失败；
          // 没填日期时按今天算，与价格抽屉里「默认今天」的行为一致
          date: (values.priceDate || dayjs()).format('YYYY-MM-DDTHH:mm:ssZ'),
          spec: values.priceSpec || '',
          content: values.priceContent || 0,
          note: '',
        }
        try {
          await MaterialService.SavePrice(pricePayload as Price)
          messageApi.success('物料与价格已新增')
        } catch (pe) {
          // 物料已经建好了，把这一点说清楚，否则用户会以为整次操作都失败而重复新增
          messageApi.error(`物料已新增，但价格保存失败：${String(pe)}`)
          setEditOpen(false)
          load()
          return
        }
      } else {
        messageApi.success(editing ? '物料已更新' : '物料已新增')
        if (!editing) setCurrent(1) // 新物料在第 1 页顶部，把视图带过去
      }
      setEditOpen(false)
      load()
    } catch (e) {
      messageApi.error(String(e))
    }
  }

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
    list, loading, importing, exporting, exportOpen, clearOpen, form,
    editOpen, editing, drawerMaterial,
    search, refresh, openCreate, openEdit, closeEdit,
    saveMaterial, deleteMaterial, onImport, downloadTemplate,
    openExport, closeExport, doExport, openClear, closeClear, doClear, openPrice,
    current, pageSize, onPageChange,
  }
}
