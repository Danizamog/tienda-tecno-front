<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
import AppFooter from '@/components/AppFooter.vue'

const API    = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '/api').replace(/\/$/, '')
const PB     = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')
const router = useRouter()

// ── Estado ────────────────────────────────────────────────────────────────────
const stores          = ref([])
const products        = ref([])
const auctions        = ref([])
const allCategories   = ref([])   // todas las categorías (para modal)

const loadingStores     = ref(true)
const loadingProducts   = ref(true)
const loadingAuctions   = ref(true)
const loadingCategories = ref(true)

const showCatModal = ref(false)

const now = ref(Date.now())
let ticker = null

// Categorías que se muestran en el home (hasta 7, aleatorio)
const homeCategories = computed(() => shuffle(allCategories.value).slice(0, 7))

// ── Shuffle aleatorio ──────────────────────────────────────────────────────────
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchStores() {
  try {
    const res  = await fetch(`${API}/stores/featured`)
    const data = await res.json()
    // Aleatorio: mezcla las tiendas y toma 3
    stores.value = shuffle(data.items || []).slice(0, 3)
  } catch { stores.value = [] }
  finally   { loadingStores.value = false }
}

async function fetchProducts() {
  try {
    // Pide 20 y mezcla para mostrar 4 aleatorios
    const res  = await fetch(`${API}/products?status=active&sort=-created&perPage=20`)
    const data = await res.json()
    products.value = shuffle(data.items || []).slice(0, 4)
  } catch { products.value = [] }
  finally   { loadingProducts.value = false }
}

async function fetchAuctions() {
  try {
    // Pide todas las activas y mezcla para mostrar 3 aleatorios
    const res  = await fetch(`${API}/auctions?status=active&sort=end_date&perPage=20`)
    const data = await res.json()
    auctions.value = shuffle(data.items || []).slice(0, 3)
  } catch { auctions.value = [] }
  finally   { loadingAuctions.value = false }
}

async function fetchCategories() {
  try {
    const res  = await fetch(`${API}/products/categories?perPage=100`)
    const data = await res.json()
    allCategories.value = data.items || []
  } catch { allCategories.value = [] }
  finally   { loadingCategories.value = false }
}

// Navegar a productos filtrando por categoría
function goToCategory(cat) {
  showCatModal.value = false
  router.push({ path: '/products', query: { categoryId: cat.id, categoryName: cat.name } })
}

// ── Helpers de imagen ──────────────────────────────────────────────────────────
function storeBannerUrl(store) {
  if (!store?.banner) return null
  return `${API}/stores/files/stores/${store.id}/${store.banner}`
}

function storeLogoUrl(store) {
  if (!store?.logo) return null
  return `${API}/stores/files/stores/${store.id}/${store.logo}`
}

function productImageUrl(product) {
  const imgs = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])
  if (!imgs[0]) return null
  return `${PB}/api/files/products/${product.id}/${imgs[0]}?thumb=400x400`
}

function auctionImageUrl(auction) {
  const imgs = Array.isArray(auction.images) ? auction.images : (auction.images ? [auction.images] : [])
  if (!imgs[0]) return null
  return `${PB}/api/files/auctions/${auction.id}/${imgs[0]}?thumb=600x400`
}

function storeInitials(name) {
  return (name || 'TT').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Countdown reactivo ─────────────────────────────────────────────────────────
function timeLeft(endDateStr) {
  const diff = new Date(endDateStr).getTime() - now.value
  if (diff <= 0) return 'Finalizada'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

function urgencyColor(endDateStr) {
  const diff = new Date(endDateStr).getTime() - now.value
  if (diff <= 0) return 'text-[#555550]'
  if (diff < 3600000)  return 'text-red-400'
  if (diff < 86400000) return 'text-amber-400'
  return 'text-[#c9a96e]'
}

// ── Precio ────────────────────────────────────────────────────────────────────
function formatPrice(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0)
}

// ── Rating estrellas ───────────────────────────────────────────────────────────
function ratingStars(rating) {
  const r = Math.round(Number(rating || 0) * 2) / 2
  return { full: Math.floor(r), half: r % 1 !== 0, empty: 5 - Math.floor(r) - (r % 1 !== 0 ? 1 : 0) }
}

const vendorFeatures = [
  { title: 'Tienda propia', desc: 'Tu catálogo y marca en una página dedicada' },
  { title: 'Subastas activas', desc: 'Publica productos con pujas en tiempo real' },
  { title: 'Panel de control', desc: 'Gestiona pedidos, stock y resultados en minutos' },
  { title: 'Mayor alcance', desc: 'Conecta con compradores de todo el país' },
]

onMounted(() => {
  fetchStores()
  fetchProducts()
  fetchAuctions()
  fetchCategories()
  ticker = setInterval(() => { now.value = Date.now() }, 1000)
})
onBeforeUnmount(() => clearInterval(ticker))
</script>

<template>
  <AppNavbar />

  <main class="home-shell text-[#f0ede8]">

    <!-- ══ HERO ══════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden border-b border-[#202020]">
      <div class="absolute inset-0 opacity-80 pointer-events-none bg-[radial-gradient(circle_at_top,#2f2718_0%,#0a0a0a_45%)]" />
      <div class="absolute inset-0 opacity-[0.08] pointer-events-none" style="background-image:linear-gradient(#c9a96e 1px,transparent 1px),linear-gradient(90deg,#c9a96e 1px,transparent 1px);background-size:72px 72px;" />
      <div class="relative max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-20 md:py-28">
        <div class="max-w-4xl mx-auto text-center">
          <p class="section-label mb-6">Marketplace de tecnología</p>
          <h1 class="font-display text-5xl md:text-7xl leading-[0.95] mb-7">
            Tecnología y electrónica
            <span class="block text-[#c9a96e]">en una sola vitrina</span>
          </h1>
          <p class="text-[#8f8b82] text-base md:text-lg leading-relaxed max-w-2xl mx-auto mb-10">
            Descubre tiendas, productos y subastas de tecnología. Compra con confianza
            o vende con tu propia tienda verificada.
          </p>
          <div class="flex flex-wrap justify-center gap-4">
            <RouterLink to="/stores"   class="btn-gold">Explorar tiendas</RouterLink>
            <RouterLink to="/products" class="btn-outline">Ver productos</RouterLink>
            <RouterLink to="/auctions" class="btn-outline">Ver subastas</RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ CATEGORÍAS ════════════════════════════════════════════ -->
    <section class="w-full border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-14">
        <div class="flex items-end justify-between mb-6 gap-4">
          <div>
            <p class="section-label mb-2">Categorías</p>
            <h2 class="font-display text-3xl font-light">Explora por sección</h2>
          </div>
          <!-- "Ver todas" abre el modal -->
          <button
            @click="showCatModal = true"
            class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors hidden md:flex items-center gap-1.5"
          >
            Ver todas
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <!-- Skeleton -->
        <div v-if="loadingCategories" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div v-for="i in 7" :key="i" class="skeleton h-20" />
        </div>

        <!-- Sin categorías -->
        <div v-else-if="!allCategories.length" class="text-center py-10 border border-[#1a1a1a]">
          <p class="text-[#444440] text-sm">Sin categorías registradas</p>
        </div>

        <!-- Grid: 7 categorías aleatorias -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <button
            v-for="cat in homeCategories"
            :key="cat.id"
            @click="goToCategory(cat)"
            class="category-tile"
          >
            <span class="category-label">{{ (cat.name || 'TT').slice(0, 2).toUpperCase() }}</span>
            <span class="category-name">{{ cat.name }}</span>
          </button>
        </div>

        <!-- "Ver todas" mobile -->
        <div class="mt-5 md:hidden text-center">
          <button
            @click="showCatModal = true"
            class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors"
          >Ver todas las categorías →</button>
        </div>
      </div>
    </section>

    <!-- ══ TIENDAS DESTACADAS ═════════════════════════════════════ -->
    <section class="w-full border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-16">
        <div class="flex items-end justify-between mb-8 gap-4">
          <div>
            <p class="section-label mb-2">Directorio</p>
            <h2 class="font-display text-3xl font-light">Tiendas verificadas</h2>
          </div>
          <RouterLink to="/stores" class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors hidden md:block">
            Ver todas
          </RouterLink>
        </div>

        <!-- Skeleton -->
        <div v-if="loadingStores" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="i in 3" :key="i" class="card-dark overflow-hidden">
            <div class="skeleton h-36 w-full" />
            <div class="p-5 space-y-3">
              <div class="flex items-center gap-3">
                <div class="skeleton w-10 h-10 shrink-0" />
                <div class="flex-1 space-y-2">
                  <div class="skeleton h-3 w-2/3" />
                  <div class="skeleton h-2 w-1/3" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sin tiendas -->
        <div v-else-if="!stores.length" class="text-center py-14 border border-[#1a1a1a]">
          <p class="font-display text-2xl font-light text-[#666259] mb-2">Aún no hay tiendas verificadas</p>
          <RouterLink to="/vendor" class="btn-gold inline-flex mt-5">Abrir mi tienda</RouterLink>
        </div>

        <!-- Grid de tiendas -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <RouterLink
            v-for="store in stores"
            :key="store.id"
            :to="`/stores/${store.slug || store.id}`"
            class="card-dark group overflow-hidden flex flex-col"
          >
            <!-- Banner fijo 144px -->
            <div class="h-36 shrink-0 bg-[#0f0f0f] overflow-hidden">
              <img
                v-if="storeBannerUrl(store)"
                :src="storeBannerUrl(store)"
                :alt="store.name"
                class="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center"
                style="background:linear-gradient(135deg,#111111 0%,#14110d 100%);"
              >
                <span class="font-display text-4xl font-light text-[#1e1b16]">{{ storeInitials(store.name) }}</span>
              </div>
            </div>

            <!-- Info -->
            <div class="p-5 flex items-center gap-3">
              <!-- Logo fijo 40×40 -->
              <div class="w-10 h-10 shrink-0 border border-[#222] bg-[#0f0f0f] overflow-hidden">
                <img
                  v-if="storeLogoUrl(store)"
                  :src="storeLogoUrl(store)"
                  :alt="store.name"
                  class="w-full h-full object-cover object-center"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <span class="font-display text-sm font-light text-[#2a2520]">{{ storeInitials(store.name).charAt(0) }}</span>
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-medium text-[#e8e4de] truncate group-hover:text-[#c9a96e] transition-colors">{{ store.name }}</h3>
                <div class="flex items-center gap-2 mt-0.5">
                  <p v-if="store.location" class="text-[11px] text-[#4a4845] truncate">{{ store.location }}</p>
                  <!-- Estrellas -->
                  <div class="flex items-center gap-0.5 ml-auto shrink-0">
                    <template v-for="n in ratingStars(store.rating).full" :key="`f${n}`">
                      <svg class="w-2.5 h-2.5 text-[#c9a96e]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    </template>
                    <template v-for="n in ratingStars(store.rating).empty" :key="`e${n}`">
                      <svg class="w-2.5 h-2.5 text-[#1e1b16]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    </template>
                    <span class="text-[10px] text-[#555550] tabular-nums ml-1">{{ Number(store.rating || 0).toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </RouterLink>
        </div>

        <div class="mt-6 md:hidden text-center">
          <RouterLink to="/stores" class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors">
            Ver todas las tiendas →
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ══ PRODUCTOS RECIENTES ════════════════════════════════════ -->
    <section class="w-full bg-[#080808] border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-16">
        <div class="flex items-end justify-between mb-8 gap-4">
          <div>
            <p class="section-label mb-2">Selección</p>
            <h2 class="font-display text-3xl font-light">Productos recientes</h2>
          </div>
          <RouterLink to="/products" class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors hidden md:block">
            Ver todos
          </RouterLink>
        </div>

        <!-- Skeleton -->
        <div v-if="loadingProducts" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="i in 4" :key="i" class="card-dark overflow-hidden">
            <div class="skeleton aspect-square w-full" />
            <div class="p-4 space-y-2">
              <div class="skeleton h-2 w-3/4" />
              <div class="skeleton h-3 w-1/2" />
              <div class="skeleton h-4 w-1/3 mt-1" />
            </div>
          </div>
        </div>

        <!-- Sin productos -->
        <div v-else-if="!products.length" class="text-center py-14 border border-[#1a1a1a]">
          <p class="font-display text-2xl font-light text-[#666259]">Aún no hay productos activos</p>
        </div>

        <!-- Grid de productos -->
        <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <RouterLink
            v-for="product in products"
            :key="product.id"
            :to="`/products/${product.id}`"
            class="card-dark group flex flex-col overflow-hidden"
          >
            <div class="aspect-square overflow-hidden bg-[#0f0f0f]">
              <img
                v-if="productImageUrl(product)"
                :src="productImageUrl(product)"
                :alt="product.name"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div v-else class="w-full h-full flex items-center justify-center" style="background:linear-gradient(135deg,#111111 0%,#14110d 100%);">
                <svg class="w-8 h-8 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
            <div class="p-4 flex flex-col gap-1.5 flex-1">
              <p class="text-[10px] text-[#666259] truncate">{{ product.expand?.store?.name || '—' }}</p>
              <h3 class="text-sm text-[#f0ede8] leading-snug line-clamp-2 group-hover:text-[#c9a96e] transition-colors">{{ product.name }}</h3>
              <p class="text-[#c9a96e] font-medium mt-auto tabular-nums">{{ formatPrice(product.price) }}</p>
            </div>
          </RouterLink>
        </div>

        <div class="mt-6 md:hidden text-center">
          <RouterLink to="/products" class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors">
            Ver todos los productos →
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ══ SUBASTAS ACTIVAS ═══════════════════════════════════════ -->
    <section class="w-full border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-16">
        <div class="flex items-end justify-between mb-8 gap-4">
          <div>
            <p class="section-label mb-2">En vivo</p>
            <h2 class="font-display text-3xl font-light">Subastas activas</h2>
          </div>
          <RouterLink to="/auctions" class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors hidden md:block">
            Ver todas
          </RouterLink>
        </div>

        <!-- Skeleton -->
        <div v-if="loadingAuctions" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="i in 3" :key="i" class="card-dark overflow-hidden">
            <div class="skeleton h-44 w-full" />
            <div class="p-5 space-y-3">
              <div class="skeleton h-3 w-2/3" />
              <div class="skeleton h-px w-full mt-2" />
              <div class="flex justify-between pt-1">
                <div class="skeleton h-5 w-24" />
                <div class="skeleton h-3 w-16" />
              </div>
            </div>
          </div>
        </div>

        <!-- Sin subastas -->
        <div v-else-if="!auctions.length" class="text-center py-14 border border-[#1a1a1a]">
          <p class="font-display text-2xl font-light text-[#666259] mb-2">No hay subastas activas</p>
          <RouterLink to="/auctions" class="btn-outline text-xs mt-4 inline-flex">Ver historial</RouterLink>
        </div>

        <!-- Grid de subastas -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <RouterLink
            v-for="auction in auctions"
            :key="auction.id"
            to="/auctions"
            class="card-dark group flex flex-col overflow-hidden"
          >
            <!-- Imagen fija 176px -->
            <div class="h-44 shrink-0 bg-[#0f0f0f] overflow-hidden relative">
              <img
                v-if="auctionImageUrl(auction)"
                :src="auctionImageUrl(auction)"
                :alt="auction.title"
                class="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
              />
              <div v-else class="w-full h-full flex items-center justify-center" style="background:linear-gradient(135deg,#111111 0%,#14110d 100%);">
                <svg class="w-10 h-10 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                  <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>

              <!-- Gradiente + countdown -->
              <div class="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
              <div class="absolute bottom-3 left-4 flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-current animate-pulse" :class="urgencyColor(auction.end_date)" />
                <span class="text-[11px] font-mono font-medium tabular-nums" :class="urgencyColor(auction.end_date)">
                  {{ timeLeft(auction.end_date) }}
                </span>
              </div>

              <!-- Pujas -->
              <div v-if="auction.bids_count > 0" class="absolute top-3 left-3">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-wide uppercase bg-black/70 border border-[#222] text-[#c9a96e]">
                  {{ auction.bids_count }} puja{{ auction.bids_count !== 1 ? 's' : '' }}
                </span>
              </div>
            </div>

            <!-- Info -->
            <div class="p-5 flex flex-col gap-3 flex-1">
              <h3 class="text-sm font-medium text-[#e8e4de] leading-snug line-clamp-2 group-hover:text-[#c9a96e] transition-colors">{{ auction.title }}</h3>
              <div class="mt-auto pt-3 border-t border-[#141414] flex items-center justify-between gap-2">
                <div>
                  <p class="text-[9px] tracking-widest uppercase text-[#444440] mb-0.5">
                    {{ (auction.bids_count || 0) > 0 ? 'Oferta actual' : 'Precio base' }}
                  </p>
                  <span class="text-lg font-semibold text-[#c9a96e] tabular-nums">
                    {{ formatPrice(auction.current_price || auction.start_price) }}
                  </span>
                </div>
                <span class="text-[10px] tracking-[0.15em] uppercase text-[#3a3835] border border-[#1e1e1e] px-2 py-1">
                  Ver subasta →
                </span>
              </div>
            </div>
          </RouterLink>
        </div>

        <div class="mt-6 md:hidden text-center">
          <RouterLink to="/auctions" class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors">
            Ver todas las subastas →
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ══ CTA VENDEDORES ═════════════════════════════════════════ -->
    <section class="w-full border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-20">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <p class="section-label mb-3">Para vendedores</p>
            <h2 class="font-display text-4xl md:text-5xl font-light leading-tight mb-5">
              Crea una vitrina profesional para tu negocio
            </h2>
            <p class="text-[#8f8b82] max-w-xl mb-7">
              Publica productos, activa subastas y gestiona pedidos desde un panel
              diseñado para vender con presencia visual de alto nivel.
            </p>
            <RouterLink to="/vendor" class="btn-gold">Vender en TuVentaConfiada</RouterLink>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div v-for="feat in vendorFeatures" :key="feat.title" class="card-dark p-5">
              <h3 class="text-sm text-[#c9a96e] mb-2 uppercase tracking-[0.14em]">{{ feat.title }}</h3>
              <p class="text-[12px] text-[#7f7a70] leading-relaxed">{{ feat.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

  </main>

  <!-- ══ MODAL CATEGORÍAS ══════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="cat-modal">
      <div
        v-if="showCatModal"
        class="fixed inset-0 z-[200] flex items-center justify-center p-4"
        @click.self="showCatModal = false"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="showCatModal = false" />

        <!-- Panel -->
        <div class="relative w-full max-w-3xl max-h-[80vh] bg-[#0c0c0c] border border-[#1e1e1e] flex flex-col overflow-hidden">

          <!-- Cabecera -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a] shrink-0">
            <div>
              <p class="text-[9px] tracking-[0.2em] uppercase text-[#555550] mb-0.5">Catálogo</p>
              <h2 class="font-display text-xl font-light text-[#f0ede8]">Todas las categorías</h2>
            </div>
            <button
              @click="showCatModal = false"
              class="w-8 h-8 flex items-center justify-center border border-[#222] text-[#555550] hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors"
              aria-label="Cerrar"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <!-- Grid de categorías -->
          <div class="overflow-y-auto flex-1 p-6">
            <div v-if="loadingCategories" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <div v-for="i in 8" :key="i" class="skeleton h-16" />
            </div>

            <div v-else-if="!allCategories.length" class="flex items-center justify-center py-16">
              <p class="text-[#444440] text-sm">Sin categorías registradas</p>
            </div>

            <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <button
                v-for="cat in allCategories"
                :key="cat.id"
                @click="goToCategory(cat)"
                class="group flex flex-col items-center justify-center gap-1.5 py-4 px-3 border border-[#1a1a1a] bg-[#101010] hover:border-[#c9a96e55] hover:bg-[#110f0a] transition-all duration-200"
              >
                <!-- Icono / iniciales -->
                <span class="text-xs tracking-[0.2em] uppercase text-[#c9a96e] group-hover:text-[#d4b97e] transition-colors">
                  {{ (cat.name || 'TT').slice(0, 2).toUpperCase() }}
                </span>
                <span class="text-[11px] tracking-[0.06em] uppercase text-[#8f8b82] group-hover:text-[#c9a96e] transition-colors text-center leading-tight">
                  {{ cat.name }}
                </span>
              </button>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-3 border-t border-[#1a1a1a] shrink-0 flex items-center justify-between">
            <span class="text-[10px] tracking-widest uppercase text-[#333330]">
              {{ allCategories.length }} categoría{{ allCategories.length !== 1 ? 's' : '' }}
            </span>
            <RouterLink
              to="/products"
              @click="showCatModal = false"
              class="text-[10px] tracking-[0.15em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors"
            >
              Ver todos los productos →
            </RouterLink>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <AppFooter />
</template>

<style scoped>
.home-shell {
  background: linear-gradient(180deg, #0a0a0a 0%, #090909 38%, #0a0a0a 100%);
  width: 100%;
  overflow-x: hidden;
}

.category-tile {
  border: 1px solid #1f1f1f;
  background-color: #101010;
  min-height: 5.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  transition: border-color 0.25s, transform 0.25s;
}
.category-tile:hover { border-color: #c9a96e66; transform: translateY(-2px); }

.category-label {
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #c9a96e;
}
.category-name {
  font-size: 0.67rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8f8b82;
  text-align: center;
}

/* ── Animación modal categorías ── */
.cat-modal-enter-active { transition: opacity 0.2s ease; }
.cat-modal-leave-active { transition: opacity 0.15s ease; }
.cat-modal-enter-from,
.cat-modal-leave-to     { opacity: 0; }

.cat-modal-enter-active .relative,
.cat-modal-leave-active .relative {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
}
.cat-modal-enter-from .relative,
.cat-modal-leave-to   .relative { transform: translateY(12px) scale(0.98); opacity: 0; }
</style>
