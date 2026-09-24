import { loadSettings as kitLoad, saveSettings as kitSave } from '../../vendor/lazy-kit/settings.js'
import { DEFAULT_THEME, isTheme } from '../../vendor/lazy-kit/themes.js'

const DEFAULTS = {
  language: (process.env.LC_ALL ?? process.env.LANG ?? '').startsWith('zh') ? 'zh' : 'en',
  theme: DEFAULT_THEME,
}

export function loadSettings() {
  const settings = kitLoad('lazyaur', DEFAULTS)
  return {
    language: settings.language === 'zh' ? 'zh' : 'en',
    theme: isTheme(settings.theme) ? settings.theme : DEFAULT_THEME,
  }
}

export function saveSettings(settings) {
  kitSave('lazyaur', {
    language: settings.language === 'zh' ? 'zh' : 'en',
    theme: isTheme(settings.theme) ? settings.theme : DEFAULT_THEME,
  })
}
