import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultOpenAIProfile } from './apiProfiles'
import { readClientDevProxyConfig } from './devProxy'
import { fetchModelCatalog } from './modelCatalog'

vi.mock('./devProxy', async (importOriginal) => {
  const original = await importOriginal<typeof import('./devProxy')>()
  return { ...original, readClientDevProxyConfig: vi.fn(() => null) }
})

describe('fetchModelCatalog', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'false')
    vi.stubEnv('VITE_API_PROXY_LOCKED', 'false')
    vi.mocked(readClientDevProxyConfig).mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('fetches the same-origin model endpoint with a trimmed Bearer Key and no browser cache', async () => {
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'true')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'gpt-image-2' }] })))
    const controller = new AbortController()

    expect(await fetchModelCatalog(createDefaultOpenAIProfile({
      baseUrl: 'https://api.example.com/v1', apiKey: ' test-key ', apiProxy: true,
    }), controller.signal)).toEqual(['gpt-image-2'])
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api-proxy/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-key', Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
  })

  it('uses the configured development proxy prefix', async () => {
    vi.mocked(readClientDevProxyConfig).mockReturnValue({
      enabled: true, prefix: '/custom-proxy', target: 'https://api.example.com/v1', changeOrigin: true, secure: true,
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'))

    await fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key', apiProxy: true }))
    expect(fetchMock.mock.calls[0][0]).toBe('/custom-proxy/models')
  })

  it('honors a locked deployment proxy even when the profile disables it', async () => {
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'true')
    vi.stubEnv('VITE_API_PROXY_LOCKED', 'true')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'))

    await fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key', apiProxy: false }))
    expect(fetchMock.mock.calls[0][0]).toBe('/api-proxy/models')
  })

  it.each([
    ['https://api.example.com', 'https://api.example.com/v1/models'],
    ['https://api.example.com/v1', 'https://api.example.com/v1/models'],
    ['https://api.example.com/v1/', 'https://api.example.com/v1/models'],
    ['https://api.example.com/custom/v1', 'https://api.example.com/custom/v1/models'],
    ['api.example.com/custom/', 'https://api.example.com/custom/models'],
  ])('uses existing direct endpoint joining for %s', async (baseUrl, endpoint) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'))

    await fetchModelCatalog(createDefaultOpenAIProfile({ baseUrl, apiKey: 'test-key', apiProxy: false }))
    expect(fetchMock.mock.calls[0][0]).toBe(endpoint)
  })

  it('falls back to direct URL when a requested proxy is unavailable', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'))

    await fetchModelCatalog(createDefaultOpenAIProfile({ baseUrl: 'https://api.example.com/v1', apiKey: 'test-key', apiProxy: true }))
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/v1/models')
  })

  it('normalizes all model IDs without filtering out non-image models', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: ' gpt-image-2 ' }, { id: 'claude-opus-4-6' }, { id: 'gpt-image-2' },
      { id: ' ' }, { id: 3 }, {}, null, 1, ' text-model ', { id: 'Text-model' },
    ] })))

    const expected = ['gpt-image-2', 'claude-opus-4-6', 'text-model', 'Text-model'].sort((a, b) => a.localeCompare(b))
    expect(await fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).toEqual(expected)
  })

  it.each([
    [[{ id: 'one' }, 'two']],
    [{ models: [{ id: 'one' }, 'two'] }],
    [{ data: [{ id: 'one' }, 'two'] }],
  ])('accepts supported model directory shapes', async (payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)))
    expect(await fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).toEqual(['one', 'two'])
  })

  it.each([[], { data: [] }, { models: [] }, { data: [null, {}, { id: '' }, { id: 2 }] }])('returns an empty directory instead of inventing a default', async (payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)))
    expect(await fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).toEqual([])
  })

  it('rejects a missing Key before making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: ' ' }))).rejects.toThrow('请先填写 API Key')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a missing direct API address before making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ baseUrl: ' ', apiKey: 'test-key', apiProxy: false }))).rejects.toThrow('请先填写 API 地址')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'API Key 无效或没有获取模型的权限'],
    [403, 'API Key 无效或没有获取模型的权限'],
    [429, '请求过于频繁'],
    [500, '模型服务暂时异常（HTTP 500）'],
    [502, '模型服务暂时异常（HTTP 502）'],
    [404, '模型接口不存在（HTTP 404）'],
    [400, '获取模型失败（HTTP 400）'],
  ])('reports a safe error for HTTP %s without reading the error body', async (status, message) => {
    const response = new Response(JSON.stringify({ error: { message: 'secret-upstream-credential' } }), { status })
    const jsonMock = vi.spyOn(response, 'json')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)

    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).rejects.toThrow(message)
    expect(jsonMock).not.toHaveBeenCalled()
  })

  it('hides successful-HTTP error JSON rather than exposing its contents', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'secret-upstream-credential' } })))

    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).rejects.toThrow(/^模型接口返回错误，请检查 API Key、地址或模型权限。$/)
  })

  it('handles a failure flag even if the response includes data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: false, data: [], message: 'secret-upstream-credential' })))
    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).rejects.toThrow('模型接口返回错误')
  })

  it('reports non-JSON replies without exposing the body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>secret-upstream-credential</html>'))
    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).rejects.toThrow(/^模型接口返回的不是有效 JSON，请检查 API 地址。$/)
  })

  it.each([null, 'unexpected', {}, { data: {} }, { models: 'secret-upstream-credential' }])('rejects a malformed directory', async (payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)))
    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).rejects.toThrow('模型接口返回格式异常')
  })

  it('reports network or CORS failures without exposing the original error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('secret-upstream-credential'))
    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).rejects.toThrow(/^无法连接模型接口，请检查网络、API 地址或跨域设置。$/)
  })

  it('rejects an already-aborted signal without making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const controller = new AbortController()
    controller.abort('secret-upstream-credential')

    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves cancellation when an in-flight request is aborted', async () => {
    const controller = new AbortController()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      controller.abort()
      expect(init?.signal).toBe(controller.signal)
      throw new DOMException('secret-upstream-credential', 'AbortError')
    })

    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }), controller.signal)).rejects.toMatchObject({ name: 'AbortError', message: '获取模型已取消' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('recognizes an AbortError without relying on an Error prototype', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue({ name: 'AbortError', message: 'secret-upstream-credential' })
    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }))).rejects.toMatchObject({ name: 'AbortError', message: '获取模型已取消' })
  })

  it('does not return an HTTP error from a superseded request', async () => {
    const controller = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      controller.abort()
      return new Response('secret-upstream-credential', { status: 401 })
    })
    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }), controller.signal)).rejects.toMatchObject({ name: 'AbortError', message: '获取模型已取消' })
  })

  it('preserves cancellation while the JSON body is being read', async () => {
    const response = new Response()
    const controller = new AbortController()
    vi.spyOn(response, 'json').mockImplementation(async () => {
      controller.abort()
      throw new DOMException('secret-upstream-credential', 'AbortError')
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)

    await expect(fetchModelCatalog(createDefaultOpenAIProfile({ apiKey: 'test-key' }), controller.signal)).rejects.toMatchObject({ name: 'AbortError', message: '获取模型已取消' })
  })
})
