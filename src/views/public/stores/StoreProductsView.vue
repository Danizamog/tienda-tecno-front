<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useCartStore } from '@/composables/useCartStore'
import { useWishlistStore } from '@/composables/useWishlistStore'
import { useAuthSession } from '@/composables/useAuthSession'
import { useStoreReviews } from '@/composables/useReviewsApi'
import { useStoreFollowers } from '@/composables/useStoreFollowers'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')
const route = useRoute()

// ── Tab activo ────────────────────────────────────────────────────────────────
const tab = ref('products') // 'products' | 'auctions' | 'reviews'

// ── Reseñas de tienda ─────────────────────────────────────────────────────────
let storeReviewsComp = null

const storeReviews      = ref([])
const storeReviewsTotal = ref(0)
const storeReviewsPages = ref(1)
const storeReviewsPage  = ref(1)
const storeReviewsLoad  = ref(false)
const storeReviewsErr   = ref('')

async function loadStoreReviews(p = 1) {
  if (!store.value?.id) return
  if (!storeReviewsComp) {
    storeReviewsComp = useStoreReviews(store.value.id)
  }
  storeReviewsLoad.value = true
  storeReviewsErr.value  = ''
  storeReviewsPage.value = p
  try {
    await storeReviewsComp.load(p)
    storeReviews.value      = storeReviewsComp.reviews.value
    storeReviewsTotal.value = storeReviewsComp.total.value
    storeReviewsPages.value = storeReviewsComp.totalPages.value
  } catch (e) {
    storeReviewsErr.value = e.message || 'Error al cargar reseñas'
  } finally {
    storeReviewsLoad.value = false
  }
}

function reviewerName(rev) {
  const u = rev.expand?.reviewer
  if (!u) return 'Usuario'
  return u.name || u.username || u.email?.split('@')[0] || 'Usuario'
}

function fmtDateReview(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Estado de tienda ──────────────────────────────────────────────────────────
const store       = ref(null)
const storeError  = ref('')
const storeLoading = ref(true)

// ── Estado de productos ───────────────────────────────────────────────────────
const products    = ref([])
const totalItems  = ref(0)
const totalPages  = ref(1)
const loading     = ref(false)
const error       = ref('')

// ── Estado de categorías ──────────────────────────────────────────────────────
const categories  = ref([])

// ── Estado de subastas ────────────────────────────────────────────────────────
const auctions        = ref([])
const auctionTotal    = ref(0)
const auctionPages    = ref(1)
const auctionLoading  = ref(false)
const auctionError    = ref('')
const auctionSort     = ref('end_date')
const auctionPage     = ref(1)
const now             = ref(Date.now())
let ticker = null

const filters = reactive({
  search:     '',
  categoryId: '',
  condition:  '',
  sort:       '-created',
  page:       1,
  perPage:    12,
})

// ── Fetch tienda ──────────────────────────────────────────────────────────────
async function fetchStore() {
  storeLoading.value = true
  storeError.value   = ''
  try {
    const slug = route.params.slug
    const res  = await fetch(`${API}/stores/by-slug/${encodeURIComponent(slug)}`)
    if (res.status === 404) { storeError.value = 'Tienda no encontrada.'; return }
    if (!res.ok) throw new Error(`Error ${res.status}`)
    store.value = await res.json()
  } catch {
    storeError.value = 'No se pudo cargar la tienda.'
  } finally {
    storeLoading.value = false
  }
}

// ── Fetch categorías ──────────────────────────────────────────────────────────
async function fetchCategories() {
  try {
    const res  = await fetch(`${API}/products/categories`)
    if (!res.ok) return
    const data = await res.json()
    categories.value = data.items || []
  } catch { /* silencioso */ }
}

// ── Fetch productos ───────────────────────────────────────────────────────────
async function fetchProducts() {
  if (!store.value?.id) return
  loading.value = true
  error.value   = ''
  try {
    const params = new URLSearchParams({
      storeId: store.value.id,
      status:  'active',
      page:    filters.page,
      perPage: filters.perPage,
      sort:    filters.sort,
    })
    if (filters.search)     params.set('search',     filters.search)
    if (filters.categoryId) params.set('categoryId', filters.categoryId)
    if (filters.condition)  params.set('condition',  filters.condition)

    const res  = await fetch(`${API}/products?${params}`)
    if (!res.ok) throw new Error(`Error ${res.status}`)
    const data = await res.json()

    products.value   = data.items      || []
    totalItems.value = data.totalItems || 0
    totalPages.value = data.totalPages || 1
  } catch {
    error.value   = 'No se pudieron cargar los productos.'
    products.value = []
  } finally {
    loading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function logoUrl(s) {
  if (!s?.logo) return null
  return `${API}/stores/files/stores/${s.id}/${s.logo}`
}

function bannerUrl(s) {
  if (!s?.banner) return null
  return `${API}/stores/files/stores/${s.id}/${s.banner}`
}

function productImageUrl(product) {
  const imgs = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])
  const img  = imgs[0]
  if (!img) return null
  return `${PB}/api/files/products/${product.id}/${img}?thumb=400x400`
}

function initials(name) {
  return (name || 'TT')
    .trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function ratingStars(rating) {
  const r     = Math.round(Number(rating || 0) * 2) / 2
  const full  = Math.floor(r)
  const half  = r % 1 !== 0
  const empty = 5 - full - (half ? 1 : 0)
  return { full, half, empty }
}

function formatPrice(price, discountPercent, discountAmount) {
  const base = Number(price || 0)
  let final = base
  if (discountPercent > 0) final = base * (1 - discountPercent / 100)
  else if (discountAmount > 0) final = Math.max(0, base - discountAmount)
  return { base, final: Math.round(final * 100) / 100, hasDiscount: final < base }
}

function conditionLabel(c) {
  return { new: 'Nuevo', used: 'Usado', refurbished: 'Reacondicionado' }[c] || c
}

function clearFilters() {
  filters.search     = ''
  filters.categoryId = ''
  filters.condition  = ''
  filters.page       = 1
}

const hasActiveFilters = computed(() =>
  filters.search || filters.categoryId || filters.condition
)

// ── Paginación ─────────────────────────────────────────────────────────────────
const pageWindow = computed(() => {
  const cur   = filters.page
  const total = totalPages.value
  const pages = []
  for (let p = Math.max(1, cur - 2); p <= Math.min(total, cur + 2); p++) pages.push(p)
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

watch([() => filters.categoryId, () => filters.condition, () => filters.sort, () => filters.page], () => {
  fetchProducts()
})

// ── Fetch subastas de la tienda ───────────────────────────────────────────────
async function fetchAuctions() {
  if (!store.value?.id) return
  auctionLoading.value = true
  auctionError.value   = ''
  try {
    const params = new URLSearchParams({
      storeId: store.value.id,
      status:  'active',
      sort:    auctionSort.value,
      page:    auctionPage.value,
      perPage: 12,
    })
    const res  = await fetch(`${API}/auctions?${params}`)
    if (!res.ok) throw new Error(`Error ${res.status}`)
    const data = await res.json()
    auctions.value    = data.items      || []
    auctionTotal.value = data.totalItems || 0
    auctionPages.value = data.totalPages || 1
  } catch {
    auctionError.value = 'No se pudieron cargar las subastas.'
    auctions.value     = []
  } finally {
    auctionLoading.value = false
  }
}

// ── Helpers de subastas ───────────────────────────────────────────────────────
function auctionImageUrl(auction) {
  const imgs = Array.isArray(auction.images) ? auction.images : (auction.images ? [auction.images] : [])
  const img  = imgs[0]
  if (!img) return null
  return `${PB}/api/files/auctions/${auction.id}/${img}?thumb=600x400`
}

function timeLeft(endDateStr) {
  const diff = new Date(endDateStr).getTime() - now.value
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    expired: false,
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
}

function pad(n) { return String(n).padStart(2, '0') }

function urgencyClass(endDateStr) {
  const diff = new Date(endDateStr).getTime() - now.value
  if (diff <= 0)           return 'text-text-muted'
  if (diff < 3600000)      return 'text-red-400'
  if (diff < 86400000)     return 'text-amber-400'
  return 'text-accent'
}

const auctionPageWindow = computed(() => {
  const pages = []
  for (let p = Math.max(1, auctionPage.value - 2); p <= Math.min(auctionPages.value, auctionPage.value + 2); p++) pages.push(p)
  return pages
})

function goAuctionPage(p) {
  if (p < 1 || p > auctionPages.value) return
  auctionPage.value = p
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

watch([auctionSort, auctionPage], () => { if (tab.value === 'auctions') fetchAuctions() })
watch(tab, (t) => {
  if (t === 'auctions' && store.value?.id) fetchAuctions()
  if (t === 'reviews'  && store.value?.id && storeReviews.value.length === 0) loadStoreReviews(1)
})

// Cuando la tienda se carga, traer productos y categorías
watch(store, (s) => { if (s?.id) fetchProducts() })

onMounted(async () => {
  await fetchStore()
  fetchCategories()
  ticker = setInterval(() => { now.value = Date.now() }, 1000)
})

onBeforeUnmount(() => clearInterval(ticker))

// ── Carrito ───────────────────────────────────────────────────────────────────
const { addToCart, itemQuantity } = useCartStore()
const cartAdded = ref({})  // { [productId]: timer }

// ── Wishlist ──────────────────────────────────────────────────────────────────
const { isAuthenticated } = useAuthSession()
const { isInWishlist, toggleWishlist, getWishlistItem, removeFromWishlist, loadWishlist, initialized: wishlistReady } = useWishlistStore()

// Cargar wishlist si el usuario está autenticado y aún no se ha inicializado
if (isAuthenticated.value && !wishlistReady.value) loadWishlist()

// ── Seguir tienda ─────────────────────────────────────────────────────────────
const { isFollowing, toggleFollow, loadStatus: loadFollowStatus, loading: followLoading } = useStoreFollowers()

// Cuando la tienda cargue, verificar si el usuario la sigue
watch(store, (s) => {
  if (s?.id && isAuthenticated.value) loadFollowStatus(s.id)
})

async function handleToggleFollow() {
  if (!store.value?.id) return
  await toggleFollow(store.value.id)
}

async function quickAdd(event, product) {
  event.preventDefault()
  event.stopPropagation()

  if (!store.value?.id) return

  // Enriquecer producto con info de tienda para el cart
  const enriched = {
    ...product,
    expand: { ...product.expand, store: { id: store.value?.id, name: store.value?.name, slug: store.value?.slug } },
    store:  store.value?.id,
  }

  const success = await addToCart(enriched, 1)
  if (!success) return

  // Si estaba en wishlist, quitarlo automáticamente
  const wishItem = getWishlistItem(product.id)
  if (wishItem) removeFromWishlist(wishItem.id, product.id)

  cartAdded.value[product.id] = true
  clearTimeout(cartAdded.value[`_t_${product.id}`])
  cartAdded.value[`_t_${product.id}`] = setTimeout(() => {
    delete cartAdded.value[product.id]
  }, 1800)
}

async function quickToggleWishlist(event, product) {
  event.preventDefault()
  event.stopPropagation()
  if (!isAuthenticated.value) return
  await toggleWishlist(product.id)
}
</script>

<template>
  <AppNavbar />

  <main class="store-shell text-text-primary">

    <!-- ══ ERROR TIENDA ═══════════════════════════════════════════ -->
    <div v-if="storeError" class="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p class="text-text-muted text-sm">{{ storeError }}</p>
      <RouterLink to="/stores" class="btn-outline text-xs">Volver al directorio</RouterLink>
    </div>

    <template v-else>

      <!-- ══ HERO DE LA TIENDA ═══════════════════════════════════ -->
      <section class="relative border-b border-border-subtle overflow-hidden">

        <!-- Banner — altura fija estándar para cualquier imagen -->
        <div class="relative h-44 bg-surface-sunken overflow-hidden">
          <img
            v-if="!storeLoading && bannerUrl(store)"
            :src="bannerUrl(store)"
            :alt="store?.name"
            class="w-full h-full object-cover object-center opacity-50"
          />
          <div
            v-else
            class="absolute inset-0"
            style="background:linear-gradient(135deg,var(--surface-raised) 0%,var(--accent-soft) 100%);"
          />
          <!-- Gradiente inferior -->
          <div class="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--surface-base)] to-transparent pointer-events-none" />
          <!-- Grid decorativo -->
          <div
            class="absolute inset-0 pointer-events-none opacity-[0.04]"
            style="background-image:linear-gradient(var(--accent) 1px,transparent 1px),linear-gradient(90deg,var(--accent) 1px,transparent 1px);background-size:72px 72px;"
          />
        </div>

        <!-- Info superpuesta -->
        <div class="relative max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 -mt-16 pb-8">
          <div class="flex items-end gap-5">

            <!-- Logo -->
            <div class="w-20 h-20 shrink-0 border-2 border-border-subtle bg-surface-raised overflow-hidden shadow-lg">
              <template v-if="storeLoading">
                <div class="skeleton w-full h-full" />
              </template>
              <img
                v-else-if="logoUrl(store)"
                :src="logoUrl(store)"
                :alt="store?.name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center bg-surface-raised">
                <span class="font-display text-2xl font-light text-text-disabled">
                  {{ initials(store?.name) }}
                </span>
              </div>
            </div>

            <!-- Nombre y meta -->
            <div class="flex-1 min-w-0 pb-1">
              <template v-if="storeLoading">
                <div class="skeleton h-7 w-48 mb-2" />
                <div class="skeleton h-3 w-32" />
              </template>
              <template v-else>
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <h1 class="font-display text-2xl md:text-3xl font-light leading-tight">
                    {{ store?.name }}
                  </h1>
                  <span v-if="store?.verified" class="badge-gold">
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-.497 3.842 3.745 3.745 0 01-3.842.497A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.842-.497 3.745 3.745 0 01-.497-3.842A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 01.497-3.842 3.746 3.746 0 013.842-.497A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.842.497 3.746 3.746 0 01.497 3.842A3.745 3.745 0 0121 12z" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Verificada
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-3 text-[11px] text-text-disabled">
                  <!-- Rating -->
                  <span class="flex items-center gap-1">
                    <div class="flex items-center gap-0.5">
                      <template v-for="n in ratingStars(store?.rating).full" :key="`f${n}`">
                        <svg class="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                        </svg>
                      </template>
                      <template v-for="n in ratingStars(store?.rating).empty" :key="`e${n}`">
                        <svg class="w-3 h-3 text-text-disabled" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                        </svg>
                      </template>
                    </div>
                    <span class="tabular-nums">{{ Number(store?.rating || 0).toFixed(1) }}</span>
                    <span class="text-text-disabled">({{ store?.reviews_count || 0 }} reseñas)</span>
                  </span>

                  <!-- Ubicación -->
                  <span v-if="store?.location" class="flex items-center gap-1">
                    <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    {{ store.location }}
                  </span>
                </div>
              </template>
            </div>

            <!-- Botón seguir tienda -->
            <button
              v-if="!storeLoading && store && isAuthenticated"
              @click="handleToggleFollow"
              :disabled="followLoading[store?.id]"
              :class="[
                'flex items-center gap-2 px-4 h-9 text-[11px] tracking-[0.14em] uppercase font-medium border transition-all duration-200 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed',
                isFollowing(store?.id)
                  ? 'bg-[var(--accent)18] border-[var(--accent)66] text-accent hover:bg-[var(--accent)08] hover:border-[var(--accent)33]'
                  : 'bg-accent border-accent text-accent-on hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]',
              ]"
            >
              <svg
                class="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
                :class="isFollowing(store?.id) ? 'scale-110' : ''"
                :fill="isFollowing(store?.id) ? 'currentColor' : 'none'"
                stroke="currentColor"
                stroke-width="2.5"
                viewBox="0 0 24 24"
              >
                <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>{{ isFollowing(store?.id) ? 'Siguiendo' : 'Seguir tienda' }}</span>
            </button>

            <!-- Breadcrumb -->
            <RouterLink
              to="/stores"
              class="hidden md:flex items-center gap-1.5 text-[10px] tracking-[0.15em] uppercase text-text-disabled hover:text-accent transition-colors pb-1 shrink-0"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Directorio
            </RouterLink>
          </div>

          <!-- Descripción -->
          <p
            v-if="!storeLoading && store?.description"
            class="mt-4 text-[12px] text-text-muted leading-relaxed max-w-2xl"
            v-html="store.description"
          />
        </div>
      </section>

      <!-- ══ TABS ════════════════════════════════════════════════ -->
      <section class="w-full border-b border-border-subtle bg-surface-base">
        <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10">
          <div class="flex items-center gap-0">
            <button
              @click="tab = 'products'"
              :class="[
                'px-5 py-3.5 text-[11px] tracking-[0.16em] uppercase border-b-2 transition-colors duration-200',
                tab === 'products'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-disabled hover:text-[var(--accent)88]',
              ]"
            >
              <span class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Productos
              </span>
            </button>
            <button
              @click="tab = 'auctions'"
              :class="[
                'px-5 py-3.5 text-[11px] tracking-[0.16em] uppercase border-b-2 transition-colors duration-200',
                tab === 'auctions'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-disabled hover:text-[var(--accent)88]',
              ]"
            >
              <span class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Subastas
              </span>
            </button>
            <button
              @click="tab = 'reviews'"
              :class="[
                'px-5 py-3.5 text-[11px] tracking-[0.16em] uppercase border-b-2 transition-colors duration-200',
                tab === 'reviews'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-disabled hover:text-[var(--accent)88]',
              ]"
            >
              <span class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Reseñas
                <span v-if="store?.reviews_count > 0" class="px-1.5 py-0.5 text-[8px] bg-[var(--accent)15] text-accent border border-[var(--accent)22]">
                  {{ store.reviews_count }}
                </span>
              </span>
            </button>
          </div>
        </div>
      </section>

      <!-- ══ BARRA DE FILTROS (Productos) ═══════════════════════ -->
      <section v-if="tab === 'products'" class="w-full border-b border-border-subtle bg-surface-sunken sticky top-[57px] z-40">
        <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3">
          <div class="flex flex-wrap items-center gap-2.5">

            <!-- Buscador -->
            <div class="relative flex-1 min-w-[160px] max-w-xs">
              <input
                v-model="filters.search"
                type="text"
                placeholder="Buscar producto..."
                class="input-dark pr-9 text-sm h-9 w-full"
              />
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-disabled pointer-events-none"
                fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35" stroke-linecap="round"/>
              </svg>
            </div>

            <!-- Categoría -->
            <div v-if="categories.length" class="relative">
              <select
                v-model="filters.categoryId"
                @change="filters.page = 1"
                class="filter-select"
              >
                <option value="">Todas las categorías</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </option>
              </select>
              <svg class="select-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>

            <!-- Condición -->
            <div class="relative">
              <select
                v-model="filters.condition"
                @change="filters.page = 1"
                class="filter-select"
              >
                <option value="">Cualquier condición</option>
                <option value="new">Nuevo</option>
                <option value="used">Usado</option>
                <option value="refurbished">Reacondicionado</option>
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
            >
              Limpiar
            </button>

            <!-- Contador -->
            <span class="ml-auto text-[10px] tracking-[0.18em] uppercase text-text-disabled hidden sm:block whitespace-nowrap">
              {{ totalItems }} producto{{ totalItems !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>
      </section>

      <!-- ══ CONTENIDO PRODUCTOS ══════════════════════════════════ -->
      <section v-if="tab === 'products'" class="w-full">
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
                <div class="skeleton h-3 w-3/4" />
                <div class="skeleton h-3 w-1/2" />
                <div class="skeleton h-4 w-1/3 mt-1" />
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
              {{ filters.search || filters.categoryId || filters.condition ? 'Intenta con otros filtros' : 'Esta tienda aún no tiene productos activos' }}
            </p>
            <button v-if="hasActiveFilters" @click="clearFilters" class="btn-outline text-xs">
              Limpiar filtros
            </button>
          </div>

          <!-- Grid de productos -->
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <RouterLink
              v-for="product in products"
              :key="product.id"
              :to="`/products/${product.id}`"
              class="card-dark group flex flex-col overflow-hidden"
            >
              <!-- Imagen -->
              <div class="relative aspect-square bg-surface-raised overflow-hidden">
                <img
                  v-if="productImageUrl(product)"
                  :src="productImageUrl(product)"
                  :alt="product.name"
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

                <!-- Badges -->
                <div class="absolute top-2 left-2 flex flex-col gap-1">
                  <span v-if="product.featured" class="badge-gold text-[9px]">Destacado</span>
                  <span
                    v-if="formatPrice(product.price, product.discount_percent, product.discount_amount).hasDiscount"
                    class="inline-flex items-center px-1.5 py-0.5 text-[9px] tracking-widest uppercase bg-red-900/60 text-red-300 border border-red-800/40"
                  >
                    -{{ product.discount_percent > 0 ? product.discount_percent + '%' : '' }}
                  </span>
                </div>

                <!-- Botón wishlist (corazón) -->
                <button
                  v-if="isAuthenticated"
                  @click="quickToggleWishlist($event, product)"
                  class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-black/60 border transition-all duration-200 opacity-0 group-hover:opacity-100"
                  :class="isInWishlist(product.id)
                    ? 'border-[var(--accent)55] text-accent'
                    : 'border-border-default text-text-muted hover:border-[var(--accent)44] hover:text-[var(--accent)88]'"
                  :aria-label="isInWishlist(product.id) ? 'Quitar de wishlist' : 'Añadir a wishlist'"
                >
                  <svg class="w-3 h-3" :fill="isInWishlist(product.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>

                <!-- Condición -->
                <div v-if="product.condition" class="absolute bottom-2 right-2">
                  <span
                    class="inline-flex items-center px-2 py-0.5 text-[9px] tracking-widest uppercase font-semibold border"
                    :class="{
                      'bg-emerald-950/80 text-emerald-400 border-emerald-700/60': product.condition === 'new',
                      'bg-amber-950/80 text-amber-400 border-amber-700/60':      product.condition === 'used',
                      'bg-purple-950/80 text-purple-400 border-purple-700/60':   product.condition === 'refurbished',
                    }"
                  >
                    {{ conditionLabel(product.condition) }}
                  </span>
                </div>
              </div>

              <!-- Cuerpo -->
              <div class="p-3 flex flex-col gap-1.5 flex-1">
                <!-- Categoría -->
                <p v-if="product.expand?.category?.name" class="text-[10px] tracking-[0.12em] uppercase text-accent/60">
                  {{ product.expand.category.name }}
                </p>

                <!-- Nombre -->
                <h3 class="text-[12px] font-medium text-text-secondary leading-snug line-clamp-2 group-hover:text-accent transition-colors duration-200">
                  {{ product.name }}
                </h3>

                <!-- Precio -->
                <div class="mt-auto pt-2 flex items-baseline gap-2">
                  <span class="text-sm font-semibold text-accent tabular-nums">
                    ${{ formatPrice(product.price, product.discount_percent, product.discount_amount).final.toLocaleString('es-CL') }}
                  </span>
                  <span
                    v-if="formatPrice(product.price, product.discount_percent, product.discount_amount).hasDiscount"
                    class="text-[10px] text-text-disabled line-through tabular-nums"
                  >
                    ${{ Number(product.price || 0).toLocaleString('es-CL') }}
                  </span>
                </div>

                <!-- Stock bajo -->
                <p v-if="product.stock > 0 && product.stock <= 5" class="text-[10px] text-amber-600/70">
                  Solo {{ product.stock }} disponible{{ product.stock !== 1 ? 's' : '' }}
                </p>

                <!-- Botón rápido de carrito -->
                <button
                  v-if="product.stock > 0"
                  @click="quickAdd($event, product)"
                  :class="[
                    'mt-1 w-full h-7 text-[9px] tracking-[0.12em] uppercase flex items-center justify-center gap-1.5 border transition-all duration-200',
                    cartAdded[product.id]
                      ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400'
                      : 'border-border-subtle text-text-muted hover:border-[var(--accent)44] hover:text-accent hover:bg-[var(--accent)08]',
                  ]"
                >
                  <svg v-if="cartAdded[product.id]" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                  {{ cartAdded[product.id] ? '¡Agregado!' : (itemQuantity(product.id) > 0 ? `En carrito (${itemQuantity(product.id)})` : 'Al carrito') }}
                </button>
              </div>
            </RouterLink>
          </div>

          <!-- ══ PAGINACIÓN ══════════════════════════════════════ -->
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

      <!-- ══ CONTENIDO SUBASTAS ═══════════════════════════════════ -->
      <section v-if="tab === 'auctions'" class="w-full">

        <!-- Filtro de subastas -->
        <div class="border-b border-border-subtle bg-surface-sunken sticky top-[57px] z-40">
          <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3">
            <div class="flex flex-wrap items-center gap-2.5">
              <div class="relative">
                <select v-model="auctionSort" class="filter-select">
                  <option value="end_date">Terminan pronto</option>
                  <option value="-end_date">Terminan más tarde</option>
                  <option value="current_price">Menor precio actual</option>
                  <option value="-current_price">Mayor precio actual</option>
                  <option value="-created">Más recientes</option>
                </select>
                <svg class="select-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <span class="ml-auto text-[10px] tracking-[0.18em] uppercase text-text-disabled hidden sm:block whitespace-nowrap">
                {{ auctionTotal }} subasta{{ auctionTotal !== 1 ? 's' : '' }}
              </span>
            </div>
          </div>
        </div>

        <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10">

          <!-- Error subastas -->
          <div v-if="auctionError" class="border border-red-900/30 bg-red-950/10 p-8 text-center mb-6">
            <p class="text-red-400 text-sm mb-4">{{ auctionError }}</p>
            <button @click="fetchAuctions" class="btn-outline text-xs">Reintentar</button>
          </div>

          <!-- Skeleton subastas -->
          <div v-else-if="auctionLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div v-for="i in 6" :key="i" class="card-dark overflow-hidden">
              <div class="skeleton h-44 w-full" />
              <div class="p-5 space-y-3">
                <div class="skeleton h-3 w-2/3" />
                <div class="skeleton h-px w-full mt-2" />
                <div class="flex justify-between pt-1">
                  <div class="skeleton h-6 w-28" />
                  <div class="skeleton h-4 w-20" />
                </div>
              </div>
            </div>
          </div>

          <!-- Sin subastas -->
          <div v-else-if="!auctions.length" class="flex flex-col items-center py-24 border border-[var(--surface-overlay)]">
            <svg class="w-10 h-10 text-text-disabled mb-5" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
              <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p class="font-display text-2xl font-light text-text-disabled mb-2">Sin subastas activas</p>
            <p class="text-text-disabled text-xs tracking-widest uppercase">Esta tienda no tiene subastas en curso</p>
          </div>

          <!-- Grid subastas -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div
              v-for="auction in auctions"
              :key="auction.id"
              class="card-dark group flex flex-col overflow-hidden"
            >
              <!-- Imagen -->
              <div class="relative h-44 bg-surface-raised overflow-hidden shrink-0">
                <img
                  v-if="auctionImageUrl(auction)"
                  :src="auctionImageUrl(auction)"
                  :alt="auction.title"
                  class="w-full h-full object-cover object-top"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center"
                  style="background:linear-gradient(135deg,var(--surface-raised) 0%,var(--accent-soft) 100%);"
                >
                  <svg class="w-10 h-10 text-text-disabled" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                    <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

                <!-- Countdown -->
                <div class="absolute bottom-3 left-3">
                  <div v-if="!timeLeft(auction.end_date).expired" class="flex items-center gap-1.5">
                    <svg class="w-3 h-3 shrink-0" :class="urgencyClass(auction.end_date)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="font-mono text-[11px] font-semibold tabular-nums" :class="urgencyClass(auction.end_date)">
                      <template v-if="timeLeft(auction.end_date).days > 0">
                        {{ timeLeft(auction.end_date).days }}d {{ pad(timeLeft(auction.end_date).hours) }}h {{ pad(timeLeft(auction.end_date).minutes) }}m
                      </template>
                      <template v-else>
                        {{ pad(timeLeft(auction.end_date).hours) }}:{{ pad(timeLeft(auction.end_date).minutes) }}:{{ pad(timeLeft(auction.end_date).seconds) }}
                      </template>
                    </span>
                  </div>
                  <span v-else class="text-[11px] uppercase tracking-wider text-text-muted">Finalizada</span>
                </div>

                <!-- Pujas -->
                <div v-if="auction.bids_count > 0" class="absolute top-3 left-3">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-wide uppercase bg-black/70 border border-border-default text-accent">
                    {{ auction.bids_count }} puja{{ auction.bids_count !== 1 ? 's' : '' }}
                  </span>
                </div>
              </div>

              <!-- Cuerpo -->
              <div class="p-4 flex flex-col gap-2 flex-1">
                <h3 class="text-sm font-medium text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors duration-200">
                  {{ auction.title }}
                </h3>
                <div class="mt-auto pt-3 border-t border-[var(--surface-overlay)] flex items-end justify-between gap-2">
                  <div>
                    <p class="text-[9px] tracking-widest uppercase text-text-disabled mb-0.5">
                      {{ auction.bids_count > 0 ? 'Oferta actual' : 'Precio base' }}
                    </p>
                    <p class="text-xl font-semibold text-accent tabular-nums">
                      ${{ Number(auction.current_price || auction.start_price || 0).toLocaleString('es-CL') }}
                    </p>
                  </div>
                  <div v-if="auction.buy_now_price" class="text-right">
                    <p class="text-[9px] tracking-widest uppercase text-text-disabled mb-0.5">Cómpralo ya</p>
                    <p class="text-sm text-text-muted tabular-nums">${{ Number(auction.buy_now_price).toLocaleString('es-CL') }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Paginación subastas -->
          <div v-if="!auctionLoading && auctionPages > 1" class="mt-10 flex items-center justify-center gap-1">
            <button @click="goAuctionPage(auctionPage - 1)" :disabled="auctionPage === 1" class="page-btn" aria-label="Anterior">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button v-for="p in auctionPageWindow" :key="p" @click="goAuctionPage(p)"
              :class="['page-btn', p === auctionPage && 'page-btn--active']">{{ p }}</button>
            <button @click="goAuctionPage(auctionPage + 1)" :disabled="auctionPage === auctionPages" class="page-btn" aria-label="Siguiente">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

        </div>
      </section>

      <!-- ══ TAB RESEÑAS ══════════════════════════════════════════ -->
      <section v-if="tab === 'reviews'" class="w-full">
        <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8">

          <!-- Resumen rating -->
          <div v-if="store?.reviews_count > 0" class="flex items-center gap-4 mb-8 p-5 border border-border-subtle bg-surface-sunken">
            <div class="text-center shrink-0">
              <p class="font-display text-4xl font-light text-accent">{{ Number(store.rating || 0).toFixed(1) }}</p>
              <div class="flex items-center justify-center gap-0.5 mt-1 mb-1">
                <svg v-for="i in 5" :key="i" class="w-3.5 h-3.5" :class="i <= Math.round(store.rating) ? 'text-accent' : 'text-text-disabled'" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                </svg>
              </div>
              <p class="text-[10px] text-text-muted">{{ store.reviews_count }} reseñas</p>
            </div>
            <div class="w-px h-12 bg-[var(--border-subtle)] shrink-0" />
            <p class="text-[12px] text-text-muted">Calificación promedio basada en todas las reseñas de productos de esta tienda.</p>
          </div>

          <!-- Loading -->
          <div v-if="storeReviewsLoad" class="flex flex-col gap-4">
            <div v-for="i in 3" :key="i" class="border border-border-subtle bg-surface-sunken p-5 flex flex-col gap-2">
              <div class="skeleton h-3 w-32" />
              <div class="skeleton h-3 w-full" />
              <div class="skeleton h-3 w-3/4" />
            </div>
          </div>

          <!-- Error -->
          <div v-else-if="storeReviewsErr" class="flex flex-col items-center py-16 gap-3">
            <p class="text-text-muted text-sm">{{ storeReviewsErr }}</p>
            <button @click="loadStoreReviews(1)" class="h-8 px-4 text-[10px] tracking-[0.15em] uppercase border border-border-subtle text-text-muted hover:border-[var(--accent)44] hover:text-accent transition-colors">
              Reintentar
            </button>
          </div>

          <!-- Sin reseñas -->
          <div v-else-if="storeReviews.length === 0" class="flex flex-col items-center py-20 gap-3">
            <svg class="w-12 h-12 text-text-disabled" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
              <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p class="font-display text-lg font-light text-text-disabled">Sin reseñas aún</p>
            <p class="text-[10px] tracking-widest uppercase text-text-disabled">Esta tienda todavía no tiene reseñas</p>
          </div>

          <!-- Lista de reseñas -->
          <div v-else class="flex flex-col gap-3">
            <div
              v-for="rev in storeReviews"
              :key="rev.id"
              class="border border-border-subtle bg-surface-sunken p-5"
            >
              <div class="flex items-start justify-between gap-3 mb-3">
                <div class="flex items-center gap-3">
                  <!-- Avatar -->
                  <div class="w-8 h-8 rounded-full bg-surface-overlay border border-border-default flex items-center justify-center shrink-0">
                    <span class="text-[11px] text-text-muted font-medium uppercase">{{ reviewerName(rev).charAt(0) }}</span>
                  </div>
                  <div>
                    <p class="text-[12px] text-text-muted">{{ reviewerName(rev) }}</p>
                    <div class="flex items-center gap-0.5 mt-0.5">
                      <svg v-for="i in 5" :key="i" class="w-3 h-3" :class="i <= rev.rating ? 'text-accent' : 'text-text-disabled'" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                      </svg>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <!-- Producto reseñado -->
                  <RouterLink
                    v-if="rev.expand?.product"
                    :to="`/products/${rev.expand.product.id}`"
                    class="text-[10px] text-text-muted hover:text-accent transition-colors truncate max-w-[140px] border-b border-dashed border-border-default hover:border-[var(--accent)44]"
                  >
                    {{ rev.expand.product.name }}
                  </RouterLink>
                  <span v-if="rev.verified_purchase" class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] tracking-widest uppercase text-teal-500/70 border border-teal-800/30 bg-teal-900/10">
                    <svg class="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Verificada
                  </span>
                  <span class="text-[9px] text-text-disabled">{{ fmtDateReview(rev.created) }}</span>
                </div>
              </div>
              <p v-if="rev.title" class="text-[13px] text-text-secondary font-medium mb-1.5">{{ rev.title }}</p>
              <p v-if="rev.comment" class="text-[12px] text-text-muted leading-relaxed">{{ rev.comment }}</p>
            </div>

            <!-- Paginación reseñas -->
            <div v-if="storeReviewsPages > 1" class="mt-6 flex items-center justify-center gap-1">
              <button
                v-for="p in storeReviewsPages"
                :key="p"
                @click="loadStoreReviews(p)"
                :class="['page-btn', p === storeReviewsPage && 'page-btn--active']"
              >{{ p }}</button>
            </div>
          </div>

        </div>
      </section>

    </template>
  </main>

  <AppFooter />
</template>

<style scoped>
.store-shell {
  background: linear-gradient(180deg, var(--surface-base) 0%, var(--surface-base) 100%);
  flex: 1;
  width: 100%;
  overflow-x: hidden;
}

.filter-select {
  appearance: none;
  -webkit-appearance: none;
  background-color: var(--surface-base);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  font-size: 0.8125rem;
  padding: 0 2.25rem 0 0.75rem;
  height: 2.25rem;
  outline: none;
  cursor: pointer;
  transition: border-color 0.2s;
  white-space: nowrap;
  min-width: 11rem;
}
.filter-select:focus { border-color: var(--accent); }
.filter-select option { background-color: var(--surface-raised); color: var(--text-primary); }

.select-chevron {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  width: 0.875rem;
  height: 0.875rem;
  color: var(--text-disabled);
  pointer-events: none;
}

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
.page-btn:hover:not(:disabled) { border-color: var(--accent)44; color: var(--accent); }
.page-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.page-btn--active { border-color: var(--accent) !important; color: var(--accent) !important; background: var(--accent-soft); }
</style>
