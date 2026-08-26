import { Alert } from 'antd'
import type { MultiStepResult } from '../types'
import { allWarningsOf, allBlockingMsgs } from '../utils/reaction'

/** 计算结果的警告 / 阻塞错误提示条 */
function CalcAlerts({ result }: { result: MultiStepResult | null }) {
  const hasBlocking = (result?.steps || []).some(s => s && (s.blockingErrors || []).length > 0)
  const warnings = allWarningsOf(result)

  if (hasBlocking) {
    return (
      <Alert type="error" showIcon style={{ marginBottom: 12 }}
        message="存在阻塞性错误，请修正后再计算"
        description={allBlockingMsgs(result)} />
    )
  }
  if (warnings.length > 0) {
    return (
      <Alert type="warning" showIcon style={{ marginBottom: 12 }}
        message={`${warnings.length} 条非阻塞警告`}
        description={warnings.join('；')} />
    )
  }
  return null
}

export default CalcAlerts
