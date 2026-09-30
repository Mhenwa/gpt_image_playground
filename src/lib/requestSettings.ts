import type { ApiProfile, AppSettings } from '../types'
import { normalizeSettings } from './apiProfiles'

/**
 * Freeze an already resolved gallery/Agent view for one request. Purpose-level
 * settings must not be reapplied when API helpers normalize this snapshot.
 * Stored service profiles are left untouched, including their credentials.
 */
export function createRequestSettingsForProfile(settings: AppSettings, profile: ApiProfile): AppSettings {
  const normalized = normalizeSettings(settings)
  const runtimeProfile = { ...profile, usage: undefined }
  const profiles = normalized.profiles.map((item) => (
    item.id === profile.id ? runtimeProfile : { ...item, usage: undefined }
  ))
  return normalizeSettings({
    ...normalized,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    timeout: profile.timeout,
    apiMode: profile.apiMode,
    codexCli: profile.codexCli,
    apiProxy: profile.apiProxy,
    streamImages: profile.streamImages,
    streamPartialImages: profile.streamPartialImages,
    profiles,
    activeProfileId: profile.id,
  })
}
