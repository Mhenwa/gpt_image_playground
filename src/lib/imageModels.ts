import type { ApiProfile } from '../types'

export const DEFAULT_IMAGES_MODEL = 'gpt-image-2.5-sunburst'

export function getImageGenerationModel(profile: ApiProfile) {
  return profile.provider === 'openai' && profile.apiMode === 'responses'
    ? profile.imageGenerationModel?.trim() ?? ''
    : profile.model
}

export function isGptImage25Model(model: string) {
  return model.trim().toLowerCase().includes('gpt-image-2.5')
}

/**
 * GPT Image models are image-generation tools, not the text model used as the
 * top-level Responses model in Agent mode.
 */
export function isLikelyImageModel(model: string) {
  const normalized = model.trim().toLowerCase()
  return normalized.startsWith('gpt-image-') || normalized.includes('/gpt-image-')
}
