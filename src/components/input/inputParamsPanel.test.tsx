// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../../types'
import { createDefaultOpenAIProfile } from '../../lib/apiProfiles'
import InputParamsPanel from './inputParamsPanel'

describe('simplified image input parameters', () => {
  let root: Root
  let container: HTMLDivElement
  const hint = { visible: false, show: vi.fn(), hide: vi.fn(), clearTimer: vi.fn(), startTouch: vi.fn() }
  const catalog = { models: ['gpt-image-2'], loading: false, error: '', refresh: vi.fn() }
  const props: ComponentProps<typeof InputParamsPanel> = {
    cols: 'grid-cols-3', params: DEFAULT_PARAMS, setParams: vi.fn(),
    activeProfile: createDefaultOpenAIProfile(), modelValue: 'gpt-image-2',
    modelCatalog: catalog, onModelChange: vi.fn(), modelLocked: false,
    agentTextModelValue: 'gpt-5.6-sol', agentImageModelValue: 'gpt-image-2',
    agentTextModelCatalog: catalog, agentImageModelCatalog: catalog,
    isFalProvider: false, isFalTextToImage: false, displaySize: 'auto',
    qualityOptions: [{ label: 'auto', value: 'auto' }], selectClass: '',
    transparentOutputAvailable: true, showTransparentOutputControl: true,
    transparentOutputEnabled: false, transparentOutputHint: hint,
    onTransparentOutputMenuOpenChange: vi.fn(), compressionHint: hint,
    compressionDisabled: false, outputCompressionInput: '25',
    setOutputCompressionInput: vi.fn(), commitOutputCompression: vi.fn(),
    agentAutoImageCount: false, outputImageLimit: 10, nInput: '1',
    setNInputFocused: vi.fn(), commitN: vi.fn(), handleNInputChange: vi.fn(),
    handleNLimitIncreaseAttempt: vi.fn(), showAgentNHint: vi.fn(), hideNLimitHint: vi.fn(),
    startAgentNHintTouch: vi.fn(), clearAgentNHintTouchTimer: vi.fn(),
    nLimitHint: hint, nLimitHintText: '', streamConcurrentByN: false,
    streamConcurrentHint: hint, sizeHint: hint, qualityHint: hint, onOpenSizePicker: vi.fn(),
  }

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const render = (overrides: Partial<ComponentProps<typeof InputParamsPanel>> = {}) => {
    act(() => root.render(<InputParamsPanel {...props} {...overrides} />))
  }

  it('hides gallery moderation while preserving the other PNG controls', () => {
    render()
    expect(container.textContent).not.toContain('审核')
    expect(container.textContent).toContain('透明背景')
    expect(container.querySelector('button[aria-label="选择生成模型"]')).not.toBeNull()
    expect(container.querySelectorAll('label')).toHaveLength(5)
  })

  it('keeps gallery JPEG compression editable', () => {
    render({ params: { ...DEFAULT_PARAMS, output_format: 'jpeg', output_compression: 25 }, showTransparentOutputControl: false })
    expect(container.textContent).not.toContain('审核')
    expect(container.textContent).toContain('压缩率')
    expect(container.querySelector<HTMLInputElement>('input[placeholder="0-100"]')?.disabled).toBe(false)
  })

  it.each(['png', 'jpeg', 'webp'] as const)('hides Agent moderation and compression for %s without hiding its two model selectors', (output_format) => {
    render({
      agentMode: true, agentAutoImageCount: true, nInput: 'auto',
      params: { ...DEFAULT_PARAMS, output_format, output_compression: 25, moderation: 'low' },
      transparentOutputAvailable: false, showTransparentOutputControl: false,
    })
    expect(container.textContent).not.toContain('审核')
    expect(container.textContent).not.toContain('压缩率')
    expect(container.querySelector('input[placeholder="0-100"]')).toBeNull()
    expect(container.querySelector('button[aria-label="选择对话模型"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="选择生图模型"]')).not.toBeNull()
    expect(container.querySelectorAll('label')).toHaveLength(4)
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('auto')
  })
})
