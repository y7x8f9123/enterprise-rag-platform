import { createContext } from 'react'
import type { AppSettings } from './settings'

export type AppSettingsContextValue = {
  settings: AppSettings
  updateSettings: (changes: Partial<AppSettings>) => void
  resetSettings: () => void
}

export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

