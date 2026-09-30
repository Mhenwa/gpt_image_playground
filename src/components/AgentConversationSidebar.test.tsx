// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { useStore } from '../store'
import AgentConversationSidebar from './AgentConversationSidebar'

describe('Agent conversation sidebar', () => {
  let root: Root
  let container: HTMLDivElement
  let onMediaChange: () => void
  let media: MediaQueryList

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    media = {
      matches: false,
      media: '(min-width: 1024px)',
      addEventListener: (_type: string, listener: () => void) => { onMediaChange = listener },
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList
    vi.stubGlobal('matchMedia', () => media)
    const now = Date.now()
    const conversation = (id: string, title: string, updatedAt: number): AgentConversation => ({
      id, title, createdAt: updatedAt, updatedAt, activeRoundId: null, rounds: [],
      messages: [{ id: `${id}-message`, role: 'user', roundId: `${id}-round`, content: id === 'old' ? '松鼠图片' : title, createdAt: updatedAt }],
    })
    useStore.setState({
      appMode: 'agent',
      agentConversations: [conversation('old', '旧对话', now - 10 * 86400000), conversation('recent', '昨日对话', now - 86400000), conversation('active', '当前对话', now)],
      activeAgentConversationId: 'active',
      agentSidebarCollapsed: false,
      agentMobileSidebarOpen: false,
      agentEditingConversationId: null,
      agentEditingRoundId: null,
      agentGeneratingTitleIds: {},
      agentInputDrafts: {},
      prompt: '', inputImages: [], maskDraft: null, maskEditorImageId: null,
      tasks: [], confirmDialog: null, showSettings: false,
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root.render(<AgentConversationSidebar />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    document.body.style.overflow = ''
    window.localStorage.clear()
  })

  const click = (selector: string) => act(() => container.querySelector<HTMLButtonElement>(selector)!.click())
  const type = (selector: string, value: string) => act(() => {
    const input = container.querySelector<HTMLInputElement>(selector)!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

  it('groups recent history, marks the active conversation, and hides the closed mobile panel', () => {
    expect([...container.querySelectorAll('h2')].map((item) => item.textContent)).toEqual(['今天', '最近 7 天', '更早'])
    expect([...container.querySelectorAll('[data-agent-conversation-item]')].map((item) => item.getAttribute('data-agent-conversation-item'))).toEqual(['active', 'recent', 'old'])
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('当前对话')
    expect(container.querySelector('aside')?.classList.contains('hidden')).toBe(true)
    expect(container.querySelector('aside')?.className).not.toContain('translate-x')
  })

  it('creates a blank conversation while preserving the current draft and desktop expansion', () => {
    act(() => useStore.setState({ prompt: '尚未发送的内容', inputImages: [{ id: 'draft-image', dataUrl: 'data:image/png;base64,draft' }] }))
    click('button[aria-label="新对话"]')
    const state = useStore.getState()
    expect(state.activeAgentConversationId).not.toBe('active')
    expect(state.prompt).toBe('')
    expect(state.inputImages).toEqual([])
    expect(state.agentInputDrafts.active.prompt).toBe('尚未发送的内容')
    expect(state.agentInputDrafts.active.inputImages[0].id).toBe('draft-image')
    expect(state.agentSidebarCollapsed).toBe(false)
  })

  it('keeps the drawer above the header but below image detail dialogs', () => {
    // Header 是 40，图片详情主弹窗是 50；桌面侧栏同样必须位于弹窗之下。
    expect(container.querySelector('aside')?.classList.contains('z-[46]')).toBe(true)
    act(() => useStore.getState().setAgentMobileSidebarOpen(true))
    expect(container.querySelector('button[aria-label="关闭对话列表遮罩"]')?.classList.contains('z-[45]')).toBe(true)
  })

  it('selects a conversation, restores its draft and closes only the mobile panel', () => {
    act(() => useStore.setState({
      prompt: '当前草稿', agentMobileSidebarOpen: true,
      agentInputDrafts: { old: { prompt: '之前草稿', inputImages: [], maskDraft: null, maskEditorImageId: null } },
    }))
    click('[data-agent-conversation-item="old"] button[title="旧对话"]')
    expect(useStore.getState().activeAgentConversationId).toBe('old')
    expect(useStore.getState().prompt).toBe('之前草稿')
    expect(useStore.getState().agentInputDrafts.active.prompt).toBe('当前草稿')
    expect(useStore.getState().agentMobileSidebarOpen).toBe(false)
    expect(useStore.getState().agentSidebarCollapsed).toBe(false)
  })

  it('searches both conversation titles and message contents', () => {
    type('input[aria-label="搜索对话"]', '松鼠')
    expect(container.querySelectorAll('[data-agent-conversation-item]')).toHaveLength(1)
    expect(container.querySelector('[data-agent-conversation-item]')?.getAttribute('data-agent-conversation-item')).toBe('old')
    type('input[aria-label="搜索对话"]', '不存在的词')
    expect(container.textContent).toContain('没有找到匹配的对话')
  })

  it('renames through the row menu and cancels rename with Escape without closing the drawer', () => {
    click('button[aria-label="对话操作：当前对话"]')
    act(() => [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '重命名')!.click())
    type('input[aria-label="对话标题"]', '改好的标题')
    act(() => useStore.setState((state) => ({ agentConversations: state.agentConversations.map((item) => ({ ...item, messages: item.messages.map((message) => ({ ...message, content: `${message.content} streaming` })) })) })))
    expect(container.querySelector<HTMLInputElement>('input[aria-label="对话标题"]')?.value).toBe('改好的标题')
    act(() => container.querySelector('input[aria-label="对话标题"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(useStore.getState().agentConversations.find((item) => item.id === 'active')?.title).toBe('改好的标题')
    act(() => useStore.setState({ agentMobileSidebarOpen: true, agentEditingConversationId: 'active' }))
    type('input[aria-label="对话标题"]', '取消的标题')
    act(() => container.querySelector('input[aria-label="对话标题"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(useStore.getState().agentMobileSidebarOpen).toBe(true)
    expect(useStore.getState().agentConversations.find((item) => item.id === 'active')?.title).toBe('改好的标题')
  })

  it('requires the existing confirmation before deleting and closes the mobile panel before confirmation', async () => {
    act(() => useStore.setState({
      agentMobileSidebarOpen: true,
      tasks: [{ id: 'old-image-task', prompt: '图像', params: DEFAULT_PARAMS, inputImageIds: [], outputImages: ['image-one', 'image-two'], status: 'done', error: null, createdAt: Date.now(), finishedAt: Date.now(), elapsed: 1, agentConversationId: 'old' }],
    }))
    click('button[aria-label="对话操作：旧对话"]')
    act(() => [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '删除对话')!.click())
    expect(useStore.getState().agentConversations.some((item) => item.id === 'old')).toBe(true)
    expect(useStore.getState().confirmDialog?.title).toBe('删除对话')
    expect(useStore.getState().confirmDialog?.checkbox?.label).toBe('同时删除对话中生成的图片（2 张）')
    expect(useStore.getState().agentMobileSidebarOpen).toBe(false)
    await act(async () => { await useStore.getState().confirmDialog!.action!(false) })
    expect(useStore.getState().agentConversations.some((item) => item.id === 'old')).toBe(false)
    expect(useStore.getState().tasks[0].outputImages).toEqual(['image-one', 'image-two'])
  })

  it('closes via button, backdrop, Escape and desktop resize, restoring focus and scroll', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    act(() => useStore.getState().setAgentMobileSidebarOpen(true))
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭对话列表')
    click('button[aria-label="关闭对话列表"]')
    expect(useStore.getState().agentMobileSidebarOpen).toBe(false)
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe('')
    act(() => useStore.getState().setAgentMobileSidebarOpen(true))
    click('button[aria-label="关闭对话列表遮罩"]')
    expect(useStore.getState().agentMobileSidebarOpen).toBe(false)
    act(() => useStore.getState().setAgentMobileSidebarOpen(true))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(useStore.getState().agentMobileSidebarOpen).toBe(false)
    act(() => useStore.getState().setAgentMobileSidebarOpen(true))
    Object.defineProperty(media, 'matches', { value: true, configurable: true })
    act(() => onMediaChange())
    expect(useStore.getState().agentMobileSidebarOpen).toBe(false)
    expect(useStore.getState().agentSidebarCollapsed).toBe(false)
    trigger.remove()
  })

  it('collapses only the desktop panel and opens the rail search', () => {
    click('button[aria-label="折叠对话列表"]')
    expect(useStore.getState().agentSidebarCollapsed).toBe(true)
    expect(useStore.getState().agentMobileSidebarOpen).toBe(false)
    click('button[aria-label="搜索对话"]')
    expect(useStore.getState().agentSidebarCollapsed).toBe(false)
    expect(document.activeElement).toBe(container.querySelector('input[aria-label="搜索对话"]'))
  })
})
