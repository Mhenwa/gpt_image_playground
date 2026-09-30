import { describe, expect, it } from 'vitest'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, getAgentImageApiProfile, getAgentTextApiProfile, getGalleryApiProfile, normalizeSettings } from './apiProfiles'
import { createRequestSettingsForProfile } from './requestSettings'
import { updateServiceModel } from './serviceModelSelection'

const service = createDefaultOpenAIProfile({
  id: 'shared-service', baseUrl: 'https://example.test/v1', apiKey: 'test-key',
  usage: {
    gallery: { apiMode: 'images', model: 'gallery-original' },
    agent: { mode: 'hybrid', textModel: 'chat-original', imageModel: 'agent-image-original' },
  },
})
const settingsFor = (profile = service) => normalizeSettings({ ...DEFAULT_SETTINGS, profiles: [profile], activeProfileId: profile.id })

describe('purpose-specific model picker updates', () => {
  it('gallery choice does not change Agent choices or shared credentials', () => {
    const updated = updateServiceModel(service, 'gallery', 'gpt-image-2.5')
    const settings = settingsFor(updated)
    expect(getGalleryApiProfile(settings).model).toBe('gpt-image-2.5')
    expect(getAgentTextApiProfile(settings)?.model).toBe('chat-original')
    expect(getAgentImageApiProfile(settings)?.model).toBe('agent-image-original')
    expect(updated.apiKey).toBe(service.apiKey)
    expect(updated.baseUrl).toBe(service.baseUrl)
  })

  it('Agent model choices do not overwrite the gallery model or each other', () => {
    const updated = updateServiceModel(updateServiceModel(service, 'agent-text', 'gpt-6.1-sol'), 'agent-image', 'gpt-image-2')
    const settings = settingsFor(updated)
    expect(getGalleryApiProfile(settings).model).toBe('gallery-original')
    expect(getAgentTextApiProfile(settings)?.model).toBe('gpt-6.1-sol')
    expect(getAgentImageApiProfile(settings)?.model).toBe('gpt-image-2')
    expect(updated.usage?.agent?.mode).toBe('hybrid')
  })

  it('freezes image request views independently of a Responses gallery', () => {
    const settings = settingsFor({ ...service, usage: { ...service.usage, gallery: { apiMode: 'responses', model: 'gallery-tool' } } })
    const image = getAgentImageApiProfile(settings)!
    const frozen = createRequestSettingsForProfile(settings, image)
    expect(frozen.agentApiConfigMode).toBe('hybrid')
    expect(getGalleryApiProfile(frozen)).toMatchObject({ apiMode: 'images', model: 'agent-image-original', apiKey: 'test-key' })
    expect(frozen.profiles.every((profile) => profile.usage === undefined)).toBe(true)
    expect(settings.profiles[0].usage?.gallery?.apiMode).toBe('responses')
  })

  it('freezes Agent text model without applying the gallery model again', () => {
    const settings = settingsFor()
    const frozen = createRequestSettingsForProfile(settings, getAgentTextApiProfile(settings)!)
    expect(frozen.apiMode).toBe('responses')
    expect(frozen.model).toBe('chat-original')
    expect(getAgentTextApiProfile(frozen)?.model).toBe('chat-original')
    expect(settings.profiles[0].usage?.gallery?.model).toBe('gallery-original')
  })

  it('keeps legacy Responses text model intact when selecting a gallery image model', () => {
    const legacy = createDefaultOpenAIProfile({ apiMode: 'responses', model: 'legacy-chat', imageGenerationModel: 'old-image' })
    expect(updateServiceModel(legacy, 'gallery', 'new-image')).toMatchObject({ model: 'legacy-chat', imageGenerationModel: 'new-image' })
  })
})
