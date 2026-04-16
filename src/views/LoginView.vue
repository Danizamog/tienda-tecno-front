<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const authError = ref('')

function buildGoogleOAuthUrl(finalRedirect) {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!googleClientId) return null

  const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/auth/callback`
  const state = btoa(JSON.stringify({ redirect: finalRedirect }))

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function handleGoogle() {
  authError.value = ''
  const apiBase = import.meta.env.VITE_GATEWAY_API_BASE_URL || import.meta.env.VITE_API_BASE_URL
  const finalRedirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'

  const oauthUrl = buildGoogleOAuthUrl(finalRedirect)
  if (oauthUrl) {
    window.location.href = oauthUrl
    return
  }

  const callback = new URL('/auth/callback', window.location.origin)
  callback.searchParams.set('redirect', finalRedirect)

  if (!apiBase) {
    authError.value = 'Falta configurar VITE_GATEWAY_API_BASE_URL en el archivo .env del frontend.'
    return
  }

  try {
    const healthResponse = await fetch(`${apiBase}/health`)
    if (!healthResponse.ok) {
      authError.value = 'No se pudo conectar con el gateway de autenticacion.'
      return
    }
  } catch {
    authError.value = 'El gateway no esta levantado. Inicia el backend o configura VITE_GOOGLE_CLIENT_ID para login directo con Google.'
    return
  }

  window.location.href = `${apiBase}/auth/google?redirect=${encodeURIComponent(callback.toString())}`
}
</script>

<template>
  <div class="min-h-screen bg-[#0a0a0a] flex">

    <!-- ── Left panel (decorative) ──────────────────────────── -->
    <div class="hidden lg:flex lg:w-[55%] relative overflow-hidden">
      <!-- Background texture -->
      <div
        class="absolute inset-0"
        style="background: linear-gradient(135deg, #0a0a0a 0%, #111111 50%, #0f0d0a 100%);"
      />
      <!-- Grid pattern -->
      <div
        class="absolute inset-0 opacity-[0.04]"
        style="background-image: linear-gradient(#c9a96e 1px, transparent 1px), linear-gradient(90deg, #c9a96e 1px, transparent 1px); background-size: 60px 60px;"
      />
      <!-- Content -->
      <div class="relative z-10 flex flex-col justify-between p-16 w-full">
        <!-- Brand -->
        <div>
          <span class="font-display text-3xl font-light tracking-[0.25em] text-[#f0ede8] uppercase">
            TuVenta<span class="text-[#c9a96e]">Confiada</span>
          </span>
        </div>

        <!-- Hero text -->
        <div class="space-y-6">
          <p class="section-label">El marketplace de moda</p>
          <h1 class="font-display text-6xl font-light leading-tight text-[#f0ede8]">
            Compra, Vende<br />
            <em class="not-italic text-[#c9a96e]">tus prendas</em>
          </h1>
          <p class="text-[#555550] text-sm font-light leading-relaxed max-w-sm">
            Conectamos tiendas de ropa con compradores en todo el pais.
            Encuentra las mejores colecciones o participa en subastas exclusivas.
          </p>
        </div>

        <!-- Stats row -->
        <div class="flex gap-12">
          <div>
            <p class="font-display text-3xl font-light text-[#c9a96e]">500+</p>
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#444440] mt-1">Tiendas</p>
          </div>
          <div>
            <p class="font-display text-3xl font-light text-[#c9a96e]">24k</p>
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#444440] mt-1">Productos</p>
          </div>
          <div>
            <p class="font-display text-3xl font-light text-[#c9a96e]">98%</p>
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#444440] mt-1">Satisfacción</p>
          </div>
        </div>
      </div>

      <!-- Vertical gold line -->
      <div class="absolute right-0 top-0 bottom-0 w-px bg-linear-to-b from-transparent via-[#c9a96e22] to-transparent" />
    </div>

    <!-- ── Right panel (form) ────────────────────────────────── -->
    <div class="flex-1 flex flex-col justify-center px-8 py-12 lg:px-16">
      <!-- Mobile brand -->
      <div class="lg:hidden mb-10">
        <span class="font-display text-2xl font-light tracking-[0.25em] text-[#f0ede8] uppercase">
          TuVenta<span class="text-[#c9a96e]">Confiada</span>
        </span>
      </div>

      <div class="w-full max-w-sm mx-auto">
        <!-- Heading -->
        <div class="mb-10">
          <p class="section-label mb-3">Bienvenido</p>
          <h2 class="font-display text-4xl font-light text-[#f0ede8]">Inicia sesión con Google</h2>
          <p class="text-[#555550] text-sm mt-3">
            Por ahora el acceso esta habilitado exclusivamente con Google.
          </p>
        </div>

        <!-- Google button -->
        <button
          type="button"
          class="w-full flex items-center justify-center gap-3 border border-[#2a2a2a] hover:border-[#c9a96e33] bg-[#111111] text-[#f0ede8] py-3.5 px-4 transition-all duration-300 group mb-6"
          @click="handleGoogle"
        >
          <!-- Google SVG -->
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span class="text-xs tracking-[0.15em] uppercase group-hover:text-[#c9a96e] transition-colors">
            Ingresar con Google
          </span>
        </button>

        <p v-if="authError" class="text-xs text-red-300 mb-4">
          {{ authError }}
        </p>

        <!-- Back to home -->
        <div class="mt-8 text-center">
          <router-link
            to="/"
            class="text-[10px] tracking-[0.15em] uppercase text-[#333330] hover:text-[#555550] transition-colors"
          >
            ← Volver al inicio
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
