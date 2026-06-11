<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useCompareStore } from '@/composables/useCompareStore'
import { useCartStore } from '@/composables/useCartStore'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

const { compareItems, removeFromCompare, clearCompare } = useCompareStore()
const { addToCart } = useCartStore()

// ── Estado ────────────────────────────────────────────────────────────────────
const products = ref([])   // productos completos (frescos) + _avgRating + _reviewCount
const loading  = ref(false)
const cartFeedback = ref({}) // { [productId]: 'added' | 'error' }

// ── Carga de datos frescos ────────────────────────────────────────────────────
async function fetchOne(id) {
  const [prodRes, revRes] = await Promise.all([
    fetch(`${API}/products/${id}`),
    fetch(`${API}/reviews/product/${id}?page=1&perPage=1`).catch(() => null),
  ])

  if (prodRes.status === 404) {
    // El producto ya no existe — sacarlo del comparador
    removeFromCompare(id)
    return null
  }
  if (!prodRes.ok) throw new Error(`Error ${prodRes.status}`)

  const product = await prodRes.json()
  let avgRating = null
  let reviewCount = 0
  if (revRes?.ok) {
    const data = await revRes.json().catch(() => null)
    if (data) {
      avgRating   = data.avgRating ?? null
      reviewCount = Number(data.total || 0)
    }
  }
  return { ...product, _avgRating: avgRating, _reviewCount: reviewCount }
}

async function loadProducts() {
  const ids = compareItems.value.map(p => p.id)
  if (!ids.length) { products.value = []; return }

  loading.value = true
  try {
    const results = await Promise.all(ids.map(id => fetchOne(id).catch(() => null)))
    products.value = results.filter(Boolean)
  } finally {
    loading.value = false
  }
}

onMounted(loadProducts)

// Si quitan un producto desde la propia tabla, sincronizar sin refetch
watch(compareItems, (items) => {
  const ids = new Set(items.map(p => p.id))
  products.value = products.value.filter(p => ids.has(p.id))
}, { deep: true })

// ── Helpers de presentación ───────────────────────────────────────────────────
function imgUrl(product) {
  const imgs = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])
  if (!imgs[0]) return ''
  return `${PB}/api/files/products/${product.id}/${imgs[0]}?thumb=600x600`
}

function pricing(product) {
  const base = Number(product.price || 0)
  const pct  = Number(product.discount_percent || 0)
  const amt  = Number(product.discount_amount  || 0)
  let final  = base
  let label  = ''
  if (pct > 0)      { final = base * (1 - pct / 100); label = `-${pct}%` }
  else if (amt > 0) { final = Math.max(0, base - amt); label = `-$${amt.toLocaleString('es-CL')}` }
  return { base, final: Math.round(final * 100) / 100, hasDiscount: final < base, label }
}

const lowestPrice = computed(() => {
  if (products.value.length < 2) return null
  return Math.min(...products.value.map(p => pricing(p).final))
})

function isLowest(product) {
  return lowestPrice.value !== null && pricing(product).final === lowestPrice.value
}

const conditionMap = { new: 'Nuevo', used: 'Usado', refurbished: 'Reacondicionado' }

function starsArray(rating) {
  const r     = Math.round(Number(rating || 0) * 2) / 2
  const full  = Math.floor(r)
  const half  = r % 1 !== 0
  const empty = 5 - full - (half ? 1 : 0)
  return { full, half, empty }
}

// ── Carrito ───────────────────────────────────────────────────────────────────
async function handleAddToCart(product) {
  const ok = await addToCart(product, 1)
  cartFeedback.value = { ...cartFeedback.value, [product.id]: ok ? 'added' : 'error' }
  setTimeout(() => {
    const { [product.id]: _, ...rest } = cartFeedback.value
    cartFeedback.value = rest
  }, 2200)
}
</script>

<template>
  <AppNavbar />

  <main class="text-text-primary min-h-[70vh]">
    <!-- ══ HERO ══════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden border-b border-border-subtle">
      <div class="absolute inset-0 pointer-events-none" style="background:radial-gradient(ellipse at 70% 0%, var(--accent-soft) 0%, transparent 55%);opacity:0.6;" />
      <div class="relative max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-14 md:py-20">
        <div class="flex flex-wrap items-end justify-between gap-6">
          <div class="max-w-2xl">
            <p class="section-label mb-5">Comparador</p>
            <h1 class="font-display font-light leading-[0.95]" style="font-size:clamp(2.4rem,5vw,4rem);">
              Compara <span class="italic text-accent" style="font-weight:400;">productos</span>
            </h1>
          </div>
          <button
            v-if="products.length"
            type="button"
            class="text-text-muted hover:text-accent transition-colors text-[10px] tracking-[0.14em] uppercase"
            @click="clearCompare"
          >
            Limpiar comparador
          </button>
        </div>
      </div>
    </section>

    <section class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10 md:py-14">
      <!-- Loading -->
      <div v-if="loading" class="py-24 flex justify-center">
        <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>

      <!-- Estado vacío -->
      <div v-else-if="products.length < 2" class="py-24 text-center">
        <p class="font-display text-2xl text-text-primary mb-3">
          {{ products.length === 0 ? 'No hay productos para comparar' : 'Necesitas al menos 2 productos' }}
        </p>
        <p class="text-text-muted text-sm mb-8 max-w-md mx-auto">
          Añade productos al comparador desde el catálogo usando el botón de comparar en cada tarjeta.
        </p>
        <RouterLink to="/products" class="btn-outline"><span>Ir al catálogo</span></RouterLink>
      </div>

      <!-- Tabla comparativa -->
      <div v-else class="compare-table-wrap">
        <table class="compare-table">
          <tbody>
            <!-- Imagen + nombre -->
            <tr>
              <th class="compare-label" />
              <td v-for="p in products" :key="p.id" class="compare-cell align-top">
                <div class="relative">
                  <button
                    type="button"
                    class="absolute -top-1 -right-1 z-10 w-7 h-7 flex items-center justify-center bg-surface-base border border-border-subtle text-text-muted hover:bg-accent hover:text-accent-on hover:border-accent transition-all text-xs"
                    :aria-label="`Quitar ${p.name} del comparador`"
                    @click="removeFromCompare(p.id)"
                  >✕</button>
                  <RouterLink :to="`/products/${p.id}`" class="block group">
                    <div class="aspect-square mb-4 overflow-hidden border border-border-subtle bg-surface-raised">
                      <img
                        v-if="imgUrl(p)"
                        :src="imgUrl(p)"
                        :alt="p.name"
                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div v-else class="w-full h-full flex items-center justify-center text-text-disabled">
                        <svg class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </div>
                    </div>
                    <h3 class="text-sm leading-snug line-clamp-2 group-hover:text-accent transition-colors">{{ p.name }}</h3>
                  </RouterLink>
                </div>
              </td>
            </tr>

            <!-- Tienda -->
            <tr>
              <th class="compare-label">Tienda</th>
              <td v-for="p in products" :key="p.id" class="compare-cell text-text-muted text-xs uppercase tracking-[0.12em]">
                {{ p.expand?.store?.name || '—' }}
              </td>
            </tr>

            <!-- Categoría -->
            <tr>
              <th class="compare-label">Categoría</th>
              <td v-for="p in products" :key="p.id" class="compare-cell text-sm">
                {{ p.expand?.category?.name || '—' }}
              </td>
            </tr>

            <!-- Precio -->
            <tr>
              <th class="compare-label">Precio</th>
              <td v-for="p in products" :key="p.id" class="compare-cell">
                <div v-if="pricing(p).hasDiscount" class="flex items-center gap-1.5 mb-1">
                  <span class="text-[9px] tracking-widest uppercase font-bold text-red-400 bg-red-900/20 border border-red-900/40 px-1.5 py-0.5">
                    {{ pricing(p).label }}
                  </span>
                  <span class="text-text-disabled text-[11px] line-through tabular-nums">
                    ${{ pricing(p).base.toLocaleString('es-CL') }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-display text-2xl font-medium tabular-nums" :class="isLowest(p) ? 'text-accent' : 'text-text-primary'">
                    ${{ pricing(p).final.toLocaleString('es-CL') }}
                  </span>
                  <span v-if="isLowest(p)" class="badge-gold text-[9px]">Mejor precio</span>
                </div>
              </td>
            </tr>

            <!-- Condición -->
            <tr>
              <th class="compare-label">Condición</th>
              <td v-for="p in products" :key="p.id" class="compare-cell text-sm">
                {{ conditionMap[p.condition] || p.condition || '—' }}
              </td>
            </tr>

            <!-- Stock -->
            <tr>
              <th class="compare-label">Stock</th>
              <td v-for="p in products" :key="p.id" class="compare-cell text-sm">
                <span v-if="Number(p.stock) > 0">{{ p.stock }} disponibles</span>
                <span v-else class="text-red-400">Sin stock</span>
              </td>
            </tr>

            <!-- Valoración -->
            <tr>
              <th class="compare-label">Valoración</th>
              <td v-for="p in products" :key="p.id" class="compare-cell">
                <div v-if="p._avgRating" class="flex items-center gap-2">
                  <div class="flex items-center gap-0.5 text-accent">
                    <svg v-for="n in starsArray(p._avgRating).full" :key="`f${n}`" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.077 10.1c-.783-.57-.38-1.81.588-1.81h4.915a1 1 0 00.95-.69l1.519-4.674z"/>
                    </svg>
                    <svg v-for="n in starsArray(p._avgRating).empty + (starsArray(p._avgRating).half ? 1 : 0)" :key="`e${n}`" class="w-3.5 h-3.5 text-text-disabled" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.077 10.1c-.783-.57-.38-1.81.588-1.81h4.915a1 1 0 00.95-.69l1.519-4.674z"/>
                    </svg>
                  </div>
                  <span class="text-xs text-text-muted tabular-nums">{{ Number(p._avgRating).toFixed(1) }} ({{ p._reviewCount }})</span>
                </div>
                <span v-else class="text-text-disabled text-sm">Sin reseñas</span>
              </td>
            </tr>

            <!-- Descripción -->
            <tr>
              <th class="compare-label">Descripción</th>
              <td v-for="p in products" :key="p.id" class="compare-cell text-sm text-text-muted leading-relaxed align-top">
                <p class="line-clamp-5">{{ p.description || '—' }}</p>
              </td>
            </tr>

            <!-- Acciones -->
            <tr>
              <th class="compare-label" />
              <td v-for="p in products" :key="p.id" class="compare-cell">
                <div class="flex flex-col gap-2">
                  <button
                    type="button"
                    class="btn-gold w-full disabled:opacity-40 disabled:cursor-not-allowed"
                    style="padding: 0.65rem 1rem;"
                    :disabled="Number(p.stock) <= 0 || cartFeedback[p.id] === 'added'"
                    @click="handleAddToCart(p)"
                  >
                    {{ cartFeedback[p.id] === 'added' ? 'Añadido ✓' : cartFeedback[p.id] === 'error' ? 'Error' : 'Añadir al carrito' }}
                  </button>
                  <RouterLink :to="`/products/${p.id}`" class="btn-outline w-full" style="padding: 0.65rem 1rem;">
                    <span>Ver producto</span>
                  </RouterLink>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>

  <AppFooter />
</template>

<style scoped>
.compare-table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 640px;
}

.compare-table tr {
  border-bottom: 1px solid var(--border-subtle);
}

.compare-table tr:first-child,
.compare-table tr:last-child {
  border-bottom: none;
}

.compare-label {
  position: sticky;
  left: 0;
  z-index: 5;
  background: var(--surface-base);
  width: 110px;
  min-width: 110px;
  padding: 1rem 0.75rem 1rem 0;
  text-align: left;
  vertical-align: top;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--text-muted);
}

.compare-cell {
  padding: 1rem 0.85rem;
  min-width: 180px;
}

@media (min-width: 768px) {
  .compare-label { width: 140px; min-width: 140px; }
}
</style>
