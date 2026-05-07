import { ref, watch } from 'vue'

const STORAGE_KEY = 'tv-theme'
const VALID = ['dark', 'light']

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && VALID.includes(stored)) return stored
  } catch (_) { /* localStorage no disponible */ }
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches
  return prefersLight ? 'light' : 'dark'
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

const theme = ref(getInitialTheme())
applyTheme(theme.value)

watch(theme, (val) => {
  applyTheme(val)
  try { window.localStorage.setItem(STORAGE_KEY, val) } catch (_) { /* noop */ }
})

export function useTheme() {
  function setTheme(value) {
    if (!VALID.includes(value)) return
    theme.value = value
  }
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }
  return { theme, setTheme, toggleTheme }
}

/**
 * Llamado desde main.js antes de montar la app, para evitar el "flash"
 * del tema oscuro mientras Vue arranca cuando el usuario tiene tema claro.
 */
export function initThemeEarly() {
  applyTheme(getInitialTheme())
}
