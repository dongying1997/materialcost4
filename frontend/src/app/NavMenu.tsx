// 顶部导航菜单：三个页面各一个入口，按路径段匹配选中项。
import { NavLink, useLocation } from 'react-router-dom'
import { Menu } from 'antd'
import { DatabaseOutlined, CalculatorOutlined, SaveOutlined } from '@ant-design/icons'

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
export default NavMenu
