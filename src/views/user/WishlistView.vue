<script setup>
import { onMounted, computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useWishlistStore } from '@/composables/useWishlistStore'
import { useCartStore } from '@/composables/useCartStore'
import { useAuthSession } from '@/composables/useAuthSession'

const router = useRouter()
const { session, isAuthenticated } = useAuthSession()
const { wishlistItems, loading, initialized, loadWishlist, removeFromWishlist, totalWishlistCount } = useWishlistStore()
const { addToCart } = useCartStore()

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

// ── Helpers ───────────────────────────────────────────────────────────────────
function productImageUrl(item) {
  const product = item.expand?.product
  if (!product) return null
  const imgs = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])
  if (!imgs.length) return null
  return `${PB}/api/files/products/${product.id}/${imgs[0]}?thumb=400x400`
}

function storeLogoUrl(item) {
  const store = item.expand?.product?.expand?.store
  if (!store?.logo) return null
  return `${API}/stores/files/stores/${store.id}/${store.logo}`
}

function fmt(n) {
  return Number(n || 0).toLocaleString('es-CL')
}

function calcPrice(product) {
  if (!product) return { base: 0, final: 0, hasDiscount: false, label: '' }
  const base  = Number(product.price || 0)
  const pct   = Number(product.discount_percent || 0)
  const amt   = Number(product.discount_amount  || 0)
  let   final = base
  let   label = ''
  if (pct > 0)      { final = base * (1 - pct / 100); label = `-${pct}%` }
  else if (amt > 0) { final = Math.max(0, base - amt); label = `-$${fmt(amt)}` }
  return { base, final: Math.round(final * 100) / 100, hasDiscount: final < base, label }
}

const conditionMap = { new: 'Nuevo', used: 'Usado', refurbished: 'Reacondicionado' }

// ── Acciones ──────────────────────────────────────────────────────────────────
async function handleRemove(item) {
  const productId = item.product
  await removeFromWishlist(item.id, productId)
}

async function handleMoveToCart(item) {
  const product = item.expand?.product
  if (!product) return

  const store = product.expand?.store
  if (!store?.id) return

  const enriched = {
    ...product,
    store:  store.id,
    expand: { ...product.expand, store },
  }

  const success = await addToCart(enriched, 1)
  if (success) {
    handleRemove(item)
  }
}

// ── Cargar al montar ──────────────────────────────────────────────────────────
onMounted(async () => {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  if (!initialized.value) {
    await loadWishlist()
  }
})
</script>

<template>
  <AppNavbar />

  <main class="wishlist-shell text-text-primary">
    <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10">

      <!-- ══ ENCABEZADO ════════════════════════════════════════════ -->
      <div class="flex items-end justify-between gap-4 mb-10">
        <div>
          <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-2">Mi cuenta</p>
          <h1 class="font-display text-3xl md:text-4xl font-light leading-tight">
            Wishlist
            <span v-if="totalWishlistCount > 0" class="text-accent text-2xl font-light ml-2">
              ({{ totalWishlistCount }})
            </span>
          </h1>
        </div>
        <RouterLink
          to="/products"
          class="flex items-center gap-1.5 text-[10px] tracking-[0.15em] uppercase text-text-muted border border-border-subtle px-3 h-8 hover:border-[var(--accent)44] hover:text-accent transition-colors shrink-0"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Seguir comprando
        </RouterLink>
      </div>

      <!-- ══ ESTADO DE CARGA ═══════════════════════════════════════ -->
      <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        <div v-for="i in 8" :key="i" class="card-dark overflow-hidden">
          <div class="skeleton aspect-square w-full" />
          <div class="p-4 space-y-2">
            <div class="skeleton h-3 w-3/4" />
            <div class="skeleton h-3 w-1/2" />
            <div class="skeleton h-4 w-1/3 mt-1" />
            <div class="skeleton h-7 w-full mt-2" />
          </div>
        </div>
      </div>

      <!-- ══ VACÍO ═════════════════════════════════════════════════ -->
      <div
        v-else-if="!loading && wishlistItems.length === 0"
        class="flex flex-col items-center py-28 border border-[var(--surface-overlay)]"
      >
        <div class="relative mb-6">
          <svg class="w-16 h-16 text-text-disabled" fill="none" stroke="currentColor" stroke-width="0.8" viewBox="0 0 24 24">
            <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <svg class="w-6 h-6 text-text-disabled" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
        <p class="font-display text-2xl font-light text-text-disabled mb-2">Tu wishlist está vacía</p>
        <p class="text-[10px] tracking-[0.18em] uppercase text-text-disabled mb-8">
          Guarda los productos que te interesan
        </p>
        <RouterLink
          to="/products"
          class="h-10 px-6 flex items-center gap-2 text-xs tracking-[0.12em] uppercase bg-[var(--accent)15] border border-[var(--accent)44] text-accent hover:bg-[var(--accent)25] hover:border-[var(--accent)66] transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Ver productos
        </RouterLink>
      </div>

      <!-- ══ GRID DE ITEMS ══════════════════════════════════════════ -->
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        <div
          v-for="item in wishlistItems"
          :key="item.id"
          class="card-dark group flex flex-col overflow-hidden"
        >
          <!-- Imagen -->
          <RouterLink
            :to="item.expand?.product ? `/products/${item.expand.product.id}` : '#'"
            class="relative aspect-square bg-surface-raised overflow-hidden block"
          >
            <img
              v-if="productImageUrl(item)"
              :src="productImageUrl(item)"
              :alt="item.expand?.product?.name"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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

            <!-- Badge descuento -->
            <div v-if="item.expand?.product && calcPrice(item.expand.product).hasDiscount" class="absolute top-2 left-2">
              <span class="inline-flex items-center px-1.5 py-0.5 text-[9px] tracking-widest uppercase bg-red-900/60 text-red-300 border border-red-800/40">
                {{ calcPrice(item.expand.product).label }}
              </span>
            </div>

            <!-- Condición -->
            <div v-if="item.expand?.product?.condition" class="absolute bottom-2 right-2">
              <span
                class="inline-flex items-center px-2 py-0.5 text-[9px] tracking-widest uppercase font-semibold border"
                :class="{
                  'bg-emerald-950/80 text-emerald-400 border-emerald-700/60': item.expand.product.condition === 'new',
                  'bg-amber-950/80 text-amber-400 border-amber-700/60':      item.expand.product.condition === 'used',
                  'bg-purple-950/80 text-purple-400 border-purple-700/60':   item.expand.product.condition === 'refurbished',
                }"
              >
                {{ conditionMap[item.expand.product.condition] || item.expand.product.condition }}
              </span>
            </div>

            <!-- Botón eliminar de wishlist (top-right) -->
            <button
              @click.prevent="handleRemove(item)"
              class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-black/70 border border-red-800/40 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-900/40 hover:border-red-600/60"
              aria-label="Quitar de wishlist"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </RouterLink>

          <!-- Cuerpo -->
          <div class="p-3 flex flex-col gap-1.5 flex-1">

            <!-- Categoría -->
            <p v-if="item.expand?.product?.expand?.category?.name" class="text-[10px] tracking-[0.12em] uppercase text-accent/60">
              {{ item.expand.product.expand.category.name }}
            </p>

            <!-- Nombre -->
            <RouterLink
              :to="item.expand?.product ? `/products/${item.expand.product.id}` : '#'"
              class="text-[12px] font-medium text-text-secondary leading-snug line-clamp-2 hover:text-accent transition-colors duration-200"
            >
              {{ item.expand?.product?.name || 'Producto eliminado' }}
            </RouterLink>

            <!-- Tienda -->
            <RouterLink
              v-if="item.expand?.product?.expand?.store"
              :to="`/stores/${item.expand.product.expand.store.slug || item.expand.product.expand.store.id}`"
              class="flex items-center gap-1.5 mt-0.5"
            >
              <div class="w-4 h-4 rounded-sm overflow-hidden border border-border-default bg-surface-raised shrink-0">
                <img
                  v-if="storeLogoUrl(item)"
                  :src="storeLogoUrl(item)"
                  :alt="item.expand.product.expand.store.name"
                  class="w-full h-full object-cover"
                />
                <span v-else class="w-full h-full flex items-center justify-center text-[6px] text-text-disabled">
                  {{ (item.expand.product.expand.store.name || 'T').charAt(0).toUpperCase() }}
                </span>
              </div>
              <span class="text-[10px] text-text-disabled hover:text-accent transition-colors truncate">
                {{ item.expand.product.expand.store.name }}
              </span>
            </RouterLink>

            <!-- Precio -->
            <div class="mt-auto pt-2 flex items-baseline gap-2">
              <template v-if="item.expand?.product">
                <span class="text-sm font-semibold text-accent tabular-nums">
                  ${{ fmt(calcPrice(item.expand.product).final) }}
                </span>
                <span
                  v-if="calcPrice(item.expand.product).hasDiscount"
                  class="text-[10px] text-text-disabled line-through tabular-nums"
                >
                  ${{ fmt(item.expand.product.price) }}
                </span>
              </template>
            </div>

            <!-- Stock bajo -->
            <p
              v-if="item.expand?.product?.stock > 0 && item.expand.product.stock <= 5"
              class="text-[10px] text-amber-600/70"
            >
              Solo {{ item.expand.product.stock }} disponible{{ item.expand.product.stock !== 1 ? 's' : '' }}
            </p>
            <p
              v-else-if="item.expand?.product?.stock === 0"
              class="text-[10px] text-red-500/70"
            >
              Sin stock
            </p>

            <!-- Botones de acción -->
            <div class="flex gap-1.5 mt-1">
              <!-- Mover al carrito -->
              <button
                v-if="item.expand?.product?.stock > 0 && item.expand?.product?.expand?.store"
                @click="handleMoveToCart(item)"
                class="flex-1 h-7 text-[9px] tracking-[0.12em] uppercase flex items-center justify-center gap-1 border border-border-subtle text-text-muted hover:border-[var(--accent)44] hover:text-accent hover:bg-[var(--accent)08] transition-all duration-200"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                Al carrito
              </button>

              <!-- Quitar de wishlist -->
              <button
                @click="handleRemove(item)"
                class="w-7 h-7 flex items-center justify-center border border-border-subtle text-text-disabled hover:border-red-800/40 hover:text-red-400 hover:bg-red-900/10 transition-all duration-200 shrink-0"
                aria-label="Quitar de wishlist"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>

          </div>
        </div>
      </div>

    </div>
  </main>

  <AppFooter />
</template>

<style scoped>
.wishlist-shell {
  background: linear-gradient(180deg, var(--surface-base) 0%, var(--surface-base) 100%);
  flex: 1;
  width: 100%;
  overflow-x: hidden;
  min-height: 100vh;
}
</style>
