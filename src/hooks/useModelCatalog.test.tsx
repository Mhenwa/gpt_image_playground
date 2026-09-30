/* @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiProfile } from '../types'
import { fetchModelCatalog } from '../lib/modelCatalog'
import useModelCatalog from './useModelCatalog'

vi.mock('../lib/modelCatalog', () => ({
  fetchModelCatalog: vi.fn(),
}))

const mockedFetchModelCatalog = vi.mocked(fetchModelCatalog)

function createProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'profile-a',
    name: '测试配置',
    provider: 'openai',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'key-a',
    model: 'gpt-image-2',
    timeout: 120,
    apiMode: 'images',
    codexCli: false,
    apiProxy: false,
    transparentBackgroundMethod: 'api',
    ...overrides,
  }
}

function Harness({ profile }: { profile: ApiProfile }) {
  const catalog = useModelCatalog(profile)

  return (
    <div>
      <output data-testid="models">{catalog.models.join(',')}</output>
      <output data-testid="loading">{String(catalog.loading)}</output>
      <output data-testid="error">{catalog.error}</output>
      <button type="button" onClick={catalog.refresh}>refresh</button>
    </div>
  )
}

function renderHarness(profile: ApiProfile) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<Harness profile={profile} />)
  })

  return {
    container,
    root,
    rerender: (nextProfile: ApiProfile) => act(() => {
      root.render(<Harness profile={nextProfile} />)
    }),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('__DEV_PROXY_CONFIG__', {
    enabled: true,
    prefix: '/api-proxy',
    target: 'https://proxy.example.com/v1',
    changeOrigin: true,
    secure: true,
  })
  vi.useFakeTimers()
  mockedFetchModelCatalog.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('useModelCatalog', () => {
  it('does not make a network request without an API key', async () => {
    const view = renderHarness(createProfile({ apiKey: '   ' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(mockedFetchModelCatalog).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-testid="error"]')?.textContent).toContain('请先在设置中填写 API Key')
    view.root.unmount()
  })

  it('debounces key, address, and proxy changes, aborts old requests, and ignores stale results', async () => {
    const requests: Array<{ profile: ApiProfile; signal?: AbortSignal; deferred: ReturnType<typeof deferred<string[]>> }> = []
    mockedFetchModelCatalog.mockImplementation((profile, signal) => {
      const pending = deferred<string[]>()
      requests.push({ profile, signal, deferred: pending })
      return pending.promise
    })

    const view = renderHarness(createProfile())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399)
    })
    expect(mockedFetchModelCatalog).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(requests).toHaveLength(1)

    view.rerender(createProfile({ apiKey: 'key-b' }))
    expect(requests[0].signal?.aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399)
    })
    expect(requests).toHaveLength(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(requests).toHaveLength(2)

    view.rerender(createProfile({ apiKey: 'key-b', baseUrl: 'https://new.example.com/v1' }))
    expect(requests[1].signal?.aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(requests).toHaveLength(3)

    view.rerender(createProfile({
      apiKey: 'key-b',
      baseUrl: 'https://new.example.com/v1',
      apiProxy: true,
    }))
    expect(requests[2].signal?.aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(requests).toHaveLength(4)

    await act(async () => {
      requests[0].deferred.resolve(['stale-key'])
      requests[1].deferred.resolve(['stale-address'])
      requests[2].deferred.resolve(['stale-proxy'])
      requests[3].deferred.resolve(['fresh-model'])
      await Promise.resolve()
    })

    expect(view.container.querySelector('[data-testid="models"]')?.textContent).toBe('fresh-model')
    expect(requests.map(({ profile }) => [profile.apiKey, profile.baseUrl, profile.apiProxy])).toEqual([
      ['key-a', 'https://api.example.com/v1', false],
      ['key-b', 'https://api.example.com/v1', false],
      ['key-b', 'https://new.example.com/v1', false],
      ['key-b', 'https://new.example.com/v1', true],
    ])
    view.root.unmount()
  })

  it('does not refetch when only the selected model changes', async () => {
    const pending = deferred<string[]>()
    mockedFetchModelCatalog.mockReturnValue(pending.promise)
    const view = renderHarness(createProfile())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(mockedFetchModelCatalog).toHaveBeenCalledTimes(1)

    view.rerender(createProfile({ model: 'another-image-model' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(mockedFetchModelCatalog).toHaveBeenCalledTimes(1)
    pending.resolve(['gpt-image-2', 'another-image-model'])
    await act(async () => {
      await Promise.resolve()
    })
    expect(view.container.querySelector('[data-testid="models"]')?.textContent).toBe('gpt-image-2,another-image-model')
    view.root.unmount()
  })

  it('refreshes the catalog on demand', async () => {
    mockedFetchModelCatalog
      .mockResolvedValueOnce(['first-model'])
      .mockResolvedValueOnce(['second-model'])
    const view = renderHarness(createProfile())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
      await Promise.resolve()
    })
    expect(mockedFetchModelCatalog).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('[data-testid="models"]')?.textContent).toBe('first-model')

    await act(async () => {
      view.container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await vi.advanceTimersByTimeAsync(399)
    })
    expect(mockedFetchModelCatalog).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await Promise.resolve()
    })
    expect(mockedFetchModelCatalog).toHaveBeenCalledTimes(2)
    expect(view.container.querySelector('[data-testid="models"]')?.textContent).toBe('second-model')
    view.root.unmount()
  })

  it('shows the timeout message after 20 seconds', async () => {
    mockedFetchModelCatalog.mockImplementation((_profile, signal) => new Promise<string[]>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    const view = renderHarness(createProfile())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
      await vi.advanceTimersByTimeAsync(19_999)
    })
    expect(view.container.querySelector('[data-testid="error"]')?.textContent).toBe('')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(view.container.querySelector('[data-testid="error"]')?.textContent).toBe('获取模型列表超时，请刷新重试或手动输入')
    expect(view.container.querySelector('[data-testid="loading"]')?.textContent).toBe('false')
    view.root.unmount()
  })
})
