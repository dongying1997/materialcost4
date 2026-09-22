import { HashRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { ConfigProvider, Layout, Menu } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import {
  DatabaseOutlined,
  CalculatorOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import MaterialsPage from '@/pages/materials/MaterialsPage'
import ReactionPage from '@/pages/reaction/ReactionPage'
import SchemesPage from '@/pages/schemes/SchemesPage'

const { Header, Content } = Layout

// 菜单项与路由前缀的映射，按路径段匹配（避免 /reactions 误匹配 /reaction）
const NAV_ITEMS = [
  { key: 'materials', path: '/materials', icon: <DatabaseOutlined />, label: '物料库' },
  { key: 'reaction', path: '/reaction', icon: <CalculatorOutlined />, label: '反应计算' },
  { key: 'schemes', path: '/schemes', icon: <SaveOutlined />, label: '方案管理' },
] as const

/** 判断 pathname 是否落在某个路由前缀下（按路径段，避免前缀误匹配） */
function matchKey(pathname: string): string {
  const seg = pathname.split('/')[1] ?? ''
  return NAV_ITEMS.find((item) => item.path === `/${seg}`)?.key ?? 'materials'
}

function NavMenu() {
  const { pathname } = useLocation()
  const selectedKey = matchKey(pathname)

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[selectedKey]}
      style={{ flex: 1, minWidth: 0, borderBottom: 0 }}
      items={NAV_ITEMS.map(({ key, path, icon, label }) => ({
        key,
        icon,
        label: <NavLink to={path}>{label}</NavLink>,
      }))}
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
