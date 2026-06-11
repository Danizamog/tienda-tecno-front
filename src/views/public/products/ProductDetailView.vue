<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import MediaGallery from '@/components/ui/MediaGallery.vue'
import { useCartStore } from '@/composables/useCartStore'
import { useWishlistStore } from '@/composables/useWishlistStore'
import { useAuthSession } from '@/composables/useAuthSession'
import { useProductReviews } from '@/composables/useReviewsApi'
import { useCompareStore } from '@/composables/useCompareStore'
import { useRecentlyViewed } from '@/composables/useRecentlyViewed'
import Swal from 'sweetalert2'

const API    = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB     = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')
const route  = useRoute()
const router = useRouter()

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/products')
}

// ── Estado ────────────────────────────────────────────────────────────────────
const product      = ref(null)
const loading      = ref(true)
const error        = ref('')
const showReviews  = ref(false)

// ── Reseñas ───────────────────────────────────────────────────────────────────
let reviewsComposable = null
const reviews         = ref([])
const reviewsTotal    = ref(0)
const reviewsTotalPages = ref(1)
const reviewsAvg      = ref(null)
const reviewsLoading  = ref(false)
const reviewsError    = ref('')
const reviewsPage     = ref(1)

async function loadReviews(p = 1) {
  if (!product.value) return
  reviewsLoading.value = true
  reviewsError.value   = ''
  reviewsPage.value    = p
  try {
    if (!reviewsComposable) {
      const { useProductReviews: useProductReviewsFn } = await import('@/composables/useReviewsApi')
      reviewsComposable = useProductReviewsFn(product.value.id)
    }
    await reviewsComposable.load(p)
    reviews.value          = reviewsComposable.reviews.value
    reviewsTotal.value     = reviewsComposable.total.value
    reviewsTotalPages.value = reviewsComposable.totalPages.value
    reviewsAvg.value       = reviewsComposable.avgRating.value
  } catch (e) {
    reviewsError.value = e.message || 'Error al cargar reseñas'
  } finally {
    reviewsLoading.value = false
  }
}

async function toggleReviews() {
  showReviews.value = !showReviews.value
  if (showReviews.value && reviews.value.length === 0) {
    await loadReviews(1)
  }
}

function starsArray(rating) {
  const r     = Math.round(Number(rating || 0) * 2) / 2
  const full  = Math.floor(r)
  const half  = r % 1 !== 0
  const empty = 5 - full - (half ? 1 : 0)
  return { full, half, empty }
}

function reviewerName(rev) {
  const u = rev.expand?.reviewer
  if (!u) return 'Usuario'
  return u.name || u.username || u.email?.split('@')[0] || 'Usuario'
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Fetch producto ─────────────────────────────────────────────────────────────
async function fetchProduct() {
  loading.value = true
  error.value   = ''
  try {
    const res = await fetch(`${API}/products/${route.params.id}`)
    if (res.status === 404) { error.value = 'Producto no encontrado.'; return }
    if (!res.ok) throw new Error(`Error ${res.status}`)
    product.value = await res.json()
    recordView(product.value)
  } catch {
    error.value = 'No se pudo cargar el producto.'
  } finally {
    loading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const images = computed(() => {
  const imgs = product.value?.images
  if (!imgs) return []
  return Array.isArray(imgs) ? imgs : [imgs]
})

function imgUrl(filename, thumb = '') {
  if (!product.value || !filename) return ''
  const q = thumb ? `?thumb=${thumb}` : ''
  return `${PB}/api/files/products/${product.value.id}/${filename}${q}`
}

const store = computed(() => product.value?.expand?.store || null)
const category = computed(() => product.value?.expand?.category || null)

function logoUrl(s) {
  if (!s?.logo) return null
  return `${API}/stores/files/stores/${s.id}/${s.logo}`
}

function storeInitials(name) {
  return (name || 'TT').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const pricing = computed(() => {
  if (!product.value) return { base: 0, final: 0, hasDiscount: false, discountLabel: '' }
  const base     = Number(product.value.price || 0)
  const pct      = Number(product.value.discount_percent || 0)
  const amt      = Number(product.value.discount_amount  || 0)
  let   final    = base
  let   label    = ''
  if (pct > 0)       { final = base * (1 - pct / 100); label = `-${pct}%` }
  else if (amt > 0)  { final = Math.max(0, base - amt); label = `-$${amt.toLocaleString('es-CL')}` }
  return {
    base,
    final: Math.round(final * 100) / 100,
    hasDiscount: final < base,
    discountLabel: label,
  }
})

const conditionMap = { new: 'Nuevo', used: 'Usado', refurbished: 'Reacondicionado' }

// ── Carrito ───────────────────────────────────────────────────────────────────
const { addToCart, itemQuantity } = useCartStore()
const cartQty       = ref(1)
const cartFeedback  = ref('')  // 'added' | 'error' | ''
const cartLoading   = ref(false)
let feedbackTimer   = null

const inCart = computed(() => product.value ? itemQuantity(product.value.id) > 0 : false)

// ── Wishlist ──────────────────────────────────────────────────────────────────
const { isAuthenticated } = useAuthSession()
const { isInWishlist, toggleWishlist, getWishlistItem, removeFromWishlist } = useWishlistStore()
const wishlistFeedback = ref('')   // 'added' | 'removed' | 'error' | ''
let wishlistTimer = null

const inWishlist = computed(() => product.value ? isInWishlist(product.value.id) : false)

async function handleToggleWishlist() {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  if (!product.value) return
  const result = await toggleWishlist(product.value.id)
  if (!result.ok && result.error === 'not_authenticated') {
    router.push('/login')
    return
  }
  wishlistFeedback.value = inWishlist.value ? 'added' : 'removed'
  clearTimeout(wishlistTimer)
  wishlistTimer = setTimeout(() => { wishlistFeedback.value = '' }, 2000)
}

async function handleAddToCart() {
  if (!product.value || !store.value?.id) return
  if (cartLoading.value) return

  // Enriquecer con store
  const enriched = {
    ...product.value,
    store: store.value.id,
    expand: { ...product.value.expand, store: store.value }
  }

  cartLoading.value = true
  try {
    const success = await addToCart(enriched, cartQty.value)
    if (!success) {
      cartFeedback.value = 'error'
      clearTimeout(feedbackTimer)
      feedbackTimer = setTimeout(() => { cartFeedback.value = '' }, 3000)
      return
    }

    cartFeedback.value = 'added'
    clearTimeout(feedbackTimer)
    feedbackTimer = setTimeout(() => { cartFeedback.value = '' }, 2500)

    // Si estaba en wishlist, quitarlo automáticamente
    const wishItem = getWishlistItem(product.value.id)
    if (wishItem) removeFromWishlist(wishItem.id, product.value.id)
  } finally {
    cartLoading.value = false
  }
}

const stockStatus = computed(() => {
  const s = Number(product.value?.stock || 0)
  if (s === 0)  return { label: 'Sin stock',     cls: 'text-red-400' }
  if (s <= 5)   return { label: `Solo ${s} disponible${s !== 1 ? 's' : ''}`, cls: 'text-amber-400' }
  return        { label: 'En stock',             cls: 'text-emerald-400' }
})

const whatsappUrl = computed(() => {
  const wa = store.value?.whatsapp
  if (!wa) return null
  const clean = wa.replace(/\D/g, '')
  const name  = encodeURIComponent(product.value?.name || '')
  return `https://wa.me/${clean}?text=Hola%2C+me+interesa+el+producto%3A+${name}`
})

// ── Comparador ────────────────────────────────────────────────────────────────
const { isInCompare, toggleCompare, maxCompare } = useCompareStore()

const inCompare = computed(() => product.value ? isInCompare(product.value.id) : false)

function handleCompare() {
  if (!product.value) return
  const result = toggleCompare(product.value)
  if (result.error === 'limit_reached') {
    Swal.fire({
      toast: true,
      position: 'bottom-end',
      icon: 'warning',
      title: `Máximo ${maxCompare} productos para comparar`,
      showConfirmButton: false,
      timer: 2200,
    })
  }
}

// ── Vistos recientemente ──────────────────────────────────────────────────────
const { recordView, recentItems } = useRecentlyViewed()

const recentList = computed(() =>
  recentItems.value.filter(p => p.id !== route.params.id).slice(0, 4)
)

// ── Productos similares ───────────────────────────────────────────────────────
const similarProducts = ref([])

async function fetchSimilar() {
  similarProducts.value = []
  const cat = product.value?.category
  const categoryId = Array.isArray(cat) ? cat[0] : cat
  if (!categoryId) return
  try {
    const params = new URLSearchParams({ categoryId, perPage: '8', page: '1' })
    const res = await fetch(`${API}/products?${params}`)
    if (!res.ok) return
    const data = await res.json()
    similarProducts.value = (data.items || [])
      .filter(p => p.id !== product.value?.id)
      .slice(0, 4)
  } catch { /* sección opcional, silenciar */ }
}

function similarImgUrl(p) {
  const imgs = Array.isArray(p.images) ? p.images : (p.images ? [p.images] : [])
  if (!imgs[0]) return null
  return `${PB}/api/files/products/${p.id}/${imgs[0]}?thumb=600x800`
}

function similarPricing(p) {
  const base = Number(p.price || 0)
  const pct  = Number(p.discount_percent || 0)
  const amt  = Number(p.discount_amount  || 0)
  let final  = base
  if (pct > 0)      final = base * (1 - pct / 100)
  else if (amt > 0) final = Math.max(0, base - amt)
  return { base, final: Math.round(final * 100) / 100, hasDiscount: final < base }
}

// ── Carga inicial + re-navegación entre fichas ───────────────────────────────
async function loadAll() {
  // Resetear estado de reseñas (el composable queda ligado al producto anterior)
  showReviews.value   = false
  reviews.value       = []
  reviewsTotal.value  = 0
  reviewsAvg.value    = null
  reviewsComposable   = null

  await fetchProduct()
  fetchSimilar()
}

watch(() => route.params.id, (newId, oldId) => {
  if (newId && newId !== oldId) loadAll()
})

onMounted(loadAll)

</script>

<template>
  <AppNavbar />

  <main class="detail-shell text-text-primary">
    <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10">

      <!-- Volver + Breadcrumb -->
      <div class="flex items-center justify-between gap-4 mb-8">
        <nav class="flex items-center gap-2 text-[10px] tracking-[0.15em] uppercase text-text-disabled">
          <RouterLink to="/stores" class="hover:text-accent transition-colors">Directorio</RouterLink>
          <span>/</span>
          <RouterLink
            v-if="store"
            :to="`/stores/${store.slug || store.id}`"
            class="hover:text-accent transition-colors"
          >{{ store.name }}</RouterLink>
          <span v-if="store">/</span>
          <span class="text-text-muted">Producto</span>
        </nav>

        <button
          @click="goBack"
          class="flex items-center gap-1.5 text-[10px] tracking-[0.15em] uppercase text-text-muted border border-border-subtle px-3 h-8 hover:border-[var(--accent)44] hover:text-accent transition-colors shrink-0"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Volver
        </button>
      </div>

      <!-- ══ ERROR ══════════════════════════════════════════════════ -->
      <div v-if="error" class="flex flex-col items-center py-24 gap-4">
        <p class="text-text-muted text-sm">{{ error }}</p>
        <RouterLink to="/stores" class="btn-outline text-xs">Volver al directorio</RouterLink>
      </div>

      <!-- ══ SKELETON ═══════════════════════════════════════════════ -->
      <div v-else-if="loading" class="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div class="space-y-3">
          <div class="skeleton aspect-square w-full" />
          <div class="grid grid-cols-4 gap-2">
            <div v-for="i in 4" :key="i" class="skeleton aspect-square" />
          </div>
        </div>
        <div class="space-y-4 pt-2">
          <div class="skeleton h-3 w-24" />
          <div class="skeleton h-8 w-3/4" />
          <div class="skeleton h-6 w-32 mt-2" />
          <div class="skeleton h-px w-full mt-4" />
          <div class="skeleton h-3 w-full mt-4" />
          <div class="skeleton h-3 w-5/6" />
          <div class="skeleton h-3 w-4/6" />
        </div>
      </div>

      <!-- ══ CONTENIDO ══════════════════════════════════════════════ -->
      <div v-else-if="product" class="grid grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-20">

        <!-- ── GALERÍA DE IMÁGENES ─────────────────────────────────── -->
        <MediaGallery
          :images="images.map(f => imgUrl(f, '800x800'))"
          :thumbs="images.map(f => imgUrl(f, '400x400'))"
          :alt="product.name"
          aspect="square"
        >
          <template #overlay>
            <div v-if="product.featured" class="absolute top-3 left-3">
              <span class="badge-gold">Destacado</span>
            </div>
            <div v-if="pricing.hasDiscount" class="absolute top-3 right-3">
              <span class="inline-flex items-center px-2 py-1 text-[10px] tracking-widest uppercase bg-red-900/70 text-red-300 border border-red-800/40 font-medium">
                {{ pricing.discountLabel }}
              </span>
            </div>
          </template>
        </MediaGallery>

        <!-- ── DETALLES ─────────────────────────────────────────────── -->
        <div class="detail-info-panel flex flex-col gap-0">

          <!-- Categoría + condición -->
          <div class="flex items-center gap-2 flex-wrap pb-5">
            <span v-if="category" class="section-label">{{ category.name }}</span>
            <span
              v-if="product.condition"
              class="inline-flex items-center px-2 py-0.5 text-[9px] tracking-[0.22em] uppercase border border-border-default text-text-muted"
            >
              {{ conditionMap[product.condition] || product.condition }}
            </span>
          </div>

          <!-- Nombre -->
          <h1 class="font-display text-4xl md:text-5xl font-light leading-[1.02] letter-spacing-tight pb-6">
            {{ product.name }}
          </h1>

          <!-- Precio + descuento -->
          <div class="flex items-baseline gap-3 pb-2">
            <span class="font-display text-4xl font-medium text-accent tabular-nums leading-none">
              ${{ pricing.final.toLocaleString('es-CL') }}
            </span>
            <span v-if="pricing.hasDiscount" class="font-display text-xl text-text-disabled line-through tabular-nums">
              ${{ pricing.base.toLocaleString('es-CL') }}
            </span>
            <span v-if="pricing.hasDiscount" class="text-[10px] tracking-[0.18em] uppercase text-red-400 bg-red-900/15 border border-red-900/25 px-2 py-0.5 ml-1">
              {{ pricing.discountLabel }}
            </span>
          </div>

          <!-- Stock indicador -->
          <div class="pb-6 pt-1 flex items-center gap-3">
            <div class="w-1.5 h-1.5 rounded-full shrink-0"
              :class="Number(product.stock) === 0 ? 'bg-red-400' : Number(product.stock) <= 5 ? 'bg-amber-400' : 'bg-emerald-400'"
            />
            <p class="text-[11px] tracking-[0.14em] uppercase" :class="stockStatus.cls">
              {{ stockStatus.label }}
            </p>
          </div>

          <div class="detail-divider" />

          <!-- Descripción -->
          <div
            v-if="product.description"
            class="prose-dark text-[13.5px] text-text-muted leading-relaxed py-6"
            v-html="product.description"
          />

          <div class="detail-divider" />

          <!-- Tienda vendedora -->
          <RouterLink
            v-if="store"
            :to="`/stores/${store.slug || store.id}`"
            class="detail-store-link flex items-center gap-4 py-5 group"
          >
            <div class="w-11 h-11 shrink-0 border border-border-default bg-surface-raised overflow-hidden">
              <img
                v-if="logoUrl(store)"
                :src="logoUrl(store)"
                :alt="store.name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <span class="font-display text-sm font-light text-text-disabled">
                  {{ storeInitials(store.name).charAt(0) }}
                </span>
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[9px] tracking-[0.28em] uppercase text-text-disabled mb-1">Vendido por</p>
              <p class="text-sm font-medium text-text-primary group-hover:text-accent transition-colors duration-200 truncate">
                {{ store.name }}
              </p>
            </div>
            <svg class="w-3.5 h-3.5 text-text-disabled group-hover:text-accent transition-colors shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </RouterLink>

          <div class="detail-divider" />

          <!-- ── Agregar al carrito ──────────────────────────────── -->
          <div class="flex flex-col gap-3 pt-6">

            <!-- Selector cantidad + botón principal -->
            <div v-if="Number(product.stock) > 0" class="flex gap-2">
              <div class="detail-qty-ctrl flex items-center border border-border-default bg-surface-raised">
                <button
                  @click="cartQty = Math.max(1, cartQty - 1)"
                  class="w-10 h-12 flex items-center justify-center text-text-muted hover:text-accent transition-colors text-lg leading-none"
                >−</button>
                <span class="w-10 text-center text-sm text-text-primary tabular-nums select-none font-medium">{{ cartQty }}</span>
                <button
                  @click="cartQty = Math.min(Number(product.stock), cartQty + 1)"
                  class="w-10 h-12 flex items-center justify-center text-text-muted hover:text-accent transition-colors text-lg leading-none"
                >+</button>
              </div>

              <button
                @click="handleAddToCart"
                :disabled="cartLoading"
                class="add-to-cart-btn flex-1 h-12 px-5 flex items-center justify-center gap-2.5 text-[11px] tracking-[0.18em] uppercase font-semibold border transition-all duration-200 ease-out cursor-pointer select-none focus:outline-none disabled:cursor-not-allowed"
                :class="cartFeedback === 'added'
                  ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-400'
                  : cartFeedback === 'error'
                  ? 'bg-red-900/40 border-red-700/50 text-red-400 animate-shake'
                  : 'bg-accent text-accent-on border-accent hover:bg-accent-hover hover:border-accent-hover hover:shadow-[0_8px_30px_-10px_var(--accent-glow-strong)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]'"
              >
                <Transition name="cart-icon" mode="out-in">
                  <svg v-if="cartLoading" key="spin" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <svg v-else-if="cartFeedback === 'added'" key="check" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <svg v-else-if="cartFeedback === 'error'" key="error" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M12 9v2m0 4v2m-6.773-7.618A9 9 0 1 1 20.773 16.618a9 9 0 0 1-14.546-7.618z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <svg v-else key="cart" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                </Transition>
                <span class="leading-none">
                  {{
                    cartLoading ? 'Agregando...'
                    : cartFeedback === 'added' ? '¡Agregado al carrito!'
                    : cartFeedback === 'error' ? 'Error al agregar'
                    : (inCart ? 'Agregar más' : 'Agregar al carrito')
                  }}
                </span>
              </button>
            </div>

            <!-- Acciones secundarias en grid 4 columnas -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">

              <!-- Wishlist -->
              <button
                @click="handleToggleWishlist"
                class="detail-action-btn flex flex-col items-center justify-center gap-1.5 py-3 border transition-colors duration-200"
                :class="inWishlist
                  ? 'border-accent/40 text-accent bg-accent/5'
                  : 'border-border-default text-text-muted hover:border-accent/40 hover:text-accent'"
              >
                <svg class="w-4 h-4 transition-all duration-200" :fill="inWishlist ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="text-[9px] tracking-[0.18em] uppercase leading-none">
                  {{ inWishlist ? 'Guardado' : 'Wishlist' }}
                </span>
              </button>

              <!-- Comparar -->
              <button
                @click="handleCompare"
                class="detail-action-btn flex flex-col items-center justify-center gap-1.5 py-3 border transition-colors duration-200"
                :class="inCompare
                  ? 'border-accent/40 text-accent bg-accent/5'
                  : 'border-border-default text-text-muted hover:border-accent/40 hover:text-accent'"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
                </svg>
                <span class="text-[9px] tracking-[0.18em] uppercase leading-none">
                  {{ inCompare ? 'Comparando' : 'Comparar' }}
                </span>
              </button>

              <!-- WhatsApp -->
              <a
                v-if="whatsappUrl"
                :href="whatsappUrl"
                target="_blank"
                rel="noopener"
                class="detail-action-btn flex flex-col items-center justify-center gap-1.5 py-3 border border-[#25d366]/25 text-[#25d366] hover:bg-[#25d366]/08 hover:border-[#25d366]/50 transition-colors"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span class="text-[9px] tracking-[0.18em] uppercase leading-none">WhatsApp</span>
              </a>
              <div v-else class="detail-action-btn flex flex-col items-center justify-center gap-1.5 py-3 border border-border-subtle opacity-30 cursor-not-allowed">
                <svg class="w-4 h-4 text-text-disabled" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span class="text-[9px] tracking-[0.18em] uppercase leading-none text-text-disabled">WhatsApp</span>
              </div>

              <!-- Ver reseñas -->
              <button
                @click="toggleReviews"
                class="detail-action-btn flex flex-col items-center justify-center gap-1.5 py-3 border border-border-default text-text-muted hover:border-accent/40 hover:text-accent transition-colors"
                :class="showReviews ? 'border-accent/40 text-accent bg-accent/5' : ''"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="text-[9px] tracking-[0.18em] uppercase leading-none">
                  {{ reviewsTotal > 0 ? `${reviewsTotal} reseñas` : 'Reseñas' }}
                </span>
              </button>
            </div>
          </div>

          <!-- Panel de reseñas -->
          <div v-if="showReviews" class="border border-border-subtle bg-surface-sunken">
            <!-- Header del panel -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--surface-overlay)]">
              <div class="flex items-center gap-3">
                <h2 class="text-sm font-medium text-text-secondary tracking-wide">Reseñas del producto</h2>
                <!-- Promedio -->
                <div v-if="reviewsAvg !== null" class="flex items-center gap-1.5">
                  <div class="flex items-center gap-0.5">
                    <svg v-for="i in 5" :key="i" class="w-3 h-3" :class="i <= Math.round(reviewsAvg) ? 'text-accent' : 'text-text-disabled'" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                    </svg>
                  </div>
                  <span class="text-[11px] text-accent font-medium">{{ reviewsAvg }}</span>
                  <span class="text-[10px] text-text-muted">({{ reviewsTotal }})</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button @click="showReviews = false" class="text-text-disabled hover:text-accent transition-colors p-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Loading reseñas -->
            <div v-if="reviewsLoading" class="px-5 py-8 flex flex-col gap-3">
              <div v-for="i in 2" :key="i" class="flex flex-col gap-2">
                <div class="skeleton h-2.5 w-24" />
                <div class="skeleton h-2.5 w-full" />
                <div class="skeleton h-2.5 w-3/4" />
              </div>
            </div>

            <!-- Error -->
            <div v-else-if="reviewsError" class="px-5 py-6 flex items-center justify-center">
              <p class="text-[11px] text-text-muted">{{ reviewsError }}</p>
            </div>

            <!-- Sin reseñas -->
            <div v-else-if="reviews.length === 0" class="flex flex-col items-center py-10 gap-3">
              <svg class="w-10 h-10 text-text-disabled" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <p class="font-display text-base font-light text-text-disabled">Sin reseñas aún</p>
              <p class="text-[10px] tracking-widest uppercase text-text-disabled">Las reseñas se publican desde Mis pedidos tras recibir el producto</p>
            </div>

            <!-- Lista de reseñas -->
            <div v-else class="divide-y divide-[var(--surface-raised)]">
              <div v-for="rev in reviews" :key="rev.id" class="px-5 py-4">
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div class="flex items-center gap-2">
                    <!-- Avatar inicial -->
                    <div class="w-7 h-7 rounded-full bg-surface-overlay border border-border-default flex items-center justify-center shrink-0">
                      <span class="text-[10px] text-text-muted font-medium uppercase">{{ reviewerName(rev).charAt(0) }}</span>
                    </div>
                    <div>
                      <p class="text-[11px] text-text-muted">{{ reviewerName(rev) }}</p>
                      <div class="flex items-center gap-1 mt-0.5">
                        <svg v-for="i in 5" :key="i" class="w-2.5 h-2.5" :class="i <= rev.rating ? 'text-accent' : 'text-text-disabled'" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span v-if="rev.verified_purchase" class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] tracking-widest uppercase text-teal-500/70 border border-teal-800/30 bg-teal-900/10">
                      <svg class="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      Compra verificada
                    </span>
                    <span class="text-[9px] text-text-disabled">{{ fmtDate(rev.created) }}</span>
                  </div>
                </div>
                <p v-if="rev.title" class="text-[12px] text-text-secondary font-medium mb-1">{{ rev.title }}</p>
                <p v-if="rev.comment" class="text-[11px] text-text-muted leading-relaxed">{{ rev.comment }}</p>
              </div>
            </div>

            <!-- Paginación de reseñas -->
            <div v-if="reviewsTotalPages > 1" class="flex items-center justify-center gap-2 px-5 py-4 border-t border-[var(--surface-raised)]">
              <button
                v-for="p in reviewsTotalPages"
                :key="p"
                @click="loadReviews(p)"
                :class="['w-7 h-7 text-[10px] border transition-colors', p === reviewsPage ? 'border-accent text-accent bg-[var(--accent)10]' : 'border-border-subtle text-text-muted hover:border-border-default']"
              >
                {{ p }}
              </button>
            </div>
          </div>

        </div>
      </div>

      <!-- ══ PRODUCTOS SIMILARES ══════════════════════════════════ -->
      <section v-if="similarProducts.length" class="mt-16 pt-12 border-t border-border-subtle">
        <div class="flex items-end justify-between gap-4 mb-8">
          <div>
            <p class="section-label mb-3">{{ category?.name || 'Misma categoría' }}</p>
            <h2 class="font-display font-light text-2xl md:text-3xl">Productos <em class="text-accent italic font-normal">similares</em></h2>
          </div>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <RouterLink
            v-for="p in similarProducts"
            :key="p.id"
            :to="`/products/${p.id}`"
            class="product-card group"
          >
            <div class="product-media aspect-[3/4]">
              <img
                v-if="similarImgUrl(p)"
                :src="similarImgUrl(p)"
                :alt="p.name"
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
            </div>
            <div class="p-4 flex flex-col gap-1.5 flex-1">
              <p class="text-[9px] tracking-[0.18em] uppercase text-text-muted truncate">{{ p.expand?.store?.name || '—' }}</p>
              <h3 class="text-sm text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors duration-300">{{ p.name }}</h3>
              <div class="mt-auto pt-1.5">
                <span v-if="similarPricing(p).hasDiscount" class="text-text-disabled text-[11px] line-through tabular-nums mr-1.5">
                  ${{ similarPricing(p).base.toLocaleString('es-CL') }}
                </span>
                <span class="font-display text-xl font-medium text-accent tabular-nums">
                  ${{ similarPricing(p).final.toLocaleString('es-CL') }}
                </span>
              </div>
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- ══ VISTOS RECIENTEMENTE ═════════════════════════════════ -->
      <section v-if="recentList.length" class="mt-16 pt-12 border-t border-border-subtle">
        <div class="mb-8">
          <p class="section-label mb-3">Tu historial</p>
          <h2 class="font-display font-light text-2xl md:text-3xl">Vistos <em class="text-accent italic font-normal">recientemente</em></h2>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <RouterLink
            v-for="p in recentList"
            :key="p.id"
            :to="`/products/${p.id}`"
            class="product-card group"
          >
            <div class="product-media aspect-[3/4]">
              <img
                v-if="p.image"
                :src="p.image"
                :alt="p.name"
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
            </div>
            <div class="p-4 flex flex-col gap-1.5 flex-1">
              <p class="text-[9px] tracking-[0.18em] uppercase text-text-muted truncate">{{ p.storeName || '—' }}</p>
              <h3 class="text-sm text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors duration-300">{{ p.name }}</h3>
              <div class="mt-auto pt-1.5">
                <span class="font-display text-xl font-medium text-accent tabular-nums">
                  ${{ Number(p.finalPrice || p.price || 0).toLocaleString('es-CL') }}
                </span>
              </div>
            </div>
          </RouterLink>
        </div>
      </section>

    </div>
  </main>

  <AppFooter />
</template>

<style scoped>
.detail-shell {
  background-color: var(--surface-base);
  flex: 1;
  width: 100%;
  overflow-x: hidden;
}

/* Info panel — thin gold left border as editorial accent */
.detail-info-panel {
  border-left: 1px solid var(--border-subtle);
  padding-left: 2rem;
}
@media (max-width: 1023px) {
  .detail-info-panel {
    border-left: none;
    padding-left: 0;
    border-top: 1px solid var(--border-subtle);
    padding-top: 2rem;
  }
}

/* Divider — hairline, more refined than the border shorthand */
.detail-divider {
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, var(--border-subtle) 0%, transparent 100%);
}

/* Store link — borderless, just a bottom hairline */
.detail-store-link {
  border-bottom: 1px solid var(--border-subtle);
  transition: background-color 0.2s ease;
}
.detail-store-link:hover {
  background-color: var(--surface-raised);
  margin-inline: -1rem;
  padding-inline: 1rem;
}

/* Quantity control */
.detail-qty-ctrl button {
  border-right: 1px solid var(--border-subtle);
}
.detail-qty-ctrl button:last-child {
  border-right: none;
  border-left: 1px solid var(--border-subtle);
}

/* Secondary action buttons */
.detail-action-btn {
  cursor: pointer;
  background: transparent;
}

/* Prose oscuro para la descripción HTML */
.prose-dark :deep(p)      { margin-bottom: 0.75rem; }
.prose-dark :deep(strong) { color: var(--accent); font-weight: 500; }
.prose-dark :deep(em)     { color: var(--text-muted); }
.prose-dark :deep(ul)     { list-style: disc; padding-left: 1.25rem; }
.prose-dark :deep(ol)     { list-style: decimal; padding-left: 1.25rem; }
.prose-dark :deep(li)     { margin-bottom: 0.25rem; }
.prose-dark :deep(a)      { color: var(--accent); text-decoration: underline; }

/* Skeleton para reseñas */
.skeleton {
  background: linear-gradient(90deg, var(--surface-overlay) 25%, var(--border-subtle) 50%, var(--surface-overlay) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 2px;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Transición icono carrito */
.cart-icon-enter-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.cart-icon-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.cart-icon-enter-from   { opacity: 0; transform: scale(0.5) rotate(-12deg); }
.cart-icon-leave-to     { opacity: 0; transform: scale(0.5) rotate(12deg); }

/* Botón agregar al carrito */
.add-to-cart-btn {
  will-change: transform, box-shadow, background-color;
  -webkit-tap-highlight-color: transparent;
}
.add-to-cart-btn:disabled { opacity: 0.7; }

@keyframes cart-shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-4px); }
  40%      { transform: translateX(4px); }
  60%      { transform: translateX(-3px); }
  80%      { transform: translateX(3px); }
}
.animate-shake { animation: cart-shake 0.4s ease-in-out; }
</style>
