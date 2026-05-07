<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')

// ── Estado ────────────────────────────────────────────────────────────────────
const stores     = ref([])
const totalItems = ref(0)
const totalPages = ref(1)
const loading    = ref(false)
const error      = ref('')

const filters = reactive({
  search:   '',
  verified: '',
  sort:     '-rating',
  page:     1,
  perPage:  18,
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchStores() {
  loading.value = true
  error.value   = ''
  try {
    const params = new URLSearchParams({
      page:    filters.page,
      perPage: filters.perPage,
      sort:    filters.sort,
      status:  'active',
    })
    if (filters.search)          params.set('search', filters.search)
    if (filters.verified !== '') params.set('verified', filters.verified)

    const res  = await fetch(`${API}/stores?${params}`)
    if (!res.ok) throw new Error(`Error ${res.status}`)
    const data = await res.json()

    stores.value     = data.items      || []
    totalItems.value = data.totalItems || 0
    totalPages.value = data.totalPages || 1
  } catch {
    error.value  = 'No se pudieron cargar las tiendas. Verifica que el backend esté activo.'
    stores.value = []
  } finally {
    loading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function logoUrl(store) {
  if (!store.logo) return null
  return `${API}/stores/files/stores/${store.id}/${store.logo}`
}

function bannerUrl(store) {
  if (!store.banner) return null
  return `${API}/stores/files/stores/${store.id}/${store.banner}`
}

function ratingStars(rating) {
  const r     = Math.round(Number(rating || 0) * 2) / 2
  const full  = Math.floor(r)
  const half  = r % 1 !== 0
  const empty = 5 - full - (half ? 1 : 0)
  return { full, half, empty }
}

function initials(name) {
  return (name || 'TT')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

function clearFilters() {
  filters.search   = ''
  filters.verified = ''
  filters.page     = 1
}

const hasActiveFilters = computed(() => filters.search || filters.verified)

// ── Paginación ────────────────────────────────────────────────────────────────
const pageWindow = computed(() => {
  const cur   = filters.page
  const total = totalPages.value
  const pages = []
  for (let p = Math.max(1, cur - 2); p <= Math.min(total, cur + 2); p++) {
    pages.push(p)
  }
  return pages
})

function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  filters.page = p
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Watchers ──────────────────────────────────────────────────────────────────
let searchTimeout = null
watch(() => filters.search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    filters.page = 1
    fetchStores()
  }, 350)
})

watch([() => filters.verified, () => filters.sort, () => filters.page], () => {
  fetchStores()
})

onMounted(fetchStores)
</script>

<template>
  <AppNavbar />

  <main class="stores-shell text-text-primary">

    <!-- ══ HERO ══════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden border-b border-border-subtle">
      <div class="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_left,var(--accent-soft)_0%,var(--surface-base)_55%)] opacity-75" />
      <div
        class="absolute inset-0 pointer-events-none opacity-[0.05]"
        style="background-image:linear-gradient(var(--accent) 1px,transparent 1px),linear-gradient(90deg,var(--accent) 1px,transparent 1px);background-size:72px 72px;"
      />
      <div class="relative max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-14 md:py-20">
        <div class="max-w-xl">
          <p class="section-label mb-3">Directorio</p>
          <h1 class="font-display text-4xl md:text-6xl font-light leading-[0.95] mb-4">
            Todas las tiendas
          </h1>
          <p class="text-text-muted text-sm leading-relaxed">
            Explora el directorio completo de vendedores. Encuentra tu marca favorita
            o descubre nuevos comercios de confianza.
          </p>
        </div>
      </div>
    </section>

    <!-- ══ BARRA DE FILTROS ══════════════════════════════════════ -->
    <section class="w-full border-b border-border-subtle bg-surface-sunken sticky top-[57px] z-40">
      <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3">
        <div class="flex flex-wrap items-center gap-2.5">

          <!-- Buscador — lupa a la derecha -->
          <div class="relative flex-1 min-w-[180px] max-w-xs">
            <input
              v-model="filters.search"
              type="text"
              placeholder="Buscar tienda..."
              class="filter-input pr-9 w-full"
            />
            <svg
              class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-disabled pointer-events-none"
              fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35" stroke-linecap="round"/>
            </svg>
          </div>

          <!-- Verificación -->
          <div class="relative">
            <select
              v-model="filters.verified"
              @change="filters.page = 1"
              class="filter-select"
            >
              <option value="">Todas las tiendas</option>
              <option value="true">Solo verificadas</option>
              <option value="false">Sin verificar</option>
            </select>
            <svg class="select-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <!-- Ordenar -->
          <div class="relative">
            <select
              v-model="filters.sort"
              @change="filters.page = 1"
              class="filter-select"
            >
              <option value="-rating">Mayor valoración</option>
              <option value="name">Nombre A–Z</option>
              <option value="-name">Nombre Z–A</option>
              <option value="-id">Más recientes</option>
            </select>
            <svg class="select-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <!-- Limpiar filtros -->
          <button
            v-if="hasActiveFilters"
            @click="clearFilters"
            class="h-9 px-3 text-[10px] tracking-[0.15em] uppercase text-text-muted border border-[var(--text-disabled)] hover:border-[var(--accent)44] hover:text-accent transition-colors whitespace-nowrap"
          >
            Limpiar
          </button>

          <!-- Contador -->
          <span class="ml-auto text-[10px] tracking-[0.18em] uppercase text-text-disabled hidden sm:block whitespace-nowrap">
            {{ totalItems }} tienda{{ totalItems !== 1 ? 's' : '' }}
          </span>

        </div>
      </div>
    </section>

    <!-- ══ CONTENIDO ═════════════════════════════════════════════ -->
    <section class="w-full">
      <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10">

        <!-- Error -->
        <div v-if="error" class="border border-red-900/30 bg-red-950/10 p-8 text-center mb-6">
          <svg class="w-8 h-8 text-red-700 mx-auto mb-3" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p class="text-red-400 text-sm mb-4">{{ error }}</p>
          <button @click="fetchStores" class="btn-outline text-xs">Reintentar</button>
        </div>

        <!-- Skeleton -->
        <div v-else-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="i in 9" :key="i" class="card-dark overflow-hidden">
            <div class="skeleton h-40 w-full" />
            <div class="p-5 space-y-3">
              <div class="flex items-center gap-3">
                <div class="skeleton w-10 h-10 shrink-0" />
                <div class="flex-1 space-y-2">
                  <div class="skeleton h-3 w-2/3" />
                  <div class="skeleton h-2 w-1/3" />
                </div>
              </div>
              <div class="skeleton h-2 w-full" />
              <div class="skeleton h-2 w-4/5" />
              <div class="skeleton h-px w-full mt-2" />
              <div class="flex justify-between pt-1">
                <div class="skeleton h-2.5 w-20" />
                <div class="skeleton h-2 w-14" />
              </div>
            </div>
          </div>
        </div>

        <!-- Sin resultados -->
        <div v-else-if="!stores.length" class="flex flex-col items-center py-24 border border-[var(--surface-overlay)]">
          <svg class="w-10 h-10 text-text-disabled mb-5" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
            <path d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p class="font-display text-2xl font-light text-text-disabled mb-2">Sin tiendas</p>
          <p class="text-text-disabled text-xs tracking-widest uppercase mb-6">
            {{ filters.search ? 'Intenta con otra búsqueda' : 'Aún no hay tiendas registradas' }}
          </p>
          <button v-if="hasActiveFilters" @click="clearFilters" class="btn-outline text-xs">
            Limpiar filtros
          </button>
        </div>

        <!-- Grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <RouterLink
            v-for="store in stores"
            :key="store.id"
            :to="`/stores/${store.slug || store.id}`"
            class="card-dark group flex flex-col overflow-hidden"
          >
            <!-- Banner — altura fija estándar: 160 px independiente del tamaño de la imagen -->
            <div class="relative h-40 shrink-0 bg-surface-raised overflow-hidden">
              <img
                v-if="bannerUrl(store)"
                :src="bannerUrl(store)"
                :alt="store.name"
                class="w-full h-full object-cover object-top"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center"
                style="background:linear-gradient(135deg,var(--surface-raised) 0%,var(--accent-soft) 100%);"
              >
                <span class="font-display text-5xl font-light text-text-disabled">
                  {{ initials(store.name) }}
                </span>
              </div>

              <!-- Gradiente inferior -->
              <div class="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/60 to-transparent pointer-events-none" />

              <!-- Badge verificada -->
              <div v-if="store.verified" class="absolute top-3 right-3">
                <span class="badge-gold">
                  <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-.497 3.842 3.745 3.745 0 01-3.842.497A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.842-.497 3.745 3.745 0 01-.497-3.842A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 01.497-3.842 3.746 3.746 0 013.842-.497A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.842.497 3.746 3.746 0 01.497 3.842A3.745 3.745 0 0121 12z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Verificada
                </span>
              </div>
            </div>

            <!-- Cuerpo -->
            <div class="p-5 flex flex-col gap-3 flex-1">

              <!-- Logo + nombre -->
              <div class="flex items-center gap-3">
                <!-- Logo — tamaño fijo 40×40 px -->
                <div class="w-10 h-10 flex-shrink-0 border border-border-default bg-surface-raised overflow-hidden">
                  <img
                    v-if="logoUrl(store)"
                    :src="logoUrl(store)"
                    :alt="store.name"
                    class="w-full h-full object-cover object-center"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <span class="font-display text-sm font-light text-text-disabled">
                      {{ initials(store.name).charAt(0) }}
                    </span>
                  </div>
                </div>

                <div class="min-w-0 flex-1">
                  <h2 class="text-sm font-medium text-text-primary leading-snug truncate group-hover:text-accent transition-colors duration-200">
                    {{ store.name }}
                  </h2>
                  <p v-if="store.location" class="text-[11px] text-text-disabled mt-0.5 truncate flex items-center gap-1">
                    <svg class="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    {{ store.location }}
                  </p>
                </div>
              </div>

              <!-- Descripción -->
              <p
                v-if="store.description"
                class="text-[11px] text-text-muted leading-relaxed line-clamp-2"
                v-html="store.description"
              />

              <!-- Pie: rating + reseñas -->
              <div class="mt-auto pt-3 border-t border-[var(--surface-overlay)] flex items-center justify-between gap-2">

                <!-- Estrellas -->
                <div class="flex items-center gap-1.5">
                  <div class="flex items-center gap-0.5">
                    <template v-for="n in ratingStars(store.rating).full" :key="`f${n}`">
                      <svg class="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    </template>
                    <template v-if="ratingStars(store.rating).half">
                      <svg class="w-3 h-3" viewBox="0 0 20 20">
                        <defs>
                          <linearGradient :id="`hs-${store.id}`" x1="0" x2="1" y1="0" y2="0">
                            <stop offset="50%" stop-color="var(--accent)"/>
                            <stop offset="50%" stop-color="var(--text-disabled)"/>
                          </linearGradient>
                        </defs>
                        <path :fill="`url(#hs-${store.id})`" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    </template>
                    <template v-for="n in ratingStars(store.rating).empty" :key="`e${n}`">
                      <svg class="w-3 h-3 text-text-disabled" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    </template>
                  </div>
                  <span class="text-[10px] text-text-muted tabular-nums">
                    {{ Number(store.rating || 0).toFixed(1) }}
                  </span>
                </div>

                <span class="text-[10px] text-text-disabled tabular-nums">
                  {{ store.reviews_count || 0 }} reseña{{ (store.reviews_count || 0) !== 1 ? 's' : '' }}
                </span>
              </div>
            </div>
          </RouterLink>
        </div>

        <!-- ══ PAGINACIÓN ════════════════════════════════════════ -->
        <div v-if="!loading && totalPages > 1" class="mt-10 flex items-center justify-center gap-1">
          <button @click="goPage(filters.page - 1)" :disabled="filters.page === 1" class="page-btn" aria-label="Anterior">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <button v-if="pageWindow[0] > 1" @click="goPage(1)" class="page-btn">1</button>
          <span v-if="pageWindow[0] > 2" class="text-text-disabled text-xs px-1 select-none">…</span>

          <button
            v-for="p in pageWindow"
            :key="p"
            @click="goPage(p)"
            :class="['page-btn', p === filters.page && 'page-btn--active']"
          >{{ p }}</button>

          <span v-if="pageWindow[pageWindow.length - 1] < totalPages - 1" class="text-text-disabled text-xs px-1 select-none">…</span>
          <button v-if="pageWindow[pageWindow.length - 1] < totalPages" @click="goPage(totalPages)" class="page-btn">{{ totalPages }}</button>

          <button @click="goPage(filters.page + 1)" :disabled="filters.page === totalPages" class="page-btn" aria-label="Siguiente">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

      </div>
    </section>

  </main>

  <AppFooter />
</template>

<style scoped>
.stores-shell {
  background: linear-gradient(180deg, var(--surface-base) 0%, var(--surface-base) 40%, var(--surface-base) 100%);
  flex: 1;
  width: 100%;
  overflow-x: hidden;
}

/* ── Paginación ──────────────────────────────────────── */
.page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.4rem;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  border: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.page-btn:hover:not(:disabled) {
  border-color: var(--accent)44;
  color: var(--accent);
}
.page-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}
.page-btn--active {
  border-color: var(--accent) !important;
  color: var(--accent) !important;
  background: var(--accent-soft);
}
</style>
