import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppSettingsProvider } from './AppSettingsProvider'
import { useAppSettings } from './useAppSettings'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  parseStoredSettings,
} from './settings'

function SettingsHarness() {
  const { settings, updateSettings, resetSettings } = useAppSettings()
  return (
    <div>
      <output aria-label="settings">{JSON.stringify(settings)}</output>
      <button type="button" onClick={() => updateSettings({ appearance: 'dark', documentsPerPage: 50 })}>Use dark</button>
      <button type="button" onClick={() => updateSettings({ appearance: 'light' })}>Use light</button>
      <button type="button" onClick={resetSettings}>Reset</button>
    </div>
  )
}

describe('AppSettingsProvider', () => {
  it('persists preferences and resets them to defaults', async () => {
    render(<AppSettingsProvider><SettingsHarness /></AppSettingsProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Use dark' }))
    await waitFor(() => expect(JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}',
    )).toMatchObject({ appearance: 'dark', documentsPerPage: 50 }))
    expect(document.documentElement).toHaveClass('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByLabelText('settings')).toHaveTextContent(JSON.stringify(DEFAULT_SETTINGS))
  })

  it('uses safe defaults for corrupted or invalid stored values', () => {
    expect(parseStoredSettings('{not json')).toEqual(DEFAULT_SETTINGS)
    expect(parseStoredSettings(JSON.stringify({
      appearance: 'neon',
      defaultDocumentView: 'html',
      documentsPerPage: 999,
    }))).toEqual(DEFAULT_SETTINGS)
  })

  it('supports light, dark and live system appearance changes', async () => {
    let listener: (() => void) | undefined
    const media = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn((_event: string, callback: () => void) => { listener = callback }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
    vi.spyOn(window, 'matchMedia').mockReturnValue(media)

    render(<AppSettingsProvider><SettingsHarness /></AppSettingsProvider>)
    expect(document.documentElement).not.toHaveClass('dark')

    media.matches = true
    act(() => listener?.())
    expect(document.documentElement).toHaveClass('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Use light' }))
    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'))
    fireEvent.click(screen.getByRole('button', { name: 'Use dark' }))
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
  })

  it('continues with in-memory defaults when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })

    render(<AppSettingsProvider><SettingsHarness /></AppSettingsProvider>)
    expect(screen.getByLabelText('settings')).toHaveTextContent(JSON.stringify(DEFAULT_SETTINGS))
  })
})
