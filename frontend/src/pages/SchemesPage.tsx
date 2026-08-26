import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { useSchemes } from '../hooks/useSchemes'
import SchemesPanel from '../components/SchemesPanel'
import type { StepRow } from '../types'

/** 方案管理页：列出已保存的方案，载入后跳转到反应计算页 */
function SchemesPage() {
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()

  // 载入方案到编辑器，并通过路由 state 把步骤传给反应计算页
  const handleLoaded = (rows: StepRow[]) => {
    navigate('/reaction', { state: { loadRows: rows } })
  }
  const schemes = useSchemes(messageApi, handleLoaded)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {contextHolder}
      <div style={{ overflow: 'auto', minHeight: 0 }}>
        <SchemesPanel
          schemes={schemes.schemes}
          onLoad={schemes.loadScheme}
          onDelete={schemes.deleteScheme}
        />
      </div>
    </div>
  )
}

export default SchemesPage
