import { describe, expect, it } from 'vitest'
import {
  createDefaultOpenAIProfile,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_SETTINGS,
  getAgentImageApiProfile,
  getAgentTextApiProfile,
  getGalleryApiProfile,
  mergePresetImportedSettings,
  migrateSettingsToServiceConfig,
  normalizeSettings,
  normalizeApiProfile,
  switchApiProfileProvider,
  DEFAULT_FAL_MODEL,
} from './apiProfiles'

function service() {
  return createDefaultOpenAIProfile({
    id: 'shared', name: 'Shared service', baseUrl: 'https://api.example.test/v1', apiKey: 'shared-secret',
    model: 'legacy-image', apiMode: 'images',
    usage: {
      gallery: { apiMode: 'images', model: 'gallery-image' },
      agent: { mode: 'hybrid', textModel: 'chat-model', imageModel: 'agent-image' },
    },
  })
}

describe('service profile request views', () => {
  it('isolates provider usage drafts and restores OpenAI model, protocol and Agent choices after switching back', () => {
    const openai = service()
    openai.usage!.gallery!.apiMode = 'responses'
    openai.usage!.agent!.mode = 'native'
    const fal = switchApiProfileProvider(openai, 'fal')
    expect(fal.usage).toBeUndefined()
    expect(getGalleryApiProfile({ profiles: [fal] })).toMatchObject({ provider: 'fal', apiMode: 'images', model: DEFAULT_FAL_MODEL })
    const restoredFal = normalizeApiProfile(fal)
    const restored = switchApiProfileProvider(restoredFal, 'openai')
    expect(restored.usage).toEqual(openai.usage)
    expect(getGalleryApiProfile({ profiles: [restored] })).toMatchObject({ apiMode: 'responses', model: 'chat-model', imageGenerationModel: 'gallery-image' })
    expect(getAgentTextApiProfile({ profiles: [restored] })).toMatchObject({ model: 'chat-model', imageGenerationModel: 'agent-image' })
    expect(normalizeSettings({ profiles: [restored] }).agentApiConfigMode).toBe('native')
  })

  it('ignores contaminated OpenAI usage on non-OpenAI restored profiles', () => {
    const contaminated = { ...service(), provider: 'fal', model: 'fal-model' }
    const normalized = normalizeSettings({ profiles: [contaminated] })
    expect(normalized.profiles[0].usage).toBeUndefined()
    expect(normalized.model).toBe('fal-model')
    expect(getGalleryApiProfile(normalized).model).toBe('fal-model')
  })

  it('uses one shared connection and independent model choices despite stale legacy mirrors/references', () => {
    const settings = normalizeSettings({
      profiles: [service(), createDefaultOpenAIProfile({ id: 'other', apiMode: 'responses', apiKey: 'other-secret' })],
      activeProfileId: 'shared', agentApiConfigMode: 'native', agentTextProfileId: 'other', agentImageProfileId: 'other',
      apiKey: 'stale-secret', model: 'stale-model', apiMode: 'responses',
    })
    expect(settings).toMatchObject({ agentApiConfigMode: 'hybrid', agentTextProfileId: 'shared', agentImageProfileId: 'shared' })
    const gallery = getGalleryApiProfile(settings)
    const text = getAgentTextApiProfile(settings)
    const image = getAgentImageApiProfile(settings)
    expect(gallery).toMatchObject({ apiKey: 'shared-secret', apiMode: 'images', model: 'gallery-image' })
    expect(text).toMatchObject({ apiKey: 'shared-secret', apiMode: 'responses', model: 'chat-model', imageGenerationModel: 'agent-image' })
    expect(image).toMatchObject({ apiKey: 'shared-secret', apiMode: 'images', model: 'agent-image' })
    expect(gallery.usage).toBeUndefined()
    expect(text?.usage).toBeUndefined()
    expect(image?.usage).toBeUndefined()
  })

  it('distinguishes a Responses text model from the gallery tool model and always uses Images for hybrid', () => {
    const profile = service()
    profile.usage!.gallery!.apiMode = 'responses'
    const settings = normalizeSettings({ profiles: [profile] })
    expect(settings).toMatchObject({ apiMode: 'responses', model: 'chat-model' })
    expect(getGalleryApiProfile(settings)).toMatchObject({ apiMode: 'responses', model: 'chat-model', imageGenerationModel: 'gallery-image' })
    expect(getAgentImageApiProfile(settings)).toMatchObject({ apiMode: 'images', model: 'agent-image' })
  })

  it('uses the configured Agent image model for native mode and respects explicit off', () => {
    const profile = service()
    profile.usage!.agent!.mode = 'native'
    const native = normalizeSettings({ profiles: [profile], agentApiConfigMode: 'hybrid' })
    expect(native.agentApiConfigMode).toBe('native')
    expect(getAgentImageApiProfile(native)).toMatchObject({ apiMode: 'responses', model: 'chat-model', imageGenerationModel: 'agent-image' })
    profile.usage!.agent!.mode = 'off'
    const off = normalizeSettings({ profiles: [profile] })
    expect(getAgentTextApiProfile(off)).toBeNull()
    expect(getAgentImageApiProfile(off)).toBeNull()
  })
})

describe('explicit service configuration migration', () => {
  it('preserves identities, credentials and legacy text/tool models and is idempotent', () => {
    const image = createDefaultOpenAIProfile({ id: 'images', name: 'Images', baseUrl: 'https://api.example.test/v1', apiKey: 'user-secret', model: 'my-image' })
    const text = createDefaultOpenAIProfile({ id: 'text', name: 'Responses', baseUrl: image.baseUrl, apiKey: image.apiKey, apiMode: 'responses', model: 'my-chat', imageGenerationModel: 'my-tool' })
    const old = normalizeSettings({ profiles: [image, text], activeProfileId: 'text', agentApiConfigMode: 'hybrid', agentTextProfileId: 'text', agentImageProfileId: 'images' })
    const migrated = migrateSettingsToServiceConfig(old)
    expect(migrated.profiles.map((p) => [p.id, p.apiKey])).toEqual([['images', 'user-secret'], ['text', 'user-secret']])
    expect(migrated.profiles[1].usage).toEqual({
      gallery: { apiMode: 'images', model: 'my-tool' },
      agent: { mode: 'hybrid', textModel: 'my-chat', imageModel: 'my-image' },
    })
    expect(getGalleryApiProfile(migrated)).toMatchObject({ apiMode: 'images', model: 'my-tool', imageGenerationModel: 'my-tool' })
    expect(migrateSettingsToServiceConfig(migrated)).toEqual(migrated)
  })

  it('defaults former off to mixed without overwriting an existing service preference', () => {
    const old = normalizeSettings({ profiles: [createDefaultOpenAIProfile({ model: 'user-image' })], agentApiConfigMode: 'off' })
    const migrated = migrateSettingsToServiceConfig(old)
    expect(migrated.agentApiConfigMode).toBe('hybrid')
    expect(migrated.profiles[0].usage?.gallery?.model).toBe('user-image')
    const configured = service()
    configured.usage!.agent!.mode = 'native'
    expect(migrateSettingsToServiceConfig({ profiles: [configured] }).profiles[0].usage).toEqual(configured.usage)
  })

  it('keeps cross-service Agent credentials and references on the legacy route', () => {
    const active = createDefaultOpenAIProfile({ id: 'images', baseUrl: 'https://images.example.test/v1', apiKey: 'image-secret', model: 'legacy-image' })
    const text = createDefaultOpenAIProfile({ id: 'chat', baseUrl: 'https://chat.example.test/v1', apiKey: 'chat-secret', apiMode: 'responses', model: 'legacy-chat' })
    const migrated = migrateSettingsToServiceConfig({ profiles: [active, text], activeProfileId: 'images', agentApiConfigMode: 'hybrid', agentTextProfileId: 'chat', agentImageProfileId: 'images' })
    expect(migrated.profiles[0].usage).toBeUndefined()
    expect(migrated.agentTextProfileId).toBe('chat')
    expect(getAgentTextApiProfile(migrated)).toMatchObject({ apiKey: 'chat-secret', model: 'legacy-chat' })
    expect(getAgentImageApiProfile(migrated)).toMatchObject({ apiKey: 'image-secret', model: 'legacy-image' })
  })

  it('retains native mode and does not use its text model as the gallery image model', () => {
    const old = createDefaultOpenAIProfile({ apiMode: 'responses', model: 'user-chat', imageGenerationModel: 'user-tool' })
    const migrated = migrateSettingsToServiceConfig({ profiles: [old], agentApiConfigMode: 'native' })
    expect(migrated.profiles[0].usage).toEqual({ gallery: { apiMode: 'images', model: 'user-tool' }, agent: { mode: 'native', textModel: 'user-chat', imageModel: 'user-tool' } })
    expect(migrateSettingsToServiceConfig({ profiles: [{ ...old, imageGenerationModel: '' }] }).profiles[0].usage?.gallery?.model).toBe(DEFAULT_IMAGES_MODEL)
  })

  it('retains the native text profile tool model instead of the unused legacy image reference', () => {
    const image = createDefaultOpenAIProfile({ id: 'image', apiKey: 'same-key', model: 'gallery-image' })
    const text = createDefaultOpenAIProfile({ id: 'text', apiKey: 'same-key', apiMode: 'responses', model: 'native-chat', imageGenerationModel: 'native-tool' })
    const migrated = migrateSettingsToServiceConfig({ profiles: [image, text], activeProfileId: 'image', agentApiConfigMode: 'native', agentTextProfileId: 'text', agentImageProfileId: 'image' })
    expect(migrated.profiles[0].usage).toEqual({ gallery: { apiMode: 'images', model: 'gallery-image' }, agent: { mode: 'native', textModel: 'native-chat', imageModel: 'native-tool' } })
  })
})

describe('service preferences in refreshed presets', () => {
  it('retains model choices made before service usage existed', () => {
    const initial = mergePresetImportedSettings(DEFAULT_SETTINGS, { profiles: [{ ...service(), usage: undefined, isDefault: true }] })
    const local = normalizeSettings({ ...initial.settings, profiles: initial.settings.profiles.map((p) => ({ ...p, model: 'user-legacy-image', apiKey: 'local-secret' })) })
    const refreshed = mergePresetImportedSettings(local, { profiles: [{ ...service(), isDefault: true }] }, { previousPresetConfig: initial.presetConfig })
    expect(refreshed.settings.profiles[0].usage).toMatchObject({ gallery: { model: 'user-legacy-image' }, agent: { imageModel: 'user-legacy-image' } })
    expect(getGalleryApiProfile(refreshed.settings).model).toBe('user-legacy-image')
  })

  it('imports usage for existing legacy presets while retaining local credentials', () => {
    const initial = mergePresetImportedSettings(DEFAULT_SETTINGS, { profiles: [{ ...service(), usage: undefined, isDefault: true }] })
    const local = normalizeSettings({ ...initial.settings, profiles: initial.settings.profiles.map((p) => ({ ...p, apiKey: 'local-secret' })) })
    const refreshed = mergePresetImportedSettings(local, { profiles: [{ ...service(), isDefault: true }] }, { previousPresetConfig: initial.presetConfig })
    expect(refreshed.settings.profiles[0]).toMatchObject({ apiKey: 'local-secret', usage: service().usage })
  })

  it('refreshes untouched usage leaves but preserves user-selected models', () => {
    const initial = mergePresetImportedSettings(DEFAULT_SETTINGS, { profiles: [{ ...service(), isDefault: true }] })
    const local = normalizeSettings({ ...initial.settings, profiles: initial.settings.profiles.map((p) => ({ ...p, usage: { ...p.usage, gallery: { ...p.usage?.gallery, model: 'user-image' } } })) })
    const updated = service()
    updated.usage!.gallery!.model = 'updated-image'
    updated.usage!.agent!.textModel = 'updated-chat'
    const refreshed = mergePresetImportedSettings(local, { profiles: [{ ...updated, isDefault: true }] }, { previousPresetConfig: initial.presetConfig })
    expect(refreshed.settings.profiles[0].usage).toMatchObject({ gallery: { model: 'user-image' }, agent: { textModel: 'updated-chat' } })
  })
})
