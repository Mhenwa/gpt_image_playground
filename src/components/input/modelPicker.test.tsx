// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModelPicker from './modelPicker'

describe('ModelPicker', () => {
  let root: Root
  let container: HTMLDivElement
  const onChange = vi.fn()
  const refresh = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    onChange.mockReset()
    refresh.mockReset()
    container = document.createElement('div')
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 20, y: 500, width: 180, height: 30, top: 500, left: 20, right: 200, bottom: 530, toJSON: () => ({}) })
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const render = (overrides: Partial<Parameters<typeof ModelPicker>[0]> = {}) => {
    act(() => root.render(<ModelPicker value="gpt-image-2" onChange={onChange} catalog={{ models: ['gpt-image-2', 'gpt-image-4K'], loading: false, error: '', refresh }} disabled={false} {...overrides} />))
  }

  const open = () => act(() => document.querySelector<HTMLButtonElement>('button[aria-label="选择生成模型"]')!.click())

  it('selects an API model and closes the menu without fetching again', () => {
    render()
    open()
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((el) => el.textContent === 'gpt-image-4K')!
    act(() => option.click())
    expect(onChange).toHaveBeenCalledWith('gpt-image-4K')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('retains the current model even if the API does not list it', () => {
    render({ value: 'private-image-alias' })
    open()
    expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain('private-image-alias')
  })

  it('supports searching and manually entering an unlisted model', () => {
    render()
    open()
    const input = document.querySelector<HTMLInputElement>('input[aria-label="搜索或输入模型"]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'custom-image-model')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0)
    const manual = [...document.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent?.startsWith('手动使用：'))!
    act(() => manual.click())
    expect(onChange).toHaveBeenCalledWith('custom-image-model')
  })

  it('refreshes explicitly and displays errors without hiding the current model', () => {
    render({ catalog: { models: [], loading: false, error: '请先在设置中填写 API Key，再获取模型列表', refresh } })
    open()
    expect(document.querySelector('[role="status"]')?.textContent).toContain('API Key')
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1)
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="刷新模型列表"]')!.click())
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('honors preset locks and closes on Escape', () => {
    render({ disabled: true })
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="选择生成模型"]')!.disabled).toBe(true)
    render()
    open()
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })
})
