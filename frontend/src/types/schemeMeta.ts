/** 已载入/已保存方案在库中的身份。编辑器据此决定「保存」是写回还是新建。 */
export interface SchemeMeta {
  id: number
  name: string
  note: string
}