import { computed, ref } from 'vue'

const SESSION_COOKIE_NAME = 'tv_auth_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30
const LEGACY_AUTH_KEYS = ['authToken', 'authProvider', 'authEmail', 'authName', 'authPicture', 'authUserId', 'authRole']

const session = ref(readSessionFromCookie())

function readCookie(name) {
  if (typeof document === 'undefined') return null

  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))

  if (!cookie) return null

  return decodeURIComponent(cookie.slice(name.length + 1))
}

function writeCookie(name, value, maxAgeSeconds = SESSION_MAX_AGE) {
  if (typeof document === 'undefined') return

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`
}

function removeCookie(name) {
  if (typeof document === 'undefined') return

  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`
}

function safeParseSession(value) {
  if (!value) return null

  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function normalizeRoleValue(roleValue) {
  if (typeof roleValue === 'string' && roleValue.trim()) {
    return roleValue.trim().toLowerCase()
  }
  if (Array.isArray(roleValue) && typeof roleValue[0] === 'string' && roleValue[0].trim()) {
    return roleValue[0].trim().toLowerCase()
  }
  return 'user'
}

function readSessionFromCookie() {
  const cookieSession = safeParseSession(readCookie(SESSION_COOKIE_NAME))
  if (cookieSession) {
    const normalizedCookie = normalizeSession(cookieSession)

    if (normalizedCookie?.token) {
      writeCookie(SESSION_COOKIE_NAME, JSON.stringify(normalizedCookie))
      return normalizedCookie
    }
  }

  return null
}

function clearLegacyAuthStorage() {
  if (typeof localStorage === 'undefined') return
  LEGACY_AUTH_KEYS.forEach((key) => localStorage.removeItem(key))
}

clearLegacyAuthStorage()

function normalizeSession(input) {
  if (!input || typeof input !== 'object') return null

  return {
    token: typeof input.token === 'string' ? input.token : '',
    provider: typeof input.provider === 'string' ? input.provider : '',
    email: typeof input.email === 'string' ? input.email : '',
    name: typeof input.name === 'string' ? input.name : '',
    picture: typeof input.picture === 'string' ? input.picture : '',
    userId: typeof input.userId === 'string' ? input.userId : '',
    role: normalizeRoleValue(input.role),
  }
}

function persistSession(nextSession) {
  const normalized = normalizeSession(nextSession)
  if (!normalized?.token) {
    clearSession()
    return null
  }

  session.value = normalized
  writeCookie(SESSION_COOKIE_NAME, JSON.stringify(normalized))
  return normalized
}

function clearSession() {
  session.value = null
  removeCookie(SESSION_COOKIE_NAME)
}

function refreshSession() {
  session.value = readSessionFromCookie()
  return session.value
}

async function syncSessionRoleFromBackend() {
  if (!session.value?.token) return session.value

  const apiBase = import.meta.env.VITE_GATEWAY_API_BASE_URL
  if (!apiBase) return session.value

  const email = session.value.email
  const userId = session.value.userId
  if (!email && !userId) return session.value

  try {
    const response = await fetch(`${apiBase}/auth/refresh-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, userId }),
    })

    if (!response.ok) return session.value

    const payload = await response.json().catch(() => null)
    if (!payload?.ok || !payload?.user) return session.value

    const updated = normalizeSession({
      ...session.value,
      userId: payload.user.id || session.value.userId,
      role: payload.user.role || session.value.role || 'user',
    })

    if (updated?.token) {
      session.value = updated
      writeCookie(SESSION_COOKIE_NAME, JSON.stringify(updated))
    }

    return session.value
  } catch {
    return session.value
  }
}

export function useAuthSession() {
  const isAuthenticated = computed(() => Boolean(session.value?.token))
  const displayName = computed(() => session.value?.name || session.value?.email || '')
  const displayEmail = computed(() => session.value?.email || '')
  const userRole = computed(() => session.value?.role || 'user')
  const isAdmin = computed(() => userRole.value === 'admin')
  const canViewVendor = computed(() => userRole.value === 'vendor' || userRole.value === 'admin')
  const avatarInitial = computed(() => {
    const base = displayName.value || displayEmail.value
    if (!base) return 'TV'
    return base.trim().charAt(0).toUpperCase()
  })

  return {
    session,
    isAuthenticated,
    displayName,
    displayEmail,
    userRole,
    isAdmin,
    canViewVendor,
    avatarInitial,
    persistSession,
    clearSession,
    refreshSession,
    syncSessionRoleFromBackend,
  }
}