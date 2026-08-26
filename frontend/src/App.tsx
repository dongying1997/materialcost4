import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { ConfigProvider, Layout, Menu } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import {
  DatabaseOutlined,
  CalculatorOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import MaterialsPage from './pages/MaterialsPage'
import ReactionPage from './pages/ReactionPage'
import SchemesPage from './pages/SchemesPage'

const { Header, Content } = Layout

function NavMenu() {
  const { pathname } = useLocation()
  // 方案管理路由以 /reaction/schemes 开头，需在 /reaction 之前匹配
  const selectedKey = pathname.startsWith('/reaction/schemes')
    ? 'schemes'
    : pathname.startsWith('/reaction')
      ? 'reaction'
      : 'materials'

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[selectedKey]}
      style={{ flex: 1, minWidth: 0, borderBottom: 0 }}
      items={[
        {
          key: 'materials',
          icon: <DatabaseOutlined />,
          label: <NavLink to="/materials">物料库</NavLink>,
        },
        {
          key: 'reaction',
          icon: <CalculatorOutlined />,
          label: <NavLink to="/reaction">反应计算</NavLink>,
        },
        {
          key: 'schemes',
          icon: <SaveOutlined />,
          label: <NavLink to="/reaction/schemes">方案管理</NavLink>,
        },
      ]}
    />
  )
}

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
              marginRight: 32, whiteSpace: 'nowrap',
            }}>
              物料成本计算
            </div>
            <NavMenu />
          </Header>
          <Content style={{ padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <Routes>
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/reaction/schemes" element={<SchemesPage />} />
              <Route path="/reaction" element={<ReactionPage />} />
            </Routes>
          </Content>
        </Layout>
      </HashRouter>
    </ConfigProvider>
  )
}

export default App
