// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Header from './Header'
import { useStore } from '../store'

vi.mock('../hooks/useVersionCheck', () => ({ useVersionCheck: () => ({ hasUpdate: false, latestRelease: null, dismiss: vi.fn() }) }))
vi.mock('../hooks/useTooltip', () => ({ useTooltip: () => ({ visible: false, handlers: {} }) }))
vi.mock('./FavoriteCollections', () => ({ useFavoriteCollectionTitle: () => '' }))
vi.mock('./HelpModal', () => ({ default: () => null }))
vi.mock('./ViewportTooltip', () => ({ default: () => null }))

describe('Agent sidebar header', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    useStore.setState({
      appMode: 'agent', agentMobileSidebarOpen: false, agentSidebarCollapsed: false,
      activeAgentConversationId: 'chat',
      agentConversations: [{ id: 'chat', title: '设计讨论', createdAt: 1, updatedAt: 1, activeRoundId: null, rounds: [], messages: [] }],
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root.render(<Header />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('shows the current title in a permanent single header without duplicated conversation controls', () => {
    expect(container.querySelector('header')?.classList.contains('agent-header')).toBe(true)
    expect(container.querySelector('header')?.className).not.toContain('translate-y')
    expect(container.querySelector('h1')?.textContent).toBe('设计讨论')
    expect(container.querySelector('button[aria-label="新对话"]')).toBeNull()
    expect(container.textContent).not.toContain('下拉展示顶栏')
    expect(container.textContent).not.toContain('历史任务')
    expect([...container.querySelectorAll('button')].filter((button) => button.textContent === '画廊')).toHaveLength(1)
  })

  it('opens only the mobile drawer and reflects its expanded state', () => {
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="打开对话侧边栏"]')!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    act(() => button.click())
    expect(useStore.getState().agentMobileSidebarOpen).toBe(true)
    expect(useStore.getState().agentSidebarCollapsed).toBe(false)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-controls')).toBe('agent-conversation-sidebar')
  })

  it('keeps the gallery brand and original mobile mode row outside Agent', () => {
    act(() => useStore.setState({ appMode: 'gallery' }))
    expect(container.querySelector('header')?.classList.contains('agent-header')).toBe(false)
    expect(container.querySelector('h1')?.textContent).toBe('GPT Image Playground')
    expect(container.querySelector('button[aria-label="打开对话侧边栏"]')).toBeNull()
    expect([...container.querySelectorAll('button')].filter((button) => button.textContent === '画廊')).toHaveLength(2)
  })
})
