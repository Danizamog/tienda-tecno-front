<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route  = useRoute()
const authError  = ref('')
const isLoading  = ref(false)
const isReady    = ref(false)

onMounted(() => {
  requestAnimationFrame(() => { isReady.value = true })
})

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
  isLoading.value = true
  const apiBase = import.meta.env.VITE_GATEWAY_API_BASE_URL
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
    isLoading.value = false
    return
  }

  try {
    const healthResponse = await fetch(`${apiBase}/health`)
    if (!healthResponse.ok) {
      authError.value = 'No se pudo conectar con el gateway de autenticación.'
      isLoading.value = false
      return
    }
  } catch {
    authError.value = 'El gateway no está disponible. Inicia el backend o configura VITE_GOOGLE_CLIENT_ID para login directo con Google.'
    isLoading.value = false
    return
  }

  window.location.href = `${apiBase}/auth/google?redirect=${encodeURIComponent(callback.toString())}`
}
</script>

<template>
  <div class="login-page" :class="{ 'is-ready': isReady }">

    <!-- Panel izquierdo decorativo (solo desktop) -->
    <div class="login-left hidden lg:flex">
      <!-- Fondo con gradiente animado -->
      <div class="login-left-bg" />

      <!-- Grid decorativo -->
      <div class="login-left-grid" />

      <!-- Sweep shine igual que el hero -->
      <div class="login-left-sweep" />

      <!-- Vignette para suavizar bordes -->
      <div class="login-left-vignette" />

      <!-- Contenido del panel izquierdo -->
      <div class="relative z-10 flex flex-col justify-between p-14 xl:p-16 w-full">

        <!-- Logo -->
        <div class="login-entry" style="--delay: 0s">
          <span class="font-display text-2xl xl:text-3xl font-light tracking-[0.22em] text-text-primary uppercase">
            TuVenta<span class="text-accent">Confiada</span>
          </span>
        </div>

        <!-- Texto central -->
        <div class="space-y-5">
          <div class="login-entry" style="--delay: 0.1s">
            <p class="section-label">El marketplace de moda</p>
          </div>
          <div class="login-entry" style="--delay: 0.2s">
            <h1 class="font-display text-5xl xl:text-6xl font-light leading-[1.05] text-text-primary">
              Compra, Vende<br />
              <em class="not-italic text-accent">tus prendas</em>
            </h1>
          </div>
          <div class="login-entry" style="--delay: 0.3s">
            <p class="text-text-muted text-sm font-light leading-relaxed max-w-xs">
              Conectamos tiendas de ropa con compradores en todo el país.
              Encuentra las mejores colecciones o participa en subastas exclusivas.
            </p>
          </div>
        </div>

        <!-- Stats -->
        <div class="flex gap-10 xl:gap-14">
          <div v-for="(stat, i) in [
            { value: '500+', label: 'Tiendas' },
            { value: '24k',  label: 'Productos' },
            { value: '98%',  label: 'Satisfacción' },
          ]" :key="stat.label" class="login-entry" :style="`--delay: ${0.4 + i * 0.08}s`">
            <p class="font-display text-2xl xl:text-3xl font-light text-accent">{{ stat.value }}</p>
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mt-1">{{ stat.label }}</p>
          </div>
        </div>
      </div>

      <!-- Línea divisoria vertical dorada -->
      <div class="absolute right-0 top-0 bottom-0 w-px"
           style="background: linear-gradient(to bottom, transparent 0%, var(--accent) 30%, var(--accent) 70%, transparent 100%); opacity: 0.15;" />
    </div>

    <!-- Panel derecho (formulario) -->
    <div class="flex-1 flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 xl:px-20">

      <!-- Logo en móvil -->
      <div class="lg:hidden mb-10 login-entry" style="--delay: 0s">
        <span class="font-display text-2xl font-light tracking-[0.22em] text-text-primary uppercase">
          TuVenta<span class="text-accent">Confiada</span>
        </span>
      </div>

      <div class="w-full max-w-[22rem] mx-auto">

        <!-- Encabezado -->
        <div class="mb-10">
          <div class="login-entry" style="--delay: 0.15s">
            <p class="section-label mb-3">Bienvenido</p>
          </div>
          <div class="login-entry" style="--delay: 0.25s">
            <h2 class="font-display text-3xl xl:text-4xl font-light text-text-primary leading-tight">
              Inicia sesión<br />con Google
            </h2>
          </div>
          <div class="login-entry" style="--delay: 0.35s">
            <p class="text-text-muted text-sm mt-3 leading-relaxed">
              Por ahora el acceso está habilitado exclusivamente con Google.
            </p>
          </div>
        </div>

        <!-- Línea decorativa antes del botón -->
        <div class="login-entry flex items-center gap-4 mb-7" style="--delay: 0.45s">
          <div class="flex-1 h-px" style="background: linear-gradient(to right, transparent, var(--border-default));" />
          <svg class="w-4 h-4 text-accent opacity-60 shrink-0" fill="none" stroke="currentColor" stroke-width="1.4" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/>
          </svg>
          <div class="flex-1 h-px" style="background: linear-gradient(to left, transparent, var(--border-default));" />
        </div>

        <!-- Botón Google -->
        <div class="login-entry" style="--delay: 0.55s">
          <button
            type="button"
            class="login-google-btn"
            :class="{ 'is-loading': isLoading }"
            :disabled="isLoading"
            @click="handleGoogle"
          >
            <span v-if="!isLoading" class="flex items-center justify-center gap-3">
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Ingresar con Google</span>
            </span>
            <span v-else class="flex items-center justify-center gap-2">
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span>Redirigiendo...</span>
            </span>
          </button>
        </div>

        <!-- Error -->
        <div v-if="authError" class="login-entry mt-4 p-3 border border-danger-border bg-danger-soft" style="--delay: 0s">
          <p class="text-xs text-danger leading-relaxed">{{ authError }}</p>
        </div>

        <!-- Volver al inicio -->
        <div class="login-entry mt-10 text-center" style="--delay: 0.65s">
          <router-link to="/" class="login-back-link">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            Volver al inicio
          </router-link>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout principal ──────────────────────────────────────── */
.login-page {
  min-height: 100vh;
  background-color: var(--surface-base);
  display: flex;
}

/* ── Panel izquierdo ───────────────────────────────────────── */
.login-left {
  width: 52%;
  position: relative;
  overflow: hidden;
  flex-direction: column;
}

.login-left-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 40%, rgba(201, 169, 110, 0.12) 0%, transparent 45%),
    radial-gradient(circle at 80% 70%, rgba(201, 169, 110, 0.07) 0%, transparent 50%),
    linear-gradient(160deg, var(--surface-base) 0%, var(--surface-raised) 60%, #0d0b08 100%);
  animation: login-glow-drift 16s ease-in-out infinite;
}

@keyframes login-glow-drift {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.85; }
}

.login-left-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(201, 169, 110, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(201, 169, 110, 0.08) 1px, transparent 1px);
  background-size: 60px 60px;
  pointer-events: none;
}

.login-left-sweep {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    transparent 0%,
    transparent 38%,
    rgba(201, 169, 110, 0.05) 45%,
    rgba(201, 169, 110, 0.18) 50%,
    transparent 50.05%,
    transparent 100%
  );
  transform: translateX(-140%);
  animation: login-sweep 14s linear 1s both infinite;
  pointer-events: none;
}

@keyframes login-sweep {
  0%,   4% { transform: translateX(-140%); }
  96%, 100% { transform: translateX(200%); }
}

.login-left-vignette {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 50%, transparent 50%, var(--surface-base) 120%);
  pointer-events: none;
}

/* ── Animación de entrada escalonada ───────────────────────── */
.login-page .login-entry {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--delay, 0s);
}
.login-page.is-ready .login-entry {
  opacity: 1;
  transform: translateY(0);
}

/* ── Botón Google ──────────────────────────────────────────── */
.login-google-btn {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  border: 1px solid var(--border-default);
  background-color: var(--surface-raised);
  color: var(--text-primary);
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 500;
  padding: 1rem 1.5rem;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease;
}
.login-google-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent-soft);
  opacity: 0;
  transition: opacity 0.3s ease;
}
.login-google-btn:hover:not(:disabled) {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 8px 24px -12px var(--accent-glow-strong);
  transform: translateY(-1px);
}
.login-google-btn:hover:not(:disabled)::before {
  opacity: 1;
}
.login-google-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}
.login-google-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.login-google-btn > * {
  position: relative;
  z-index: 1;
}

/* ── Volver al inicio ──────────────────────────────────────── */
.login-back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-disabled);
  transition: color 0.25s ease, gap 0.25s ease;
}
.login-back-link:hover {
  color: var(--accent);
  gap: 0.65rem;
}

/* ── Modo claro ────────────────────────────────────────────── */
[data-theme="light"] .login-left-bg {
  background:
    radial-gradient(circle at 20% 40%, rgba(167, 136, 80, 0.10) 0%, transparent 45%),
    radial-gradient(circle at 80% 70%, rgba(167, 136, 80, 0.06) 0%, transparent 50%),
    linear-gradient(160deg, var(--surface-base) 0%, var(--surface-raised) 60%, #f0ebe0 100%);
}
[data-theme="light"] .login-left-grid {
  background-image:
    linear-gradient(rgba(167, 136, 80, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(167, 136, 80, 0.12) 1px, transparent 1px);
}
[data-theme="light"] .login-left-sweep {
  background: linear-gradient(
    110deg,
    transparent 0%,
    transparent 38%,
    rgba(167, 136, 80, 0.06) 45%,
    rgba(167, 136, 80, 0.20) 50%,
    transparent 50.05%,
    transparent 100%
  );
}
[data-theme="light"] .login-left-vignette {
  background:
    radial-gradient(ellipse at 50% 50%, transparent 50%, var(--surface-base) 120%);
}

/* ── Responsive: sin animación reducida ────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .login-entry {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
  .login-left-sweep {
    animation: none !important;
    opacity: 0 !important;
  }
}
</style>
