// 应用外壳：路由与整体布局。
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, Layout } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import NavMenu from './NavMenu'
import MaterialsPage from '@/pages/materials/MaterialsPage'
import ReactionPage from '@/pages/reaction/ReactionPage'
import SchemesPage from '@/pages/schemes/SchemesPage'

const { Header, Content } = Layout

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <HashRouter>
        <Layout style={{ height: '100vh', overflow: 'hidden' }}>
          <Header style={{
            display: 'flex', alignItems: 'center', flexShrink: 0,
            borderBottom: '1px solid #f0f0f0', background: '#fff', paddingInline: 16,
          }}>
            <div style={{
              fontSize: 18, fontWeight: 600, color: '#1677ff',
              marginRight: 32, whiteSpace: 'nowrap',width: 50
            }}>
              
            </div>
            <NavMenu />
          </Header>
          <Content style={{ padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <Routes>
              <Route path="/" element={<Navigate to="/materials" replace />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/schemes" element={<SchemesPage />} />
              <Route path="/reaction" element={<ReactionPage />} />
            </Routes>
          </Content>
        </Layout>
      </HashRouter>
    </ConfigProvider>
  )
}

export default App
