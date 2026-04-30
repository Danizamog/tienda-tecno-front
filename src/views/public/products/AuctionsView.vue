<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useAuctions } from '@/composables/useAuctions'

const { subscribeToAuction } = useAuctions()

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

// ── Estado ────────────────────────────────────────────────────────────────────
const auctions   = ref([])
const totalItems = ref(0)
const totalPages = ref(1)
const loading    = ref(false)
const error      = ref('')
const now        = ref(Date.now())

const filters = reactive({
  search:          '',
  minCurrentPrice: '',
  maxCurrentPrice: '',
  hasBuyNow:       false,
  sort:            'end_date',
  page:            1,
  perPage:         12,
})

let abortController = null

// Tick cada segundo para los contadores
let ticker = null

// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchAuctions() {
  if (abortController) abortController.abort()
  abortController = new AbortController()

  loading.value = true
  error.value   = ''
  try {
    const params = new URLSearchParams({
      status:  'active',
      page:    filters.page,
      perPage: filters.perPage,
      sort:    filters.sort,
    })
    if (filters.search) params.set('search', filters.search)
    if (filters.minCurrentPrice !== '') params.set('minCurrentPrice', String(filters.minCurrentPrice))
    if (filters.maxCurrentPrice !== '') params.set('maxCurrentPrice', String(filters.maxCurrentPrice))
    if (filters.hasBuyNow) params.set('hasBuyNow', 'true')

    const res  = await fetch(`${API}/auctions?${params}`, { signal: abortController.signal })
    if (!res.ok) throw new Error(`Error ${res.status}`)
    const data = await res.json()

    auctions.value   = data.items      || []
    totalItems.value = data.totalItems || 0
    totalPages.value = data.totalPages || 1
  } catch (err) {
    if (err?.name === 'AbortError') return
    error.value    = 'No se pudieron cargar las subastas. Verifica que el backend esté activo.'
    auctions.value = []
  } finally {
    loading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function auctionImageUrl(auction) {
  const imgs = Array.isArray(auction.images) ? auction.images : (auction.images ? [auction.images] : [])
  const img  = imgs[0]
  if (!img) return null
  return `${PB}/api/files/auctions/${auction.id}/${img}?thumb=600x400`
}

function storeLogoUrl(store) {
  if (!store?.logo) return null
  return `${API}/stores/files/stores/${store.id}/${store.logo}`
}

function storeInitials(name) {
  return (name || 'TT').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// Countdown: devuelve { days, hours, minutes, seconds, expired }
function timeLeft(endDateStr) {
  const end  = new Date(endDateStr).getTime()
  const diff = end - now.value
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 }
  const days    = Math.floor(diff / 86400000)
  const hours   = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return { expired: false, days, hours, minutes, seconds }
}

function pad(n) { return String(n).padStart(2, '0') }

// Urgencia del countdown
function urgencyClass(endDateStr) {
  const diff = new Date(endDateStr).getTime() - now.value
  if (diff <= 0) return 'text-[#555550]'
  if (diff < 3600000)   return 'text-red-400'   // < 1 hora
  if (diff < 86400000)  return 'text-amber-400'  // < 1 día
  return 'text-[#c9a96e]'
}

const countdownById = computed(() => {
  const map = {}
  for (const auction of auctions.value) {
    map[auction.id] = timeLeft(auction.end_date)
  }
  return map
})

function clearFilters() {
  filters.search = ''
  filters.minCurrentPrice = ''
  filters.maxCurrentPrice = ''
  filters.hasBuyNow = false
  filters.page = 1
}

const hasActiveFilters = computed(() => (
  !!filters.search ||
  filters.minCurrentPrice !== '' ||
  filters.maxCurrentPrice !== '' ||
  filters.hasBuyNow
))

// ── Paginación ─────────────────────────────────────────────────────────────────
const pageWindow = computed(() => {
  const pages = []
  for (let p = Math.max(1, filters.page - 2); p <= Math.min(totalPages.value, filters.page + 2); p++) pages.push(p)
  return pages
})
function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  filters.page = p
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Watchers ───────────────────────────────────────────────────────────────────
let searchTimeout = null
watch(() => filters.search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { filters.page = 1; fetchAuctions() }, 350)
})
watch([
  () => filters.minCurrentPrice,
  () => filters.maxCurrentPrice,
  () => filters.hasBuyNow,
  () => filters.sort,
  () => filters.page,
], () => fetchAuctions())

let unsubAuctions = null

function onAuctionEvent(e) {
  if (!e?.record) return
  const idx = auctions.value.findIndex(a => a.id === e.record.id)
  if (e.action === 'delete') {
    if (idx !== -1) auctions.value.splice(idx, 1)
    return
  }
  // Solo nos interesan subastas activas en este listado
  if (e.record.status !== 'active') {
    if (idx !== -1) auctions.value.splice(idx, 1)
    return
  }
  if (idx !== -1) {
    // Preservar expand (store)
    const prev = auctions.value[idx]
    auctions.value[idx] = { ...prev, ...e.record, expand: prev.expand }
  }
}

onMounted(() => {
  fetchAuctions()
  ticker = setInterval(() => { now.value = Date.now() }, 1000)
  unsubAuctions = subscribeToAuction('*', onAuctionEvent)
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  if (unsubAuctions) unsubAuctions()
})
</script>

<template>
  <AppNavbar />

  <main class="auctions-shell text-[#f0ede8]">

    <!-- ══ HERO ══════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden border-b border-[#1a1a1a]">
      <div class="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_bottom_right,#1f1508_0%,#0a0a0a_55%)] opacity-80" />
      <div
        class="absolute inset-0 pointer-events-none opacity-[0.04]"
        style="background-image:linear-gradient(#c9a96e 1px,transparent 1px),linear-gradient(90deg,#c9a96e 1px,transparent 1px);background-size:72px 72px;"
      />
      <div class="relative max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-14 md:py-20">
        <div class="max-w-xl">
          <p class="section-label mb-3">En vivo</p>
          <h1 class="font-display text-4xl md:text-6xl font-light leading-[0.95] mb-4">
            Subastas activas
          </h1>
          <p class="text-[#6f6a61] text-sm leading-relaxed">
            Participa en subastas en tiempo real. Haz tu oferta antes de que termine el tiempo
            y llévate productos únicos al mejor precio.
          </p>
        </div>
      </div>
    </section>

    <!-- ══ BARRA DE FILTROS ═══════════════════════════════════════ -->
    <section class="w-full border-b border-[#1a1a1a] bg-[#0c0c0c] sticky top-[57px] z-40">
      <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3">
        <div class="flex flex-wrap items-center gap-2.5">

          <!-- Buscador -->
          <div class="relative flex-1 min-w-[180px] max-w-xs">
            <input
              v-model="filters.search"
              type="text"
              placeholder="Buscar subasta..."
              class="input-dark pr-9 text-sm h-9 w-full"
            />
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#444440] pointer-events-none"
              fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" stroke-linecap="round"/>
            </svg>
          </div>

          <!-- Ordenar -->
          <div class="relative">
            <select v-model="filters.sort" @change="filters.page = 1" class="filter-select">
              <option value="end_date">Terminan pronto</option>
              <option value="-end_date">Terminan más tarde</option>
              <option value="current_price">Menor precio actual</option>
              <option value="-current_price">Mayor precio actual</option>
              <option value="start_price">Menor precio base</option>
              <option value="-created">Más recientes</option>
            </select>
            <svg class="select-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <!-- Rango de precio actual -->
          <input
            v-model="filters.minCurrentPrice"
            @input="filters.page = 1"
            type="number"
            min="0"
            step="1"
            placeholder="Precio mín"
            class="input-dark text-sm h-9 w-28"
          />
          <input
            v-model="filters.maxCurrentPrice"
            @input="filters.page = 1"
            type="number"
            min="0"
            step="1"
            placeholder="Precio máx"
            class="input-dark text-sm h-9 w-28"
          />

          <label class="filter-chip"><input v-model="filters.hasBuyNow" @change="filters.page = 1" type="checkbox"><span>Cómpralo ya</span></label>

          <!-- Limpiar -->
          <button
            v-if="hasActiveFilters"
            @click="clearFilters"
            class="h-9 px-3 text-[10px] tracking-[0.15em] uppercase text-[#666259] border border-[#252520] hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors whitespace-nowrap"
          >Limpiar</button>

          <!-- Contador -->
          <span class="ml-auto text-[10px] tracking-[0.18em] uppercase text-[#383835] hidden sm:block whitespace-nowrap">
            {{ totalItems }} subasta{{ totalItems !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>
    </section>

    <!-- ══ CONTENIDO ══════════════════════════════════════════════ -->
    <section class="w-full">
      <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10">

        <!-- Error -->
        <div v-if="error" class="border border-red-900/30 bg-red-950/10 p-8 text-center mb-6">
          <p class="text-red-400 text-sm mb-4">{{ error }}</p>
          <button @click="fetchAuctions" class="btn-outline text-xs">Reintentar</button>
        </div>

        <!-- Skeleton -->
        <div v-else-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="i in 6" :key="i" class="card-dark overflow-hidden">
            <div class="skeleton h-48 w-full" />
            <div class="p-5 space-y-3">
              <div class="skeleton h-3 w-2/3" />
              <div class="skeleton h-4 w-full" />
              <div class="skeleton h-3 w-1/2" />
              <div class="skeleton h-px w-full mt-2" />
              <div class="flex justify-between pt-1">
                <div class="skeleton h-6 w-28" />
                <div class="skeleton h-6 w-20" />
              </div>
            </div>
          </div>
        </div>

        <!-- Sin resultados -->
        <div v-else-if="!auctions.length" class="flex flex-col items-center py-24 border border-[#141414]">
          <svg class="w-10 h-10 text-[#252520] mb-5" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
            <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p class="font-display text-2xl font-light text-[#444440] mb-2">Sin subastas activas</p>
          <p class="text-[#333330] text-xs tracking-widest uppercase mb-6">
            {{ hasActiveFilters ? 'Intenta con otra búsqueda' : 'No hay subastas en curso ahora mismo' }}
          </p>
          <button v-if="hasActiveFilters" @click="clearFilters" class="btn-outline text-xs">Limpiar filtros</button>
        </div>

        <!-- Grid de subastas -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <RouterLink
            v-for="auction in auctions"
            :key="auction.id"
            :to="`/auctions/${auction.id}`"
            class="card-dark group flex flex-col overflow-hidden cursor-pointer"
          >
            <!-- Imagen -->
            <div class="relative h-48 bg-[#0f0f0f] overflow-hidden shrink-0">
              <img
                v-if="auctionImageUrl(auction)"
                :src="auctionImageUrl(auction)"
                :alt="auction.title"
                  loading="lazy"
                  decoding="async"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                class="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center"
                style="background:linear-gradient(135deg,#111111 0%,#14110d 100%);"
              >
                <svg class="w-12 h-12 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                  <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <!-- Gradiente inferior -->
              <div class="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

              <!-- Countdown badge superpuesto -->
              <div class="absolute bottom-3 left-3 right-3">
                <div v-if="!countdownById[auction.id]?.expired" class="flex items-center gap-1.5">
                  <svg class="w-3 h-3 shrink-0" :class="urgencyClass(auction.end_date)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="font-mono text-[11px] font-semibold tabular-nums" :class="urgencyClass(auction.end_date)">
                    <template v-if="countdownById[auction.id]?.days > 0">
                      {{ countdownById[auction.id]?.days }}d {{ pad(countdownById[auction.id]?.hours || 0) }}h {{ pad(countdownById[auction.id]?.minutes || 0) }}m
                    </template>
                    <template v-else>
                      {{ pad(countdownById[auction.id]?.hours || 0) }}:{{ pad(countdownById[auction.id]?.minutes || 0) }}:{{ pad(countdownById[auction.id]?.seconds || 0) }}
                    </template>
                  </span>
                </div>
                <span v-else class="text-[11px] tracking-wider uppercase text-[#555550]">Finalizada</span>
              </div>

              <!-- Badge pujas -->
              <div v-if="auction.bids_count > 0" class="absolute top-3 left-3">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-wide uppercase bg-black/70 border border-[#222] text-[#c9a96e]">
                  <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
                  </svg>
                  {{ auction.bids_count }} puja{{ auction.bids_count !== 1 ? 's' : '' }}
                </span>
              </div>
            </div>

            <!-- Cuerpo -->
            <div class="p-5 flex flex-col gap-3 flex-1">

              <!-- Tienda -->
              <div v-if="auction.expand?.store" class="flex items-center gap-2">
                <div class="w-5 h-5 shrink-0 border border-[#222] bg-[#111] overflow-hidden">
                  <img
                    v-if="storeLogoUrl(auction.expand.store)"
                    :src="storeLogoUrl(auction.expand.store)"
                    :alt="auction.expand.store.name"
                    class="w-full h-full object-cover"
                  />
                  <span v-else class="w-full h-full flex items-center justify-center text-[8px] text-[#2a2520]">
                    {{ storeInitials(auction.expand.store.name).charAt(0) }}
                  </span>
                </div>
                <RouterLink
                  :to="`/stores/${auction.expand.store.slug || auction.expand.store.id}`"
                  class="text-[10px] tracking-[0.12em] uppercase text-[#4a4845] hover:text-[#c9a96e] transition-colors truncate"
                  @click.stop
                >
                  {{ auction.expand.store.name }}
                </RouterLink>
              </div>

              <!-- Título -->
              <h3 class="text-sm font-medium text-[#e8e4de] leading-snug line-clamp-2 group-hover:text-[#c9a96e] transition-colors duration-200">
                {{ auction.title }}
              </h3>

              <div class="mt-auto pt-3 border-t border-[#141414]">
                <div class="flex items-end justify-between gap-2">

                  <!-- Precio actual -->
                  <div>
                    <p class="text-[9px] tracking-widest uppercase text-[#444440] mb-0.5">
                      {{ auction.bids_count > 0 ? 'Oferta actual' : 'Precio base' }}
                    </p>
                    <p class="text-xl font-semibold text-[#c9a96e] tabular-nums">
                      ${{ Number(auction.current_price || auction.start_price || 0).toLocaleString('es-CL') }}
                    </p>
                    <p v-if="auction.current_price && auction.current_price > auction.start_price" class="text-[10px] text-[#3a3835] tabular-nums">
                      Base: ${{ Number(auction.start_price || 0).toLocaleString('es-CL') }}
                    </p>
                  </div>

                  <!-- Buy now -->
                  <div v-if="auction.buy_now_price" class="text-right">
                    <p class="text-[9px] tracking-widest uppercase text-[#444440] mb-0.5">Cómpralo ya</p>
                    <p class="text-sm font-medium text-[#8a8580] tabular-nums">
                      ${{ Number(auction.buy_now_price).toLocaleString('es-CL') }}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </RouterLink>
        </div>

        <!-- ══ PAGINACIÓN ═══════════════════════════════════════ -->
        <div v-if="!loading && totalPages > 1" class="mt-10 flex items-center justify-center gap-1">
          <button @click="goPage(filters.page - 1)" :disabled="filters.page === 1" class="page-btn" aria-label="Anterior">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <button v-if="pageWindow[0] > 1" @click="goPage(1)" class="page-btn">1</button>
          <span v-if="pageWindow[0] > 2" class="text-[#2a2a28] text-xs px-1">…</span>

          <button v-for="p in pageWindow" :key="p" @click="goPage(p)"
            :class="['page-btn', p === filters.page && 'page-btn--active']">{{ p }}</button>

          <span v-if="pageWindow[pageWindow.length - 1] < totalPages - 1" class="text-[#2a2a28] text-xs px-1">…</span>
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
.auctions-shell {
  background: linear-gradient(180deg, #0a0a0a 0%, #090909 40%, #0a0a0a 100%);
  flex: 1;
  width: 100%;
  overflow-x: hidden;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  height: 2.25rem;
  padding: 0 0.85rem;
  border: 1px solid #252520;
  background: transparent;
  color: #5a5752;
  font-size: 0.625rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}
.filter-chip:hover {
  border-color: #3a3a35;
  color: #8a8580;
}
.filter-chip input {
  display: none;
}
.filter-chip:has(input:checked) {
  border-color: #c9a96e;
  color: #c9a96e;
  background: rgba(201, 169, 110, 0.07);
}
.filter-select {
  appearance: none; -webkit-appearance: none;
  background-color: #0a0a0a; border: 1px solid #2a2a2a;
  color: #f0ede8; font-size: 0.8125rem;
  padding: 0 2.25rem 0 0.75rem; height: 2.25rem;
  outline: none; cursor: pointer; transition: border-color 0.2s;
  white-space: nowrap; min-width: 12rem;
}
.filter-select:focus { border-color: #c9a96e; }
.filter-select option { background-color: #111111; color: #f0ede8; }
.select-chevron {
  position: absolute; right: 0.625rem; top: 50%; transform: translateY(-50%);
  width: 0.875rem; height: 0.875rem; color: #444440; pointer-events: none;
}
.page-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 2rem; height: 2rem; padding: 0 0.4rem;
  font-size: 0.7rem; letter-spacing: 0.06em; color: #555550;
  border: 1px solid #1e1e1e; background: #101010; cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.page-btn:hover:not(:disabled) { border-color: #c9a96e44; color: #c9a96e; }
.page-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.page-btn--active { border-color: #c9a96e !important; color: #c9a96e !important; background: #14110d; }
</style>
