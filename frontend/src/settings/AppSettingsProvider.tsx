import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AppSettingsContext } from './AppSettingsStore'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  parseStoredSettings,
  type AppSettings,
} from './settings'

function loadSettings(): AppSettings {
  try {
    return parseStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings(settings: AppSettings) {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Preferences remain usable for this session when storage is unavailable.
  }
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  useEffect(() => saveSettings(settings), [settings])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const dark = settings.appearance === 'dark'
        || (settings.appearance === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    }

    applyTheme()
    if (settings.appearance === 'system') {
      media.addEventListener('change', applyTheme)
      return () => media.removeEventListener('change', applyTheme)
    }
  }, [settings.appearance])

  const updateSettings = useCallback((changes: Partial<AppSettings>) => {
    setSettings(current => ({ ...current, ...changes }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS })
  }, [])

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings }),
    [resetSettings, settings, updateSettings],
  )

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  )
}

