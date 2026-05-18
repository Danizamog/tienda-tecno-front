<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import QuickViewModal from '@/components/ui/QuickViewModal.vue'
import { useAuctions } from '@/composables/useAuctions'
import { useScrollReveal } from '@/composables/useScrollReveal'
import { useCountUp } from '@/composables/useCountUp'
import { vTilt } from '@/composables/useTilt3D'

const API    = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB     = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')
const router = useRouter()

const { subscribeToAuction } = useAuctions()
useScrollReveal()

// Stats animados del hero (count-up al entrar al viewport)
const { value: auctionsValue, elRef: auctionsRef } = useCountUp(24,  { suffix: 'h', duration: 1700 })
const { value: verifiedValue, elRef: verifiedRef } = useCountUp(100, { suffix: '%', duration: 2000 })
const { value: productsValue, elRef: productsRef } = useCountUp(0,   { raw: '∞' })

// Quick view del producto
const quickViewProduct = ref(null)
function openQuickView(product, evt) {
  if (evt) {
    evt.preventDefault()
    evt.stopPropagation()
  }
  const card = evt?.currentTarget?.closest('.product-card')
  if (card) {
    card.classList.add('is-qv-expanding')
    card.addEventListener('animationend', () => card.classList.remove('is-qv-expanding'), { once: true })
  }
  quickViewProduct.value = product
}
function closeQuickView() {
  quickViewProduct.value = null
}

// Helpers para crossfade de imagen secundaria
function productImagesArr(product) {
  return Array.isArray(product?.images) ? product.images : (product?.images ? [product.images] : [])
}
function productImageUrlByIdx(product, idx) {
  const imgs = productImagesArr(product)
  if (!imgs[idx]) return null
  return `${PB}/api/files/products/${product.id}/${imgs[idx]}?thumb=600x800`
}

// Items del marquee — frases editoriales
const marqueeItems = [
  { text: 'Nueva colección', em: false },
  { text: 'Subastas activas', em: true },
  { text: 'Tiendas verificadas', em: false },
  { text: 'Envío en 48h', em: false },
  { text: 'Catálogo curado', em: true },
  { text: 'Pagos seguros', em: false },
]

// ── Estado ────────────────────────────────────────────────────────────────────
const stores          = ref([])
const products        = ref([])
const auctions        = ref([])
const allCategories   = ref([])
const heroTiles       = ref([])
const heroProductsPool = ref([])
const heroRevealEl    = ref(null)

const loadingStores     = ref(true)
const loadingProducts   = ref(true)
const loadingAuctions   = ref(true)
const loadingCategories = ref(true)

const showCatModal = ref(false)

const now = ref(Date.now())
let ticker = null

const homeCategories = computed(() => shuffle(allCategories.value).slice(0, 7))

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

async function fetchStores() {
  try {
    const res  = await fetch(`${API}/stores/featured`)
    const data = await res.json()
    stores.value = shuffle(data.items || []).slice(0, 3)
  } catch { stores.value = [] }
  finally   { loadingStores.value = false }
}

async function fetchProducts() {
  try {
    const res  = await fetch(`${API}/products?status=active&sort=-created&perPage=24`)
    const data = await res.json()
    const items = shuffle(data.items || [])
    products.value = items.slice(0, 4)
    // Guardamos un pool grande para poder re-randomizar las imágenes del hero
    // en cada ciclo de la animación (cada 14s)
    heroProductsPool.value = items.filter(p => productImageUrl(p)).slice(0, 20)
    // Esperar a que el DOM termine de actualizarse antes de medir el hero
    await nextTick()
    setupHeroTiles()
    preloadHeroImages()
  } catch { products.value = [] }
  finally   { loadingProducts.value = false }
}

// Genera 5 cuadritos en posiciones aleatorias del grid del hero.
//
// Cada tile tiene dimensiones FIJAS en px con aspect 3:4 → las imágenes
// (que son 600×800, mismo aspect) encajan perfectamente sin recortes.
// Las CSS variables `--tile-w/-h` sincronizan el grid de fondo con el
// tamaño real de los tiles → grid y cuadros se alinean pixel-perfect.
function setupHeroTiles() {
  if (!heroRevealEl.value) {
    heroTiles.value = []
    return
  }
  const rect = heroRevealEl.value.getBoundingClientRect()
  const heroW = rect.width
  const heroH = rect.height
  if (heroW < 60 || heroH < 80) {
    heroTiles.value = []
    return
  }

  // Tamaño del tile responsivo: escala con el hero pero acotado.
  // Aspect 3:4 vertical = mismo aspect que las imágenes de producto.
  const TILE_W = Math.max(96, Math.min(160, Math.round(heroW / 12)))
  const TILE_H = Math.round(TILE_W * 4 / 3)

  // Cuadrícula en celdas enteras: aprovecha todo el ancho/alto
  const cols = Math.max(2, Math.floor(heroW / TILE_W))
  const rows = Math.max(2, Math.floor(heroH / TILE_H))

  // Sincroniza el grid CSS con el tamaño real de los tiles
  heroRevealEl.value.style.setProperty('--tile-w', `${TILE_W}px`)
  heroRevealEl.value.style.setProperty('--tile-h', `${TILE_H}px`)

  const items = shuffle(heroProductsPool.value)
  if (!items.length) {
    heroTiles.value = []
    return
  }

  // Zona central excluida (donde está el headline) — ~50% ancho × ~50% alto
  const cxStart = Math.floor(cols * 0.25)
  const cxEnd   = Math.floor(cols * 0.75)
  const cyStart = Math.floor(rows * 0.30)
  const cyEnd   = Math.floor(rows * 0.70)

  const used = new Set()
  const tiles = []
  const count = Math.min(items.length, 8)

  for (let i = 0; i < count; i++) {
    let attempts = 0
    while (attempts < 60) {
      const col = Math.floor(Math.random() * cols)
      const row = Math.floor(Math.random() * rows)

      // Saltar zona del headline
      if (col >= cxStart && col <= cxEnd && row >= cyStart && row <= cyEnd) {
        attempts++; continue
      }
      // Evitar celdas adyacentes para distribuir los tiles
      const key = `${col}-${row}`
      const tooClose = [...used].some(k => {
        const [c, r] = k.split('-').map(Number)
        return Math.abs(c - col) <= 1 && Math.abs(r - row) <= 1
      })
      if (used.has(key) || tooClose) { attempts++; continue }

      used.add(key)
      tiles.push({
        left:   `${col * TILE_W}px`,
        top:    `${row * TILE_H}px`,
        width:  `${TILE_W}px`,
        height: `${TILE_H}px`,
        src: productImageUrl(items[i]),
      })
      break
    }
  }
  heroTiles.value = tiles
}

async function fetchAuctions() {
  try {
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
  return `${PB}/api/files/products/${product.id}/${imgs[0]}?thumb=600x800`
}

function auctionImageUrl(auction) {
  const imgs = Array.isArray(auction.images) ? auction.images : (auction.images ? [auction.images] : [])
  if (!imgs[0]) return null
  return `${PB}/api/files/auctions/${auction.id}/${imgs[0]}?thumb=800x600`
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

function urgencyClass(endDateStr) {
  const diff = new Date(endDateStr).getTime() - now.value
  if (diff <= 0) return 'urgency-gold'
  if (diff < 3600000)  return 'urgency-red'
  if (diff < 86400000) return 'urgency-amber'
  return 'urgency-gold'
}

function formatPrice(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0)
}

function productPricing(product) {
  const base = Number(product?.price || 0)
  const pct  = Number(product?.discount_percent || 0)
  const amt  = Number(product?.discount_amount  || 0)
  let final = base, label = ''
  if (pct > 0)      { final = Math.round(base * (1 - pct / 100)); label = `-${pct}%` }
  else if (amt > 0) { final = Math.max(0, base - amt);            label = `-${formatPrice(amt)}` }
  return { base, final, hasDiscount: final < base, label }
}

function ratingStars(rating) {
  const r = Math.round(Number(rating || 0) * 2) / 2
  return { full: Math.floor(r), half: r % 1 !== 0, empty: 5 - Math.floor(r) - (r % 1 !== 0 ? 1 : 0) }
}

// ── Asignación de icono por nombre de categoría ────────────────────────────────
// Devuelve el `id` de un <symbol> definido en el SVG sprite del template.
function categoryIcon(name) {
  const n = (name || '').toLowerCase()
  if (/(camis|polo|t-?shirt|blusa|top|playera)/.test(n)) return 'icon-shirt'
  if (/(pantal|jean|short|leg)/.test(n))                 return 'icon-pants'
  if (/(chamarra|chaqueta|abrig|saco|hood|sweat)/.test(n)) return 'icon-jacket'
  if (/(vestid|falda|dress)/.test(n))                    return 'icon-dress'
  if (/(zapat|tenis|calza|sneaker|bota)/.test(n))        return 'icon-shoe'
  if (/(gorra|sombrero|hat|cap|beanie|gorro)/.test(n))   return 'icon-hat'
  if (/(bols|mochil|cartera|bag|backpack)/.test(n))      return 'icon-bag'
  if (/(reloj|watch|joya|jewel|anillo)/.test(n))         return 'icon-watch'
  if (/(lent|gafa|sunglass)/.test(n))                    return 'icon-glasses'
  if (/(cintur|belt|accesori)/.test(n))                  return 'icon-belt'
  if (/(electron|tecno|laptop|celular|tel[eé]fono)/.test(n)) return 'icon-laptop'
  if (/(auric|headph|aud[ií]o)/.test(n))                 return 'icon-headphones'
  return 'icon-tag'
}

const vendorFeatures = [
  {
    title: 'Tienda propia',
    desc: 'Tu catálogo y marca en una página dedicada, lista para vender desde el primer día.',
    icon: 'm3 9 9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10',
  },
  {
    title: 'Subastas activas',
    desc: 'Publica productos con pujas en tiempo real y maximiza el valor de cada venta.',
    icon: 'm14 5 6 6M9 11l-7 7v3h3l7-7M14 5l3-3 5 5-3 3M9 11l5 5',
  },
  {
    title: 'Panel de control',
    desc: 'Gestiona pedidos, stock y resultados desde un dashboard pensado para vendedores.',
    icon: 'M3 3v18h18M7 14l4-4 4 4 5-7',
  },
  {
    title: 'Mayor alcance',
    desc: 'Conecta con compradores de todo el país a través de un marketplace verificado.',
    icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  },
]

let unsubAuctions = null

function onAuctionEvent(e) {
  if (!e?.record) return
  const idx = auctions.value.findIndex(a => a.id === e.record.id)
  if (idx === -1) return
  if (e.action === 'delete' || e.record.status !== 'active') {
    auctions.value.splice(idx, 1)
    return
  }
  const prev = auctions.value[idx]
  auctions.value[idx] = { ...prev, ...e.record, expand: prev.expand }
}

function handleRevealIteration(e) {
  // Cuando el sweep completa un ciclo, re-randomizamos las celdas.
  // El swap ocurre cuando el haz está fuera del viewport del mask,
  // así que el cambio de src/posición es totalmente invisible y la
  // animación se siente continua entre ciclos.
  if (e.animationName === 'hero-reveal-sweep') {
    setupHeroTiles()
  }
}

// Precarga las imágenes del pool para que el swap entre ciclos sea
// instantáneo y no se vea ningún parpadeo mientras el browser fetcha.
function preloadHeroImages() {
  for (const product of heroProductsPool.value) {
    const url = productImageUrl(product)
    if (!url) continue
    const img = new Image()
    img.src = url
  }
}

// Recalcula los tiles cuando cambia el tamaño del viewport (debounced)
let resizeTimer = null
function handleHeroResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    setupHeroTiles()
  }, 180)
}

onMounted(() => {
  fetchStores()
  fetchProducts()
  fetchAuctions()
  fetchCategories()
  ticker = setInterval(() => { now.value = Date.now() }, 1000)
  unsubAuctions = subscribeToAuction('*', onAuctionEvent)
  // Re-randomización al final de cada ciclo del sweep
  if (heroRevealEl.value) {
    heroRevealEl.value.addEventListener('animationiteration', handleRevealIteration)
  }
  window.addEventListener('resize', handleHeroResize)
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  clearTimeout(resizeTimer)
  if (unsubAuctions) unsubAuctions()
  window.removeEventListener('resize', handleHeroResize)
  if (heroRevealEl.value) {
    heroRevealEl.value.removeEventListener('animationiteration', handleRevealIteration)
  }
})
</script>

<template>
  <!-- SVG sprite con todos los iconos de categorías (oculto, referenciado por <use>) -->
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <defs>
      <symbol id="icon-shirt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 3a4 4 0 0 1-8 0L3 6l3 4 2-1v12h8V9l2 1 3-4z"/>
      </symbol>
      <symbol id="icon-pants" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 3h12l-1 9-2 9h-3l-1-9h-1l-1 9H6L4 12z"/>
        <path d="M6 3h12"/>
      </symbol>
      <symbol id="icon-jacket" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 6c2-2 4-3 7-3s5 1 7 3l-2 4v11H7V10z"/>
        <path d="M12 3v18"/>
      </symbol>
      <symbol id="icon-dress" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 3h6l1 5 3 13H5l3-13z"/>
      </symbol>
      <symbol id="icon-shoe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 15c0-1 1-2 2-2l4-1 3-4 4 1c2 .5 5 2 5 4v3H3z"/>
        <path d="M9 13l3-4"/>
      </symbol>
      <symbol id="icon-hat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 17h16M6 17c0-7 2-12 6-12s6 5 6 12"/>
      </symbol>
      <symbol id="icon-bag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2"/>
      </symbol>
      <symbol id="icon-watch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="6"/>
        <path d="M9 3h6l-1 3M9 21h6l-1-3M12 9v3l2 1"/>
      </symbol>
      <symbol id="icon-glasses" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="14" r="3"/>
        <circle cx="18" cy="14" r="3"/>
        <path d="M9 14h6M2 9l3 3M22 9l-3 3"/>
      </symbol>
      <symbol id="icon-belt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="9" width="18" height="6" rx="1"/>
        <rect x="10" y="11" width="4" height="2"/>
      </symbol>
      <symbol id="icon-laptop" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="12" rx="1"/>
        <path d="M2 20h20"/>
      </symbol>
      <symbol id="icon-headphones" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-2v-7h4M4 14v5a2 2 0 0 0 2 2h2v-7H4"/>
      </symbol>
      <symbol id="icon-tag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 12l-8 8a2 2 0 0 1-3 0l-7-7a2 2 0 0 1 0-3l8-8h7v7z"/>
        <circle cx="15" cy="9" r="1.2"/>
      </symbol>
    </defs>
  </svg>

  <AppNavbar />

  <main class="home-shell text-text-primary">

    <!-- ══ HERO ══════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden border-b border-border-subtle">
      <!-- Capas de fondo animado -->
      <div class="hero-glow" />

      <!-- Reveal: grid + imágenes de productos que solo aparecen
           cuando la línea de luz pasa por encima -->
      <div ref="heroRevealEl" class="hero-reveal" aria-hidden="true">
        <div class="hero-reveal-grid" />
        <div
          v-for="(tile, i) in heroTiles"
          :key="'tile-' + i"
          class="hero-reveal-tile"
          :style="{ left: tile.left, top: tile.top, width: tile.width, height: tile.height }"
        >
          <img v-if="tile.src" :src="tile.src" alt="" loading="lazy" />
        </div>
      </div>

      <div class="sweep-shine" />
      <div class="sweep-shine-echo" />
      <div class="hero-vignette" />

      <div class="relative max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36 lg:py-44">
        <div class="max-w-4xl mx-auto text-center">

          <div class="hero-divider reveal">
            <span class="line" />
            <span class="dot" />
            <span class="line" />
          </div>

          <p class="section-label justify-center mb-7 reveal reveal-delay-1">
            Marketplace de moda
          </p>

          <h1 class="font-display font-light reveal reveal-delay-2" style="font-size: clamp(2.6rem, 7vw, 5.5rem); line-height: 0.98; letter-spacing: -0.012em;">
            Moda exclusiva,
            <span class="block italic text-accent mt-1" style="font-weight: 400;">
              tu venta de confianza
            </span>
          </h1>

          <p class="text-text-muted text-base md:text-lg leading-relaxed max-w-2xl mx-auto mt-9 mb-12 reveal reveal-delay-3">
            Descubre ropa, accesorios y subastas de vendedores verificados.
            Compra con total seguridad o abre tu propia tienda en minutos.
          </p>

          <div class="flex flex-wrap justify-center gap-3 sm:gap-4 reveal reveal-delay-4">
            <RouterLink to="/stores" class="btn-gold">
              <span>Explorar tiendas</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
            </RouterLink>
            <RouterLink to="/products" class="btn-outline"><span>Ver productos</span></RouterLink>
            <RouterLink to="/auctions" class="btn-outline">
              <span>Ver subastas</span>
            </RouterLink>
          </div>

          <!-- Stats row debajo del hero (con count-up animado) -->
          <div class="grid grid-cols-3 max-w-xl mx-auto mt-16 sm:mt-20 reveal reveal-delay-5">
            <div class="px-2 sm:px-4 border-r border-border-subtle">
              <p ref="auctionsRef" class="font-display text-accent text-2xl sm:text-3xl font-light tabular-nums">
                +{{ auctionsValue }}
              </p>
              <p class="text-[9px] tracking-[0.28em] uppercase text-text-disabled mt-1">Subastas en vivo</p>
            </div>
            <div class="px-2 sm:px-4 border-r border-border-subtle">
              <p ref="verifiedRef" class="font-display text-accent text-2xl sm:text-3xl font-light tabular-nums">
                {{ verifiedValue }}
              </p>
              <p class="text-[9px] tracking-[0.28em] uppercase text-text-disabled mt-1">Tiendas verificadas</p>
            </div>
            <div class="px-2 sm:px-4">
              <p ref="productsRef" class="font-display text-accent text-2xl sm:text-3xl font-light tabular-nums">
                {{ productsValue }}
              </p>
              <p class="text-[9px] tracking-[0.28em] uppercase text-text-disabled mt-1">Productos curados</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ MARQUEE TICKER ═════════════════════════════════════════ -->
    <div class="marquee" aria-hidden="true">
      <div class="marquee-track">
        <!-- Duplicamos los items para crear un loop continuo -->
        <template v-for="loop in 2" :key="loop">
          <div v-for="(item, i) in marqueeItems" :key="`l${loop}-${i}`" class="marquee-item">
            <span :class="{ italic: item.em }">
              <em v-if="item.em">{{ item.text }}</em>
              <template v-else>{{ item.text }}</template>
            </span>
            <span class="marquee-dot" />
          </div>
        </template>
      </div>
    </div>

    <!-- ══ CATEGORÍAS (scroll horizontal) ════════════════════════ -->
    <section class="w-full border-b border-border-subtle">
      <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div class="flex items-end justify-between mb-8 gap-4 reveal">
          <div>
            <p class="section-label mb-3">Categorías</p>
            <h2 class="section-heading">Explora por <em>sección</em></h2>
          </div>
          <button
            @click="showCatModal = true"
            class="see-all hidden md:inline-flex"
          >
            Ver todas
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>

        <div v-if="loadingCategories" class="flex gap-4 overflow-hidden">
          <div v-for="i in 6" :key="i" class="skeleton shrink-0" style="width: 9.5rem; height: 12rem;" />
        </div>

        <div v-else-if="!allCategories.length" class="text-center py-10 border border-border-subtle">
          <p class="text-text-disabled text-sm">Sin categorías registradas</p>
        </div>

        <div v-else class="cat-scroll reveal">
          <button
            v-for="cat in allCategories"
            :key="cat.id"
            @click="goToCategory(cat)"
            class="cat-scroll-item"
          >
            <svg class="cat-scroll-icon"><use :href="`#${categoryIcon(cat.name)}`" /></svg>
            <span class="cat-scroll-name">{{ cat.name }}</span>
          </button>
        </div>

        <div class="mt-6 md:hidden text-center">
          <button @click="showCatModal = true" class="see-all">
            Ver todas las categorías
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </section>

    <!-- ══ TIENDAS DESTACADAS ═════════════════════════════════════ -->
    <section class="w-full border-b border-border-subtle">
      <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24">
        <div class="flex items-end justify-between mb-10 gap-4 reveal">
          <div>
            <p class="section-label mb-3">Directorio</p>
            <h2 class="section-heading">Tiendas <em>verificadas</em></h2>
          </div>
          <RouterLink to="/stores" class="see-all hidden md:inline-flex">
            Ver todas
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </RouterLink>
        </div>

        <div v-if="loadingStores" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="i in 3" :key="i" class="store-card">
            <div class="skeleton h-44 w-full" />
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

        <div v-else-if="!stores.length" class="text-center py-16 border border-border-subtle">
          <p class="font-display text-2xl font-light text-text-muted mb-2">Aún no hay tiendas verificadas</p>
          <RouterLink to="/vendor" class="btn-gold inline-flex mt-5">Abrir mi tienda</RouterLink>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <RouterLink
            v-for="(store, i) in stores"
            :key="store.id"
            :to="`/stores/${store.slug || store.id}`"
            v-tilt="{ max: 5, scale: 1.01 }"
            class="store-card group reveal"
            :class="`reveal-delay-${i + 1}`"
          >
            <div class="store-banner">
              <img
                v-if="storeBannerUrl(store)"
                :src="storeBannerUrl(store)"
                :alt="store.name"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <span class="font-display text-5xl font-light text-text-disabled">{{ storeInitials(store.name) }}</span>
              </div>

              <span class="store-verified-badge">
                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                Verificada
              </span>
            </div>

            <div class="p-5 flex items-center gap-4">
              <div class="w-12 h-12 shrink-0 border border-border-default bg-surface-overlay overflow-hidden">
                <img
                  v-if="storeLogoUrl(store)"
                  :src="storeLogoUrl(store)"
                  :alt="store.name"
                  class="w-full h-full object-cover object-center"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <span class="font-display text-base font-light text-accent">{{ storeInitials(store.name).charAt(0) }}</span>
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors duration-300">{{ store.name }}</h3>
                <div class="flex items-center gap-2 mt-1">
                  <p v-if="store.location" class="text-[11px] text-text-muted truncate flex items-center gap-1">
                    <svg class="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 11a2 2 0 100-4 2 2 0 000 4z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9a7 7 0 11-14 0c0-3.866 3.134-7 7-7s7 3.134 7 7z M12 16l5 5-5-5z"/>
                    </svg>
                    {{ store.location }}
                  </p>
                  <div class="flex items-center gap-0.5 ml-auto shrink-0">
                    <template v-for="n in ratingStars(store.rating).full" :key="`f${n}`">
                      <svg class="w-2.5 h-2.5 text-accent" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    </template>
                    <template v-for="n in ratingStars(store.rating).empty" :key="`e${n}`">
                      <svg class="w-2.5 h-2.5 text-text-disabled" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    </template>
                    <span class="text-[10px] text-text-muted tabular-nums ml-1 font-medium">{{ Number(store.rating || 0).toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </RouterLink>
        </div>

        <div class="mt-7 md:hidden text-center">
          <RouterLink to="/stores" class="see-all">
            Ver todas las tiendas
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ══ PRODUCTOS RECIENTES ════════════════════════════════════ -->
    <section class="w-full bg-surface-base border-b border-border-subtle">
      <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24">
        <div class="flex items-end justify-between mb-10 gap-4 reveal">
          <div>
            <p class="section-label mb-3">Selección</p>
            <h2 class="section-heading">Productos <em>recientes</em></h2>
          </div>
          <RouterLink to="/products" class="see-all hidden md:inline-flex">
            Ver todos
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </RouterLink>
        </div>

        <div v-if="loadingProducts" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          <div v-for="i in 4" :key="i" class="product-card">
            <div class="skeleton aspect-[3/4] w-full" />
            <div class="p-4 space-y-2">
              <div class="skeleton h-2 w-3/4" />
              <div class="skeleton h-3 w-1/2" />
              <div class="skeleton h-4 w-1/3 mt-1" />
            </div>
          </div>
        </div>

        <div v-else-if="!products.length" class="text-center py-16 border border-border-subtle">
          <p class="font-display text-2xl font-light text-text-muted">Aún no hay productos activos</p>
        </div>

        <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          <RouterLink
            v-for="(product, i) in products"
            :key="product.id"
            :to="`/products/${product.id}`"
            v-tilt="{ max: 6, scale: 1.012 }"
            class="product-card group reveal"
            :class="`reveal-delay-${(i % 4) + 1}`"
          >
            <div class="product-media aspect-[3/4]">
              <!-- Crossfade entre la primera y segunda imagen al hover -->
              <div v-if="productImagesArr(product).length" class="product-media-stack" :class="{ 'has-crossfade': productImagesArr(product).length > 1 }">
                <img
                  :src="productImageUrlByIdx(product, 0)"
                  :alt="product.name"
                  class="img-front"
                />
                <img
                  v-if="productImagesArr(product).length > 1"
                  :src="productImageUrlByIdx(product, 1)"
                  :alt="product.name"
                  class="img-back"
                  loading="lazy"
                />
              </div>
              <div v-else class="w-full h-full flex items-center justify-center" style="background:linear-gradient(135deg,var(--surface-raised) 0%,var(--accent-soft) 100%);">
                <span class="font-display text-3xl font-light text-accent opacity-60">
                  {{ (product.name || '?').slice(0, 2).toUpperCase() }}
                </span>
              </div>

              <span v-if="product.expand?.category?.name" class="product-tag">
                {{ product.expand.category.name }}
              </span>

              <!-- Botón Quick View (esquina superior derecha) -->
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
                <div v-if="productPricing(product).hasDiscount" class="flex items-center gap-1.5 mb-0.5">
                  <span class="text-[9px] tracking-widest uppercase font-bold text-red-400 bg-red-900/20 border border-red-900/40 px-1.5 py-0.5">
                    {{ productPricing(product).label }}
                  </span>
                  <span class="text-text-disabled text-[11px] line-through tabular-nums">{{ formatPrice(productPricing(product).base) }}</span>
                </div>
                <p class="text-accent font-display text-xl font-medium tabular-nums">{{ formatPrice(productPricing(product).final) }}</p>
              </div>
            </div>
          </RouterLink>
        </div>

        <div class="mt-7 md:hidden text-center">
          <RouterLink to="/products" class="see-all">
            Ver todos los productos
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ══ SUBASTAS ACTIVAS ═══════════════════════════════════════ -->
    <section class="w-full border-b border-border-subtle relative overflow-hidden">
      <!-- Acento radial sutil en el fondo de esta sección -->
      <div class="absolute inset-0 pointer-events-none opacity-50" style="background: radial-gradient(ellipse at 20% 0%, rgba(239,68,68,0.04) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(201,169,110,0.04) 0%, transparent 50%);"></div>

      <div class="relative max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24">
        <div class="flex items-end justify-between mb-10 gap-4 reveal">
          <div>
            <p class="section-label mb-3">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400" style="animation: pulse-live 1.5s ease-in-out infinite;"></span>
              En vivo
            </p>
            <h2 class="section-heading">Subastas <em>activas</em></h2>
          </div>
          <RouterLink to="/auctions" class="see-all hidden md:inline-flex">
            Ver todas
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </RouterLink>
        </div>

        <div v-if="loadingAuctions" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="i in 3" :key="i" class="auction-card">
            <div class="skeleton h-56 w-full" />
            <div class="p-5 space-y-3">
              <div class="skeleton h-3 w-2/3" />
              <div class="skeleton h-px w-full mt-2" />
              <div class="flex justify-between pt-1">
                <div class="skeleton h-7 w-32" />
                <div class="skeleton h-3 w-16" />
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!auctions.length" class="text-center py-16 border border-border-subtle">
          <p class="font-display text-2xl font-light text-text-muted mb-2">No hay subastas activas</p>
          <RouterLink to="/auctions" class="btn-outline text-xs mt-4 inline-flex">Ver historial</RouterLink>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <RouterLink
            v-for="(auction, i) in auctions"
            :key="auction.id"
            :to="`/auctions/${auction.id}`"
            v-tilt="{ max: 5, scale: 1.01 }"
            class="auction-card group reveal"
            :class="`reveal-delay-${i + 1}`"
          >
            <div class="auction-media h-56">
              <img
                v-if="auctionImageUrl(auction)"
                :src="auctionImageUrl(auction)"
                :alt="auction.title"
              />
              <div v-else class="w-full h-full flex items-center justify-center" style="background:linear-gradient(135deg,var(--surface-raised) 0%,var(--accent-soft) 100%);">
                <svg class="w-12 h-12 text-text-disabled" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>

              <div class="auction-gradient" />

              <!-- Badge EN VIVO — solo si la subasta no ha expirado -->
              <div class="absolute top-3 right-3">
                <span v-if="timeLeft(auction.end_date) !== 'Finalizada'" class="badge-live">En vivo</span>
              </div>

              <!-- Badge pujas -->
              <div v-if="auction.bids_count > 0" class="absolute top-3 left-3">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] tracking-[0.18em] uppercase bg-black/72 backdrop-blur border border-accent-soft text-accent font-semibold">
                  <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 3l2.5 5 5.5.8-4 3.9.9 5.5L10 15.5 5.1 18.2 6 12.7 2 8.8l5.5-.8z"/></svg>
                  {{ auction.bids_count }} puja{{ auction.bids_count !== 1 ? 's' : '' }}
                </span>
              </div>

              <!-- Timer -->
              <div class="absolute bottom-3 left-3">
                <span class="auction-timer" :class="urgencyClass(auction.end_date)">
                  <span class="dot"></span>
                  {{ timeLeft(auction.end_date) }}
                </span>
              </div>
            </div>

            <div class="p-5 flex flex-col gap-3 flex-1">
              <h3 class="text-sm font-semibold text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors duration-300">{{ auction.title }}</h3>
              <div class="mt-auto pt-4 border-t border-border-subtle flex items-end justify-between gap-2">
                <div>
                  <p class="text-[9px] tracking-[0.22em] uppercase text-text-disabled mb-1.5">
                    {{ (auction.bids_count || 0) > 0 ? 'Oferta actual' : 'Precio base' }}
                  </p>
                  <span class="price-ticker">
                    {{ formatPrice(auction.current_price || auction.start_price) }}
                  </span>
                </div>
                <span class="text-[9px] tracking-[0.22em] uppercase text-text-muted group-hover:text-accent transition-colors duration-300 flex items-center gap-1.5 pb-1">
                  Pujar
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
                </span>
              </div>
            </div>
          </RouterLink>
        </div>

        <div class="mt-7 md:hidden text-center">
          <RouterLink to="/auctions" class="see-all">
            Ver todas las subastas
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ══ CTA VENDEDORES ═════════════════════════════════════════ -->
    <section class="w-full border-b border-border-subtle relative overflow-hidden">
      <div class="absolute inset-0 pointer-events-none opacity-60" style="background: radial-gradient(circle at 80% 50%, var(--accent-soft) 0%, transparent 55%);"></div>

      <div class="relative max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-28">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div class="reveal">
            <p class="section-label mb-4">Para vendedores</p>
            <h2 class="font-display font-light leading-[1.02] mb-6" style="font-size: clamp(2.2rem, 4.5vw, 3.5rem); letter-spacing: -0.012em;">
              Crea una vitrina
              <span class="block italic text-accent" style="font-weight:400;">profesional</span>
              para tu negocio
            </h2>
            <p class="text-text-muted max-w-xl mb-9 leading-relaxed">
              Publica productos, activa subastas en tiempo real y gestiona tus pedidos
              desde un panel diseñado para vender con presencia visual de alto nivel.
            </p>
            <RouterLink to="/vendor" class="btn-gold">
              <span>Vender en TuVentaConfiada</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
            </RouterLink>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div
              v-for="(feat, i) in vendorFeatures"
              :key="feat.title"
              class="feature-card reveal"
              :class="`reveal-delay-${i + 1}`"
            >
              <svg class="feature-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" :d="feat.icon" />
              </svg>
              <h3 class="text-sm text-accent mb-2 uppercase tracking-[0.18em] font-semibold">{{ feat.title }}</h3>
              <p class="text-[12.5px] text-text-muted leading-relaxed">{{ feat.desc }}</p>
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
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm" @click="showCatModal = false" />

        <div class="relative w-full max-w-3xl max-h-[80vh] bg-surface-sunken border border-border-default flex flex-col overflow-hidden shadow-2xl shadow-black/50">

          <div class="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
            <div>
              <p class="text-[9px] tracking-[0.28em] uppercase text-accent mb-1">Catálogo</p>
              <h2 class="font-display text-2xl font-light text-text-primary">Todas las categorías</h2>
            </div>
            <button
              @click="showCatModal = false"
              class="w-9 h-9 flex items-center justify-center border border-border-default text-text-muted hover:border-accent hover:text-accent transition-colors"
              aria-label="Cerrar"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>

          <div class="overflow-y-auto flex-1 p-6">
            <div v-if="loadingCategories" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <div v-for="i in 8" :key="i" class="skeleton h-20" />
            </div>

            <div v-else-if="!allCategories.length" class="flex items-center justify-center py-16">
              <p class="text-text-disabled text-sm">Sin categorías registradas</p>
            </div>

            <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <button
                v-for="cat in allCategories"
                :key="cat.id"
                @click="goToCategory(cat)"
                class="category-tile"
                style="min-height: 5.5rem; padding: 1rem 0.75rem;"
              >
                <svg class="category-icon" style="width:1.4rem;height:1.4rem;"><use :href="`#${categoryIcon(cat.name)}`" /></svg>
                <span class="category-name">{{ cat.name }}</span>
              </button>
            </div>
          </div>

          <div class="px-6 py-3 border-t border-border-subtle shrink-0 flex items-center justify-between">
            <span class="text-[10px] tracking-widest uppercase text-text-disabled">
              {{ allCategories.length }} categoría{{ allCategories.length !== 1 ? 's' : '' }}
            </span>
            <RouterLink
              to="/products"
              @click="showCatModal = false"
              class="see-all"
            >
              Ver todos los productos
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </RouterLink>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Quick View del producto -->
  <QuickViewModal
    :product="quickViewProduct"
    :image-base-url="PB"
    @close="closeQuickView"
  />

  <AppFooter />
</template>

<style scoped>
.home-shell {
  background: var(--surface-base);
  width: 100%;
  overflow-x: hidden;
}

/* ── Animación modal categorías ── */
.cat-modal-enter-active { transition: opacity 0.2s ease; }
.cat-modal-leave-active { transition: opacity 0.15s ease; }
.cat-modal-enter-from,
.cat-modal-leave-to     { opacity: 0; }

.cat-modal-enter-active .relative,
.cat-modal-leave-active .relative {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}
.cat-modal-enter-from .relative,
.cat-modal-leave-to   .relative { transform: translateY(16px) scale(0.97); opacity: 0; }
</style>
