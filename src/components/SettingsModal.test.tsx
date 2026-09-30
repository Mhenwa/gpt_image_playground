// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsModal from './SettingsModal'
import { useStore } from '../store'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, getAgentImageApiProfile, getAgentTextApiProfile, getGalleryApiProfile, normalizeSettings } from '../lib/apiProfiles'
import { setPresetConfig } from '../lib/presetConfig'
import { copyTextToClipboard } from '../lib/clipboard'

vi.mock('../hooks/useModelCatalog', () => ({
  default: () => ({ models: ['gpt-image-2', 'gpt-image-2.5', 'gpt-5.6-sol', 'gpt-6.1-sol'], loading: false, error: '', refresh: vi.fn() }),
}))
vi.mock('./MarkdownRenderer', () => ({ default: () => null }))
vi.mock('../lib/clipboard', () => ({ copyTextToClipboard: vi.fn(async () => {}), getClipboardFailureMessage: vi.fn() }))

describe('unified API settings', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.mocked(copyTextToClipboard).mockClear()
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 20, y: 100, width: 280, height: 30, top: 100, left: 20, right: 300, bottom: 130, toJSON: () => ({}) })
    setPresetConfig({ customProviders: [], profiles: [] })
    const profile = createDefaultOpenAIProfile({
      id: 'shared', name: 'Shared API', baseUrl: 'https://example.com/v1', apiKey: 'test-only-key',
      usage: {
        gallery: { apiMode: 'images', model: 'gpt-image-2' },
        agent: { mode: 'hybrid', textModel: 'gpt-5.6-sol', imageModel: 'gpt-image-2.5' },
      },
    })
    useStore.setState({
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, profiles: [profile], activeProfileId: profile.id }),
      showSettings: true, settingsTabRequest: 'api', reusedTaskApiProfileId: null,
      tasks: [], agentConversations: [], dismissedPresetProviderIds: [],
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root.render(<SettingsModal />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  const clickTab = (label: string) => {
    const tab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((el) => el.textContent === label)!
    act(() => tab.click())
  }
  const selectModel = (label: string, model: string) => {
    act(() => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click())
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((el) => el.title === model)!
    act(() => option.click())
  }
  const selectProvider = (currentLabel: string, provider: string) => {
    const trigger = [...document.querySelectorAll<HTMLSpanElement>('[role="tabpanel"] span')].find((el) => el.textContent === currentLabel)!.parentElement!
    act(() => trigger.click())
    act(() => document.querySelector<HTMLElement>(`[data-option-value="${provider}"]`)!.click())
  }

  it('shows one API entry with three purpose tabs and only one credentials form', () => {
    expect([...document.querySelectorAll('nav button')].map((el) => el.textContent?.trim())).toEqual(['API 配置', '习惯配置', '数据管理', '关于'])
    expect([...document.querySelectorAll('[role="tab"]')].map((el) => el.textContent)).toEqual(['全局配置', '画廊配置', 'Agent 配置'])
    expect(document.querySelectorAll('input[aria-label="API Key"]')).toHaveLength(1)
    expect(document.querySelector('input[aria-label="API URL"]')).not.toBeNull()
    clickTab('画廊配置')
    expect(document.querySelector('input[aria-label="API Key"]')).toBeNull()
    expect(document.querySelector('button[aria-label="选择画廊生图模型"]')?.textContent).toContain('gpt-image-2')
    expect(document.querySelector('button[aria-label="选择 Agent 对话模型"]')).toBeNull()
  })

  it('changing gallery models does not change either Agent model or credentials', () => {
    clickTab('画廊配置')
    selectModel('选择画廊生图模型', 'gpt-image-2.5')
    const settings = useStore.getState().settings
    expect(getGalleryApiProfile(settings)).toMatchObject({ apiMode: 'images', model: 'gpt-image-2.5', apiKey: 'test-only-key' })
    expect(getAgentTextApiProfile(settings)).toMatchObject({ apiMode: 'responses', model: 'gpt-5.6-sol', apiKey: 'test-only-key' })
    expect(getAgentImageApiProfile(settings)?.model).toBe('gpt-image-2.5')
    expect(settings.profiles).toHaveLength(1)
  })

  it('Agent model selections are independent and reasoning is present even with Images gallery', () => {
    clickTab('Agent 配置')
    expect(document.querySelector('[role="tabpanel"]')?.textContent).toContain('推理强度')
    expect(document.querySelector('button[aria-label="网络搜索"]')).not.toBeNull()
    selectModel('选择 Agent 对话模型', 'gpt-6.1-sol')
    selectModel('选择 Agent 生图模型', 'gpt-image-2')
    const settings = useStore.getState().settings
    expect(settings.agentApiConfigMode).toBe('hybrid')
    expect(getAgentTextApiProfile(settings)?.model).toBe('gpt-6.1-sol')
    expect(getAgentImageApiProfile(settings)).toMatchObject({ apiMode: 'images', model: 'gpt-image-2' })
    expect(getGalleryApiProfile(settings)?.model).toBe('gpt-image-2')
    expect(settings.profiles[0].usage?.agent?.imageModel).toBe('gpt-image-2')
  })

  it('maps legacy Agent settings requests into the API Agent subtab', () => {
    act(() => useStore.setState({ settingsTabRequest: 'agent' }))
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Agent 配置')
    expect(document.querySelector('button[aria-label="选择 Agent 对话模型"]')).not.toBeNull()
    expect([...document.querySelectorAll('nav button')].some((el) => el.textContent?.trim() === 'Agent 配置')).toBe(false)
  })

  it('disabling Agent preserves the gallery and can reopen the same purpose tab', () => {
    clickTab('Agent 配置')
    const modeButton = [...document.querySelectorAll<HTMLSpanElement>('[role="tabpanel"] span')].find((el) => el.textContent === '混合（推荐）')!.parentElement!
    act(() => modeButton.click())
    act(() => document.querySelector<HTMLElement>('[data-option-value="off"]')!.click())
    expect(useStore.getState().settings.agentApiConfigMode).toBe('off')
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="选择 Agent 对话模型"]')!.disabled).toBe(true)
    clickTab('画廊配置')
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="选择画廊生图模型"]')!.disabled).toBe(false)
    expect(getGalleryApiProfile(useStore.getState().settings).apiMode).toBe('images')
    act(() => useStore.setState({ showSettings: false }))
    act(() => useStore.setState({ showSettings: true, settingsTabRequest: 'agent' }))
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="选择 Agent 对话模型"]')!.disabled).toBe(true)
  })

  it('creates a new service with Images gallery and hybrid Agent defaults', () => {
    act(() => document.querySelector<HTMLButtonElement>('button[title="Shared API"]')!.click())
    const add = [...document.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent?.includes('创建新配置'))!
    act(() => add.click())
    const settings = useStore.getState().settings
    const active = settings.profiles.find((profile) => profile.id === settings.activeProfileId)!
    expect(settings.profiles).toHaveLength(2)
    expect(active.usage?.gallery?.apiMode).toBe('images')
    expect(active.usage?.agent?.mode).toBe('hybrid')
    expect(document.querySelector('input[aria-label="API Key"]')).not.toBeNull()
  })

  it('preserves old Responses text and Images model choices when opening the unified settings', () => {
    const image = createDefaultOpenAIProfile({ id: 'old-image', name: 'Old Images', baseUrl: 'https://same.example/v1', apiKey: 'same-test-key', model: 'gpt-image-2' })
    const text = createDefaultOpenAIProfile({ id: 'old-response', name: 'Old Response', baseUrl: 'https://same.example/v1', apiKey: 'same-test-key', apiMode: 'responses', model: 'gpt-5.6-terra', imageGenerationModel: 'gpt-image-2.5' })
    act(() => useStore.setState({ showSettings: false }))
    act(() => useStore.setState({
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, profiles: [image, text], activeProfileId: text.id, agentApiConfigMode: 'hybrid', agentTextProfileId: text.id, agentImageProfileId: image.id }),
      showSettings: true, settingsTabRequest: 'agent',
    }))
    expect(document.querySelector('button[aria-label="选择 Agent 对话模型"]')?.textContent).toContain('gpt-5.6-terra')
    expect(document.querySelector('button[aria-label="选择 Agent 生图模型"]')?.textContent).toContain('gpt-image-2')
    clickTab('画廊配置')
    expect(document.querySelector('button[aria-label="选择画廊生图模型"]')?.textContent).toContain('gpt-image-2.5')
  })

  it('changing and restoring provider types keeps each provider model compatible', () => {
    selectProvider('OpenAI 兼容接口', 'fal')
    clickTab('画廊配置')
    expect(document.querySelector('button[aria-label="选择画廊生图模型"]')?.textContent).toContain('openai/gpt-image')
    clickTab('Agent 配置')
    expect(document.querySelector('button[aria-label="选择 Agent 对话模型"]')).toBeNull()
    expect(document.querySelector('[role="tabpanel"]')?.textContent).toContain('需要支持 Responses API')
    clickTab('全局配置')
    selectProvider('fal.ai', 'openai')
    clickTab('Agent 配置')
    expect(document.querySelector('button[aria-label="选择 Agent 对话模型"]')?.textContent).toContain('gpt-5.6-sol')
    expect(document.querySelector('button[aria-label="选择 Agent 生图模型"]')?.textContent).toContain('gpt-image-2.5')
    clickTab('画廊配置')
    expect(document.querySelector('button[aria-label="选择画廊生图模型"]')?.textContent).toContain('gpt-image-2')
  })

  it('shares the effective gallery model instead of the stale legacy profile fields', async () => {
    clickTab('画廊配置')
    selectModel('选择画廊生图模型', 'gpt-image-2.5')
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="复制导入配置「Shared API」的 URL"]')!.click())
    expect(document.body.textContent).toContain('不包含 Agent 用途配置')
    const includeKey = [...document.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent?.trim() === '包含 API Key')!
    await act(async () => includeKey.click())
    const url = new URL(vi.mocked(copyTextToClipboard).mock.calls[0][0])
    expect(url.searchParams.get('apiMode')).toBe('images')
    expect(url.searchParams.get('model')).toBe('gpt-image-2.5')
    expect(url.searchParams.get('apiKey')).toBe('test-only-key')
  })
})
