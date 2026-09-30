import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS, type ApiProfile, type AppSettings } from '../types'
import { callImageApi } from './api'
import { callAgentConversationTitleApi, callAgentResponsesApi } from './agentApi'
import {
  createDefaultOpenAIProfile,
  DEFAULT_SETTINGS,
  getAgentImageApiProfile,
  getAgentTextApiProfile,
  getGalleryApiProfile,
  normalizeSettings,
} from './apiProfiles'

const TEST_BASE_URL = 'https://unified-api.example/v1'
const TEST_KEY = 'unified-test-key'

function createService(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return createDefaultOpenAIProfile({
    id: 'unified-service',
    name: 'One provider for gallery and Agent',
    baseUrl: TEST_BASE_URL,
    apiKey: TEST_KEY,
    apiProxy: false,
    streamImages: false,
    apiMode: 'images',
    model: 'legacy-image-model',
    imageGenerationModel: 'legacy-tool-model',
    usage: {
      gallery: { apiMode: 'images', model: 'gpt-image-2.5' },
      agent: { mode: 'hybrid', textModel: 'gpt-6.1-sol', imageModel: 'gpt-image-2' },
    },
    ...overrides,
  })
}

function createSettings(profile = createService()): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    profiles: [profile],
    activeProfileId: profile.id,
    // These old top-level values must not override the new per-purpose choices.
    apiMode: 'responses',
    model: 'stale-top-level-model',
    baseUrl: TEST_BASE_URL,
    apiKey: TEST_KEY,
    agentApiConfigMode: 'hybrid',
    agentTextProfileId: profile.id,
    agentImageProfileId: profile.id,
  }
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Mirrors the store's request snapshot: this is a resolved view, not a service config. */
function snapshotSettings(settings: AppSettings, profile: ApiProfile): AppSettings {
  return normalizeSettings({
    ...settings,
    profiles: [profile],
    activeProfileId: profile.id,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    apiMode: profile.apiMode,
    model: profile.model,
    apiProxy: profile.apiProxy,
    streamImages: profile.streamImages,
  })
}

describe('unified service request contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('uses the gallery-selected Images endpoint and model despite stale legacy fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      data: [{ b64_json: 'aW1hZ2U=' }],
    }))

    const result = await callImageApi({
      settings: createSettings(),
      prompt: 'A quiet landscape',
      params: DEFAULT_PARAMS,
      inputImageDataUrls: [],
    })

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(url).toBe(`${TEST_BASE_URL}/images/generations`)
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${TEST_KEY}`)
    expect(body.model).toBe('gpt-image-2.5')
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('tool_choice')
    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
  })

  it('uses the same gallery model for reference-image edits', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(new Blob(['input image'], { type: 'image/png' })))
      .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: 'ZWRpdA==' }] }))

    await callImageApi({
      settings: createSettings(),
      prompt: 'Make the sky blue',
      params: DEFAULT_PARAMS,
      inputImageDataUrls: ['data:image/png;base64,aW1hZ2U='],
    })

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe(`${TEST_BASE_URL}/images/edits`)
    expect(init?.body).toBeInstanceOf(FormData)
    const body = init?.body as FormData
    expect(body.get('model')).toBe('gpt-image-2.5')
    expect(body.has('image[]') || body.has('image')).toBe(true)
  })

  it.each([false, true])('retains the gallery image selection with optional Responses transport (proxy=%s)', async (apiProxy) => {
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', apiProxy ? 'true' : 'false')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      output: [{ type: 'image_generation_call', result: 'aW1hZ2U=' }],
    }))
    const profile = createService({
      apiProxy,
      usage: {
        gallery: { apiMode: 'responses', model: 'gpt-image-2.5' },
        agent: { mode: 'hybrid', textModel: 'gpt-6.1-sol', imageModel: 'gpt-image-2' },
      },
    })

    await callImageApi({
      settings: createSettings(profile),
      prompt: 'A quiet landscape',
      params: DEFAULT_PARAMS,
      inputImageDataUrls: [],
    })

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(url).toBe(apiProxy ? '/api-proxy/responses' : `${TEST_BASE_URL}/responses`)
    // The local New API proxy routes by the top-level image model; direct APIs use a text model.
    expect(body.model).toBe(apiProxy ? 'gpt-image-2.5' : 'gpt-6.1-sol')
    expect(body.tools).toContainEqual(expect.objectContaining({ type: 'image_generation', model: 'gpt-image-2.5' }))
    expect(body.tool_choice).toBe('required')
  })

  it('allows ordinary Agent chat without forcing an image-generation tool', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      id: 'resp_greeting',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '你好，有什么可以帮你？' }] }],
    }))
    const settings = normalizeSettings(createSettings())

    const result = await callAgentResponsesApi({
      settings,
      profile: getAgentTextApiProfile(settings)!,
      imageProfile: getAgentImageApiProfile(settings)!,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: '你好' }] }],
    })

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(url).toBe(`${TEST_BASE_URL}/responses`)
    expect(body.model).toBe('gpt-6.1-sol')
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${TEST_KEY}`)
    expect(body.tool_choice === undefined || body.tool_choice === 'auto').toBe(true)
    expect(body.tools.some((tool: Record<string, unknown>) => tool.type === 'image_generation')).toBe(false)
    expect(body.tools).toContainEqual(expect.objectContaining({ type: 'function', name: 'generate_image' }))
    expect(body.instructions).toContain('Only generate when explicitly requested; otherwise reply with text.')
    expect(result.text).toBe('你好，有什么可以帮你？')
    expect(result.images).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps native Agent conversation model and image-tool model independent', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Ready' }] }],
    }))
    const profile = createService({
      usage: {
        gallery: { apiMode: 'images', model: 'gpt-image-2.5' },
        agent: { mode: 'native', textModel: 'gpt-6.1-sol', imageModel: 'gpt-image-2' },
      },
    })
    // A stale global mode from the old settings must not override this service's native preference.
    const settings = normalizeSettings(createSettings(profile))
    expect(settings.agentApiConfigMode).toBe('native')

    await callAgentResponsesApi({
      settings,
      profile: getAgentTextApiProfile(settings)!,
      imageProfile: getAgentImageApiProfile(settings)!,
      params: DEFAULT_PARAMS,
      input: 'Hello',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.model).toBe('gpt-6.1-sol')
    expect(body.tools).toContainEqual(expect.objectContaining({ type: 'image_generation', model: 'gpt-image-2' }))
    expect(body.tools.some((tool: Record<string, unknown>) => tool.name === 'generate_image')).toBe(false)
    expect(body.tool_choice === undefined || body.tool_choice === 'auto').toBe(true)
  })

  it('executes hybrid image tools through Images even when gallery uses Responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      data: [{ b64_json: 'aHlicmlk' }],
    }))
    const profile = createService({
      apiMode: 'responses',
      model: 'gpt-5.6-sol',
      usage: {
        gallery: { apiMode: 'responses', model: 'gpt-image-2.5' },
        agent: { mode: 'hybrid', textModel: 'gpt-6.1-sol', imageModel: 'gpt-image-2' },
      },
    })
    const settings = normalizeSettings(createSettings(profile))
    const imageProfile = getAgentImageApiProfile(settings)!
    expect(imageProfile.apiMode).toBe('images')
    expect(imageProfile.usage).toBeUndefined()

    await callImageApi({
      settings: snapshotSettings(settings, imageProfile),
      prompt: 'Draw a blue bird',
      params: DEFAULT_PARAMS,
      inputImageDataUrls: [],
    })

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(url).toBe(`${TEST_BASE_URL}/images/generations`)
    expect(body.model).toBe('gpt-image-2')
    expect(body).not.toHaveProperty('tools')
  })

  it('isolates model changes for each use while sharing connection credentials', () => {
    const profile = createService()
    const initial = createSettings(profile)
    const changed = createSettings({
      ...profile,
      usage: {
        gallery: { apiMode: 'images', model: 'gallery-custom-model' },
        agent: { mode: 'hybrid', textModel: 'agent-custom-text', imageModel: 'agent-custom-image' },
      },
    })
    const gallery = getGalleryApiProfile(changed)
    const text = getAgentTextApiProfile(changed)!
    const image = getAgentImageApiProfile(changed)!

    expect(gallery.model).toBe('gallery-custom-model')
    expect(text.model).toBe('agent-custom-text')
    expect(image.model).toBe('agent-custom-image')
    for (const view of [gallery, text, image]) {
      expect(view.baseUrl).toBe(TEST_BASE_URL)
      expect(view.apiKey).toBe(TEST_KEY)
      expect(view.usage).toBeUndefined()
    }
    expect(getGalleryApiProfile(initial).model).toBe('gpt-image-2.5')
  })

  it('defaults a unified service to mixed Agent operation without relying on old global mode', () => {
    const profile = createService({
      usage: {
        gallery: { apiMode: 'images', model: 'gpt-image-2.5' },
        agent: { textModel: 'gpt-6.1-sol', imageModel: 'gpt-image-2' },
      },
    })
    const settings = normalizeSettings({ ...createSettings(profile), agentApiConfigMode: 'off' })
    expect(settings.agentApiConfigMode).toBe('hybrid')
    expect(getAgentTextApiProfile(settings)?.model).toBe('gpt-6.1-sol')
    expect(getAgentImageApiProfile(settings)?.apiMode).toBe('images')
  })

  it('uses the current unified service rather than stale separate Agent profile references', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Current service' }] }],
    }))
    const current = createService()
    const obsolete = createDefaultOpenAIProfile({
      id: 'obsolete-text-service',
      baseUrl: 'https://obsolete.example/v1',
      apiKey: 'obsolete-key',
      apiMode: 'responses',
      model: 'obsolete-text-model',
    })
    const settings = normalizeSettings({
      ...createSettings(current),
      profiles: [current, obsolete],
      agentTextProfileId: obsolete.id,
      agentImageProfileId: obsolete.id,
    })

    await callAgentResponsesApi({
      settings,
      profile: getAgentTextApiProfile(settings)!,
      imageProfile: getAgentImageApiProfile(settings)!,
      params: DEFAULT_PARAMS,
      input: 'hello',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${TEST_BASE_URL}/responses`)
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${TEST_KEY}`)
    expect(JSON.parse(String(init?.body)).model).toBe('gpt-6.1-sol')
  })

  it('generates conversation titles using the Agent text model without image tools', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '<title>问候</title>' }] }],
    }))
    const settings = normalizeSettings(createSettings())

    const title = await callAgentConversationTitleApi({
      settings,
      profile: getAgentTextApiProfile(settings)!,
      prompt: '你好',
    })

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(url).toBe(`${TEST_BASE_URL}/responses`)
    expect(body.model).toBe('gpt-6.1-sol')
    expect(body).not.toHaveProperty('tools')
    expect(title).toBe('问候')
  })
})
