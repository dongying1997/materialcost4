// 物料库：列表查询、增删改、Excel 导入、价格抽屉状态
import { useEffect, useState, useCallback } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import { Form, Modal } from 'antd'
import { MaterialService, ExcelService } from '../bindings'
import type { Material, MaterialPayload, MaterialWithPrice } from '../types'
import { fileToBase64 } from '../utils/file'

export interface MaterialsApi {
  list: MaterialWithPrice[]
  loading: boolean
  importing: boolean
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
  openPrice: (m: MaterialWithPrice | null) => void
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
  const [form] = Form.useForm()

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
    load(kw)
  }
  const refresh = () => load()

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
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
    try {
      await MaterialService.SaveMaterial(payload as Material)
      messageApi.success(editing ? '物料已更新' : '物料已新增')
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

  const openPrice = (m: MaterialWithPrice | null) => setDrawerMaterial(m)

  return {
    list, loading, importing, form,
    editOpen, editing, drawerMaterial,
    search, refresh, openCreate, openEdit, closeEdit,
    saveMaterial, deleteMaterial, onImport, downloadTemplate, openPrice,
  }
}
