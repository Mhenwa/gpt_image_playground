interface PromptKeyEvent {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  repeat?: boolean
  isComposing?: boolean
  keyCode?: number
}

/** 两种输入模式统一使用，旧备份中的偏好设置不再改变快捷键。 */
export function getPromptEnterAction(event: PromptKeyEvent, composing = false): 'composition' | 'newline' | 'submit' | 'ignore' | null {
  if (event.key !== 'Enter') return null
  if (event.isComposing || composing || event.keyCode === 229) return 'composition'
  if (event.shiftKey) return 'newline'
  // 长按 Enter 不能连续提交多个计费请求。
  if (event.repeat || event.altKey) return 'ignore'
  return 'submit'
}
