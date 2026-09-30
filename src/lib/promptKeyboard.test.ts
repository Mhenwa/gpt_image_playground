import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from './apiProfiles'
import { getPromptEnterAction } from './promptKeyboard'

describe('prompt submission shortcuts', () => {
  it('sends on Enter and inserts a newline only with Shift', () => {
    expect(getPromptEnterAction({ key: 'Enter' })).toBe('submit')
    expect(getPromptEnterAction({ key: 'Enter', shiftKey: true })).toBe('newline')
    expect(getPromptEnterAction({ key: 'Escape' })).toBeNull()
  })
  it('does not submit while the input method is composing or confirming candidates', () => {
    expect(getPromptEnterAction({ key: 'Enter', isComposing: true })).toBe('composition')
    expect(getPromptEnterAction({ key: 'Enter' }, true)).toBe('composition')
    expect(getPromptEnterAction({ key: 'Enter', keyCode: 229 })).toBe('composition')
  })
  it('ignores repeated submission and Alt+Enter without blocking deliberate multiline input', () => {
    expect(getPromptEnterAction({ key: 'Enter', repeat: true })).toBe('ignore')
    expect(getPromptEnterAction({ key: 'Enter', altKey: true })).toBe('ignore')
    expect(getPromptEnterAction({ key: 'Enter', shiftKey: true, repeat: true })).toBe('newline')
  })
  it('upgrades legacy saved shortcut settings to the fixed behavior', () => {
    expect(DEFAULT_SETTINGS.enterSubmit).toBe(true)
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, enterSubmit: false }).enterSubmit).toBe(true)
  })
})
