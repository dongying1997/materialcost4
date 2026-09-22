import createPersistedState from '@plq/use-persisted-state'
import storage from '@plq/use-persisted-state/storages/local-storage'

// 创建工厂，命名空间为 'material-cost'
const [usePersistedState] = createPersistedState('material-cost', storage)

export  { usePersistedState }