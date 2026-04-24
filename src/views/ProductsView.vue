<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
import AppFooter from '@/components/AppFooter.vue'

const route  = useRoute()
const router = useRouter()

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '/api').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

// ── Estado ────────────────────────────────────────────────────────────────────
const products    = ref([])
const totalItems  = ref(0)
const totalPages  = ref(1)
const loading     = ref(false)
const error       = ref('')
const categories  = ref([])

const filters = reactive({
  search:     '',
  categoryId: '',
  condition:  '',
  minPrice:   '',
  maxPrice:   '',
  inStock:    false,
  featured:   false,
  discounted: false,
  sort:       '-created',
  page:       1,
  perPage:    16,
})

let abortController = null

// ── Fetch categorías ───────────────────────────────────────────────────────────
async function fetchCategories() {
  const cacheKey = 'tt_categories_cache_v1'
  const cacheTtlMs = 5 * 60 * 1000
  try {
    const cachedRaw = sessionStorage.getItem(cacheKey)
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw)
      if (Array.isArray(cached?.items) && Date.now() - Number(cached?.ts || 0) < cacheTtlMs) {
        categories.value = cached.items
        return
      }
    }

    const res  = await fetch(`${API}/products/categories`)
    if (!res.ok) return
    const data = await res.json()
    categories.value = data.items || []
    sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items: categories.value }))
  } catch { /* silencioso */ }
}

// ── Fetch productos ────────────────────────────────────────────────────────────
async function fetchProducts() {
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
    if (filters.search)     params.set('search',     filters.search)
    if (filters.categoryId) params.set('categoryId', filters.categoryId)
    if (filters.condition)  params.set('condition',  filters.condition)
    if (filters.minPrice !== '') params.set('minPrice', String(filters.minPrice))
    if (filters.maxPrice !== '') params.set('maxPrice', String(filters.maxPrice))
    if (filters.inStock)    params.set('inStock', 'true')
    if (filters.featured)   params.set('featured', 'true')
    if (filters.discounted) params.set('discounted', 'true')

    syncQueryWithFilters()

    const res  = await fetch(`${API}/products?${params}`, { signal: abortController.signal })
    if (!res.ok) throw new Error(`Error ${res.status}`)
    const data = await res.json()

    products.value = (data.items || []).map((product) => {
      const pricing = formatPrice(product.price, product.discount_percent, product.discount_amount)
      return {
        ...product,
        _imageUrl: productImageUrl(product),
        _pricing: pricing,
      }
    })
    totalItems.value = data.totalItems || 0
    totalPages.value = data.totalPages || 1
  } catch (err) {
    if (err?.name === 'AbortError') return
    error.value    = 'No se pudieron cargar los productos. Verifica que el backend esté activo.'
    products.value = []
  } finally {
    loading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function productImageUrl(product) {
  const imgs = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])
  const img  = imgs[0]
  if (!img) return null
  return `${PB}/api/files/products/${product.id}/${img}?thumb=400x400`
}

function formatPrice(price, pct, amt) {
  const base  = Number(price || 0)
  let   final = base
  if (pct > 0)      final = base * (1 - pct / 100)
  else if (amt > 0) final = Math.max(0, base - amt)
  return { base, final: Math.round(final * 100) / 100, hasDiscount: final < base }
}

const conditionLabel = { new: 'Nuevo', used: 'Usado', refurbished: 'Reacond.' }

const hasActiveFilters = computed(() => (
  filters.search ||
  filters.categoryId ||
  filters.condition ||
  filters.minPrice !== '' ||
  filters.maxPrice !== '' ||
  filters.inStock ||
  filters.featured ||
  filters.discounted
))

function syncQueryWithFilters() {
  const query = {}
  if (filters.search) query.search = filters.search
  if (filters.categoryId) query.categoryId = filters.categoryId
  if (filters.condition) query.condition = filters.condition
  if (filters.minPrice !== '') query.minPrice = String(filters.minPrice)
  if (filters.maxPrice !== '') query.maxPrice = String(filters.maxPrice)
  if (filters.inStock) query.inStock = '1'
  if (filters.featured) query.featured = '1'
  if (filters.discounted) query.discounted = '1'
  if (filters.sort !== '-created') query.sort = filters.sort
  if (filters.page > 1) query.page = String(filters.page)
  router.replace({ query })
}

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
  searchTimeout = setTimeout(() => { filters.page = 1; fetchProducts() }, 350)
})
watch([
  () => filters.categoryId,
  () => filters.condition,
  () => filters.minPrice,
  () => filters.maxPrice,
  () => filters.inStock,
  () => filters.featured,
  () => filters.discounted,
  () => filters.sort,
  () => filters.page,
], () => fetchProducts())

// Categoría activa (nombre para mostrar el chip)
const activeCategoryName = ref('')

function clearFilters() {
  filters.search        = ''
  filters.categoryId    = ''
  filters.condition     = ''
  filters.minPrice      = ''
  filters.maxPrice      = ''
  filters.inStock       = false
  filters.featured      = false
  filters.discounted    = false
  filters.page          = 1
  activeCategoryName.value = ''
  router.replace({ query: {} })
}

onMounted(() => {
  if (route.query.search) filters.search = String(route.query.search)
  if (route.query.categoryId) {
    filters.categoryId = String(route.query.categoryId)
    activeCategoryName.value = route.query.categoryName ? String(route.query.categoryName) : ''
  }
  if (route.query.condition) filters.condition = String(route.query.condition)
  if (route.query.minPrice) filters.minPrice = String(route.query.minPrice)
  if (route.query.maxPrice) filters.maxPrice = String(route.query.maxPrice)
  if (route.query.inStock === '1') filters.inStock = true
  if (route.query.featured === '1') filters.featured = true
  if (route.query.discounted === '1') filters.discounted = true
  if (route.query.sort) filters.sort = String(route.query.sort)
  if (route.query.page) filters.page = Math.max(1, Number(route.query.page) || 1)

  fetchCategories()
  fetchProducts()
})
</script>

<template>
  <AppNavbar />

  <main class="products-shell text-[#f0ede8]">

    <!-- ══ HERO ══════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden border-b border-[#1a1a1a]">
      <div class="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,#1a1f2e_0%,#0a0a0a_55%)] opacity-80" />
      <div
        class="absolute inset-0 pointer-events-none opacity-[0.04]"
        style="background-image:linear-gradient(#c9a96e 1px,transparent 1px),linear-gradient(90deg,#c9a96e 1px,transparent 1px);background-size:72px 72px;"
      />
      <div class="relative max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-14 md:py-20">
        <div class="max-w-xl">
          <p class="section-label mb-3">Catálogo</p>
          <h1 class="font-display text-4xl md:text-6xl font-light leading-[0.95] mb-4">
            {{ activeCategoryName || 'Todos los productos' }}
          </h1>
          <p class="text-[#6f6a61] text-sm leading-relaxed">
            Explora el catálogo completo de productos disponibles. Encuentra lo que necesitas
            y compra directamente a vendedores de confianza.
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
              placeholder="Buscar producto..."
              class="input-dark pr-9 text-sm h-9 w-full"
            />
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#444440] pointer-events-none"
              fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" stroke-linecap="round"/>
            </svg>
          </div>

          <!-- Chip categoría activa (desde home) -->
          <div v-if="activeCategoryName" class="flex items-center gap-1.5 h-9 px-3 border border-[#c9a96e44] bg-[#14110d] text-[#c9a96e] text-[10px] tracking-[0.12em] uppercase">
            <span>{{ activeCategoryName }}</span>
            <button @click="clearFilters" class="ml-0.5 text-[#c9a96e]/50 hover:text-[#c9a96e] transition-colors leading-none" aria-label="Quitar filtro">✕</button>
          </div>

          <!-- Categoría -->
          <div v-if="categories.length" class="relative">
            <select v-model="filters.categoryId" @change="filters.page = 1; activeCategoryName = ''" class="filter-select">
              <option value="">Todas las categorías</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
            <svg class="select-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <!-- Condición -->
          <div class="relative">
            <select v-model="filters.condition" @change="filters.page = 1" class="filter-select">
              <option value="">Cualquier condición</option>
              <option value="new">Nuevo</option>
              <option value="used">Usado</option>
              <option value="refurbished">Reacondicionado</option>
            </select>
            <svg class="select-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <!-- Rango de precio -->
          <input
            v-model="filters.minPrice"
            @input="filters.page = 1"
            type="number"
            min="0"
            step="1"
            placeholder="Precio mín"
            class="input-dark text-sm h-9 w-28"
          />
          <input
            v-model="filters.maxPrice"
            @input="filters.page = 1"
            type="number"
            min="0"
            step="1"
            placeholder="Precio máx"
            class="input-dark text-sm h-9 w-28"
          />

          <!-- Toggles -->
          <label class="filter-chip"><input v-model="filters.inStock" @change="filters.page = 1" type="checkbox"><span>Con stock</span></label>
          <label class="filter-chip"><input v-model="filters.featured" @change="filters.page = 1" type="checkbox"><span>Destacados</span></label>
          <label class="filter-chip"><input v-model="filters.discounted" @change="filters.page = 1" type="checkbox"><span>Ofertas</span></label>

          <!-- Ordenar -->
          <div class="relative">
            <select v-model="filters.sort" @change="filters.page = 1" class="filter-select">
              <option value="-created">Más recientes</option>
              <option value="price">Menor precio</option>
              <option value="-price">Mayor precio</option>
              <option value="name">Nombre A–Z</option>
              <option value="-name">Nombre Z–A</option>
            </select>
            <svg class="select-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <!-- Limpiar -->
          <button
            v-if="hasActiveFilters"
            @click="clearFilters"
            class="h-9 px-3 text-[10px] tracking-[0.15em] uppercase text-[#666259] border border-[#252520] hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors whitespace-nowrap"
          >Limpiar</button>

          <!-- Contador -->
          <span class="ml-auto text-[10px] tracking-[0.18em] uppercase text-[#383835] hidden sm:block whitespace-nowrap">
            {{ totalItems }} producto{{ totalItems !== 1 ? 's' : '' }}
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
          <button @click="fetchProducts" class="btn-outline text-xs">Reintentar</button>
        </div>

        <!-- Skeleton -->
        <div v-else-if="loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div v-for="i in 10" :key="i" class="card-dark overflow-hidden">
            <div class="skeleton aspect-square w-full" />
            <div class="p-4 space-y-2">
              <div class="skeleton h-2.5 w-3/4" />
              <div class="skeleton h-3 w-full" />
              <div class="skeleton h-3 w-5/6" />
              <div class="skeleton h-4 w-1/3 mt-2" />
            </div>
          </div>
        </div>

        <!-- Sin resultados -->
        <div v-else-if="!products.length" class="flex flex-col items-center py-24 border border-[#141414]">
          <svg class="w-10 h-10 text-[#252520] mb-5" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p class="font-display text-2xl font-light text-[#444440] mb-2">Sin productos</p>
          <p class="text-[#333330] text-xs tracking-widest uppercase mb-6">
            {{ hasActiveFilters ? 'Intenta con otros filtros' : 'Aún no hay productos activos' }}
          </p>
          <button v-if="hasActiveFilters" @click="clearFilters" class="btn-outline text-xs">Limpiar filtros</button>
        </div>

        <!-- Grid -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <RouterLink
            v-for="product in products"
            :key="product.id"
            :to="`/products/${product.id}`"
            class="card-dark group flex flex-col overflow-hidden"
          >
            <!-- Imagen -->
            <div class="relative aspect-square bg-[#0f0f0f] overflow-hidden">
              <img
                v-if="product._imageUrl"
                :src="product._imageUrl"
                :alt="product.name"
                loading="lazy"
                decoding="async"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center"
                style="background:linear-gradient(135deg,#111111 0%,#14110d 100%);"
              >
                <svg class="w-10 h-10 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>

              <!-- Badges -->
              <div class="absolute top-2 left-2 flex flex-col gap-1">
                <span v-if="product.featured" class="badge-gold text-[9px]">Destacado</span>
                <span
                  v-if="product._pricing.hasDiscount"
                  class="inline-flex items-center px-1.5 py-0.5 text-[9px] tracking-widest uppercase bg-red-900/60 text-red-300 border border-red-800/40"
                >Oferta</span>
              </div>

              <!-- Condición -->
              <div v-if="product.condition" class="absolute bottom-2 right-2">
                <span class="inline-flex items-center px-1.5 py-0.5 text-[9px] tracking-widest uppercase bg-black/60 text-[#6f6a61] border border-[#1e1e1e]/60">
                  {{ conditionLabel[product.condition] || product.condition }}
                </span>
              </div>
            </div>

            <!-- Cuerpo -->
            <div class="p-3 flex flex-col gap-1.5 flex-1">
              <!-- Tienda + categoría -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <span v-if="product.expand?.category?.name" class="text-[10px] tracking-[0.12em] uppercase text-[#c9a96e]/60 truncate">
                  {{ product.expand.category.name }}
                </span>
                <span v-if="product.expand?.store?.name" class="text-[10px] text-[#3a3835] truncate">
                  · {{ product.expand.store.name }}
                </span>
              </div>

              <!-- Nombre -->
              <h3 class="text-[12px] font-medium text-[#d8d4ce] leading-snug line-clamp-2 group-hover:text-[#c9a96e] transition-colors duration-200">
                {{ product.name }}
              </h3>

              <!-- Precio -->
              <div class="mt-auto pt-2 flex items-baseline gap-2">
                <span class="text-sm font-semibold text-[#c9a96e] tabular-nums">
                  ${{ product._pricing.final.toLocaleString('es-CL') }}
                </span>
                <span
                  v-if="product._pricing.hasDiscount"
                  class="text-[10px] text-[#444440] line-through tabular-nums"
                >
                  ${{ Number(product.price || 0).toLocaleString('es-CL') }}
                </span>
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
.products-shell {
  background: linear-gradient(180deg, #0a0a0a 0%, #090909 40%, #0a0a0a 100%);
  flex: 1;
  width: 100%;
  overflow-x: hidden;
}
.filter-select {
  appearance: none; -webkit-appearance: none;
  background-color: #0a0a0a; border: 1px solid #2a2a2a;
  color: #f0ede8; font-size: 0.8125rem;
  padding: 0 2.25rem 0 0.75rem; height: 2.25rem;
  outline: none; cursor: pointer; transition: border-color 0.2s;
  white-space: nowrap; min-width: 11rem;
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
