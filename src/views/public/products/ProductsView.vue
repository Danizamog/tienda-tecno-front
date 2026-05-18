<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import QuickViewModal from '@/components/ui/QuickViewModal.vue'
import { vTilt } from '@/composables/useTilt3D'

const route  = useRoute()
const router = useRouter()

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
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
      const pct    = Number(product.discount_percent || 0)
      const amt    = Number(product.discount_amount  || 0)
      const pricing = formatPrice(product.price, pct, amt)
      const label  = pct > 0 ? `-${pct}%` : amt > 0 && pricing.hasDiscount ? `-${amt.toLocaleString('es-CL')}` : ''
      return {
        ...product,
        _imageUrl: productImageUrl(product),
        _pricing:  { ...pricing, label },
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
  return `${PB}/api/files/products/${product.id}/${img}?thumb=600x800`
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

// ── Quick View ────────────────────────────────────────────────────────────────
const quickViewProduct = ref(null)
function openQuickView(product, evt) {
  if (evt) { evt.preventDefault(); evt.stopPropagation() }
  const card = evt?.currentTarget?.closest('.product-card')
  if (card) {
    card.classList.add('is-qv-expanding')
    card.addEventListener('animationend', () => card.classList.remove('is-qv-expanding'), { once: true })
  }
  quickViewProduct.value = product
}
function closeQuickView() { quickViewProduct.value = null }

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

  <main class="products-shell text-text-primary">

    <!-- ══ HERO ══════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden border-b border-border-subtle">
      <div class="absolute inset-0 pointer-events-none" style="background:radial-gradient(ellipse at 70% 0%, var(--accent-soft) 0%, transparent 55%);opacity:0.6;" />
      <div class="absolute inset-0 pointer-events-none opacity-[0.04]"
        style="background-image:linear-gradient(var(--border-default) 1px,transparent 1px),linear-gradient(90deg,var(--border-default) 1px,transparent 1px);background-size:80px 80px;" />
      <div class="relative max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-16 md:py-24">
        <div class="max-w-2xl">
          <p class="section-label mb-5">Catálogo</p>
          <h1 class="font-display font-light leading-[0.95] mb-5" style="font-size:clamp(2.8rem,6vw,5rem);">
            <template v-if="activeCategoryName">{{ activeCategoryName }}</template>
            <template v-else>Todos los <span class="block italic text-accent" style="font-weight:400;">productos</span></template>
          </h1>
          <p class="text-text-muted text-sm md:text-base leading-relaxed max-w-lg">
            Explora el catálogo completo de productos disponibles. Encuentra lo que necesitas
            y compra directamente a vendedores verificados.
          </p>
        </div>
      </div>
    </section>

    <!-- ══ BARRA DE FILTROS ═══════════════════════════════════════ -->
    <section class="w-full border-b border-border-subtle bg-surface-sunken sticky top-[57px] z-40">
      <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3">
        <div class="flex flex-wrap items-center gap-2.5">

          <!-- Buscador -->
          <div class="relative flex-1 min-w-[180px] max-w-xs">
            <input
              v-model="filters.search"
              type="text"
              placeholder="Buscar producto..."
              class="filter-input pr-9 w-full"
            />
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-disabled pointer-events-none"
              fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" stroke-linecap="round"/>
            </svg>
          </div>

          <!-- Chip categoría activa (desde home) -->
          <div v-if="activeCategoryName" class="flex items-center gap-1.5 h-9 px-3 border border-[var(--accent)44] bg-[var(--accent-soft)] text-accent text-[10px] tracking-[0.12em] uppercase">
            <span>{{ activeCategoryName }}</span>
            <button @click="clearFilters" class="ml-0.5 text-accent/50 hover:text-accent transition-colors leading-none" aria-label="Quitar filtro">✕</button>
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
            class="filter-input w-28"
          />
          <input
            v-model="filters.maxPrice"
            @input="filters.page = 1"
            type="number"
            min="0"
            step="1"
            placeholder="Precio máx"
            class="filter-input w-28"
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
            class="h-9 px-3 text-[10px] tracking-[0.15em] uppercase text-text-muted border border-[var(--text-disabled)] hover:border-[var(--accent)44] hover:text-accent transition-colors whitespace-nowrap"
          >Limpiar</button>

          <!-- Contador -->
          <span class="ml-auto text-[10px] tracking-[0.18em] uppercase text-text-disabled hidden sm:block whitespace-nowrap">
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
        <div v-else-if="!products.length" class="flex flex-col items-center py-24 border border-[var(--surface-overlay)]">
          <svg class="w-10 h-10 text-text-disabled mb-5" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p class="font-display text-2xl font-light text-text-disabled mb-2">Sin productos</p>
          <p class="text-text-disabled text-xs tracking-widest uppercase mb-6">
            {{ hasActiveFilters ? 'Intenta con otros filtros' : 'Aún no hay productos activos' }}
          </p>
          <button v-if="hasActiveFilters" @click="clearFilters" class="btn-outline text-xs">Limpiar filtros</button>
        </div>

        <!-- Grid -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-5">
          <RouterLink
            v-for="product in products"
            :key="product.id"
            :to="`/products/${product.id}`"
            v-tilt="{ max: 6, scale: 1.012 }"
            class="product-card group"
          >
            <div class="product-media aspect-[3/4]">
              <img
                v-if="product._imageUrl"
                :src="product._imageUrl"
                :alt="product.name"
                loading="lazy"
                decoding="async"
                class="w-full h-full object-cover"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center"
                style="background:linear-gradient(135deg,var(--surface-raised) 0%,var(--accent-soft) 100%);"
              >
                <svg class="w-10 h-10 text-text-disabled" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>

              <!-- Category tag — top-left via CSS -->
              <span v-if="product.expand?.category?.name" class="product-tag">{{ product.expand.category.name }}</span>

              <!-- Badges — bottom-left, no overlap con category tag -->
              <div class="absolute bottom-12 left-2 flex flex-col gap-1 z-10">
                <span v-if="product.featured" class="badge-gold text-[9px]">Destacado</span>
                <span v-if="product._pricing.hasDiscount && product._pricing.label"
                  class="inline-flex items-center px-2 py-0.5 text-[10px] tracking-widest uppercase bg-red-600 text-white font-bold border border-red-500/60">
                  {{ product._pricing.label }}
                </span>
              </div>

              <!-- Quick view button — top-right, appears on hover -->
              <button
                type="button"
                class="absolute top-2.5 right-2.5 z-10 w-8 h-8 flex items-center justify-center bg-black/65 border border-white/10 text-text-primary backdrop-blur opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-accent hover:text-accent-on hover:border-accent"
                aria-label="Vista rápida"
                @click="openQuickView(product, $event)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
              </button>

              <div class="product-overlay">
                <span class="product-cta">
                  Ver producto
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
                </span>
              </div>
            </div>

            <div class="p-4 flex flex-col gap-1.5 flex-1">
              <p class="text-[9px] tracking-[0.18em] uppercase text-text-muted truncate">{{ product.expand?.store?.name || '—' }}</p>
              <h3 class="text-sm text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors duration-300">{{ product.name }}</h3>
              <div class="mt-auto pt-1.5">
                <div v-if="product._pricing.hasDiscount" class="flex items-center gap-1.5 mb-0.5">
                  <span class="text-[9px] tracking-widest uppercase font-bold text-red-400 bg-red-900/20 border border-red-900/40 px-1.5 py-0.5">
                    {{ product._pricing.label }}
                  </span>
                  <span class="text-text-disabled text-[11px] line-through tabular-nums">
                    ${{ Number(product.price || 0).toLocaleString('es-CL') }}
                  </span>
                </div>
                <span class="font-display text-xl font-medium text-accent tabular-nums">
                  ${{ product._pricing.final.toLocaleString('es-CL') }}
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
          <span v-if="pageWindow[0] > 2" class="text-text-disabled text-xs px-1">…</span>

          <button v-for="p in pageWindow" :key="p" @click="goPage(p)"
            :class="['page-btn', p === filters.page && 'page-btn--active']">{{ p }}</button>

          <span v-if="pageWindow[pageWindow.length - 1] < totalPages - 1" class="text-text-disabled text-xs px-1">…</span>
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

  <QuickViewModal
    :product="quickViewProduct"
    :image-base-url="PB"
    @close="closeQuickView"
  />
</template>

<style scoped>
.products-shell {
  background: linear-gradient(180deg, var(--surface-base) 0%, var(--surface-base) 40%, var(--surface-base) 100%);
  flex: 1;
  width: 100%;
  overflow-x: hidden;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  height: 2.25rem;
  padding: 0 0.85rem;
  border: 1px solid var(--text-disabled);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.625rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}
.filter-chip:hover {
  border-color: var(--border-strong);
  color: var(--text-muted);
}
.filter-chip input {
  display: none;
}
.filter-chip:has(input:checked) {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(201, 169, 110, 0.07);
}
.page-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 2rem; height: 2rem; padding: 0 0.4rem;
  font-size: 0.7rem; letter-spacing: 0.06em; color: var(--text-muted);
  border: 1px solid var(--border-subtle); background: var(--surface-raised); cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.page-btn:hover:not(:disabled) { border-color: var(--accent)44; color: var(--accent); }
.page-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.page-btn--active { border-color: var(--accent) !important; color: var(--accent) !important; background: var(--accent-soft); }
</style>
