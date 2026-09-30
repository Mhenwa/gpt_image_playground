import type { ApiProfile } from '../types'

/** Model pickers only update their own purpose; connection data stays shared. */
export function updateServiceModel(profile: ApiProfile, purpose: 'gallery' | 'agent-text' | 'agent-image', model: string): ApiProfile {
  if (profile.usage) {
    return {
      ...profile,
      usage: purpose === 'gallery'
        ? { ...profile.usage, gallery: { ...profile.usage.gallery, model } }
        : { ...profile.usage, agent: { ...profile.usage.agent, [purpose === 'agent-text' ? 'textModel' : 'imageModel']: model } },
    }
  }
  // Imported legacy configurations remain editable until they are migrated.
  if (purpose === 'agent-text') return { ...profile, model }
  return profile.provider === 'openai' && profile.apiMode === 'responses'
    ? { ...profile, imageGenerationModel: model }
    : { ...profile, model }
}
