// Light/dark/system theme management. The actual dark styles live in index.css
// and apply whenever <html> has the `.dark` class.

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'theme'

export function getTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) || 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(): void {
  const t = getTheme()
  const dark = t === 'dark' || (t === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#ffffff')
}

export function setTheme(t: Theme): void {
  localStorage.setItem(KEY, t)
  applyTheme()
}

// React to OS theme changes while in "system" mode.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'system') applyTheme()
})
