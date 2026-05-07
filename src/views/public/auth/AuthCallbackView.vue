<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthSession } from '@/composables/useAuthSession'

const router = useRouter()
const route = useRoute()
const errorMessage = ref('')
const { persistSession } = useAuthSession()

function readHashParams() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  return new URLSearchParams(hash)
}

function readRedirectFromState(state) {
  if (!state) return '/'
  try {
    const parsed = JSON.parse(atob(state))
    if (parsed && typeof parsed.redirect === 'string' && parsed.redirect) return parsed.redirect
  } catch {
    return '/'
  }
  return '/'
}

async function syncGoogleUser(accessToken) {
  const apiBase = import.meta.env.VITE_GATEWAY_API_BASE_URL
  if (!apiBase) {
    throw new Error('No existe VITE_GATEWAY_API_BASE_URL en el .env del frontend.')
  }

  const response = await fetch(`${apiBase}/auth/google/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok) {
    const message = payload?.message || payload?.error || 'No se pudo sincronizar el usuario con el backend.'
    throw new Error(message)
  }

  return payload
}

onMounted(async () => {
  const hashParams = readHashParams()
  const oauthToken = hashParams.get('access_token')
  const oauthState = hashParams.get('state')
  const oauthError = hashParams.get('error')
  const oauthErrorDescription = hashParams.get('error_description')

  if (oauthError) {
    errorMessage.value = oauthErrorDescription || 'Google cancel├│ o rechaz├│ el acceso.'
    return
  }

  if (oauthToken) {
    try {
      const target = readRedirectFromState(oauthState)
      const syncResult = await syncGoogleUser(oauthToken)

      persistSession({
        token: oauthToken,
        provider: 'google',
        email: syncResult?.user?.email || '',
        name: syncResult?.user?.name || '',
        picture: syncResult?.user?.picture || '',
        userId: syncResult?.user?.id || '',
        role: syncResult?.user?.role || 'user',
      })

      router.replace(target)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'No se pudo iniciar sesi├│n con Google.'
    }
    return
  }

  const provider = route.query.provider
  const token = route.query.token
  const email = route.query.email
  const name = route.query.name
  const target = typeof route.query.redirect === 'string' && route.query.redirect ? route.query.redirect : '/'

  if (provider !== 'google' || !token) {
    errorMessage.value = 'No se pudo completar el inicio de sesion con Google.'
    return
  }

  // Obtener el rol real desde el backend (en vez de asumir 'user')
  let resolvedRole = 'user'
  let resolvedUserId = ''
  const apiBase = import.meta.env.VITE_GATEWAY_API_BASE_URL
  if (apiBase && email) {
    try {
      const r = await fetch(`${apiBase}/auth/refresh-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email) }),
      })
      if (r.ok) {
        const data = await r.json()
        if (data?.ok && data?.user) {
          resolvedRole = data.user.role || 'user'
          resolvedUserId = data.user.id || ''
        }
      }
    } catch { /* silencioso */ }
  }

  persistSession({
    token: String(token),
    provider: 'google',
    email: email ? String(email) : '',
    name: name ? String(name) : '',
    picture: '',
    userId: resolvedUserId,
    role: resolvedRole,
  })

  router.replace(target)
})
</script>

<template>
  <div class="min-h-screen bg-surface-base flex items-center justify-center">
    <div class="flex flex-col items-center gap-4 px-6 text-center">
      <svg class="w-8 h-8 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <p v-if="!errorMessage" class="text-[10px] tracking-[0.3em] uppercase text-text-disabled">Iniciando sesion...</p>
      <div v-else class="space-y-4">
        <p class="text-sm text-red-300">{{ errorMessage }}</p>
        <router-link
          to="/login"
          class="text-[10px] tracking-[0.2em] uppercase text-accent hover:text-text-primary transition-colors"
        >
          Volver a login
        </router-link>
      </div>
    </div>
  </div>
</template>

