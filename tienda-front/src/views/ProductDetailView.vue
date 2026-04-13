<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
import AppFooter from '@/components/AppFooter.vue'

const API    = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '/api').replace(/\/$/, '')
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
const activeImage  = ref(0)
const showReviews  = ref(false)

// ── Fetch producto ─────────────────────────────────────────────────────────────
async function fetchProduct() {
  loading.value = true
  error.value   = ''
  try {
    const res = await fetch(`${API}/products/${route.params.id}`)
    if (res.status === 404) { error.value = 'Producto no encontrado.'; return }
    if (!res.ok) throw new Error(`Error ${res.status}`)
    product.value = await res.json()
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

onMounted(fetchProduct)
</script>

<template>
  <AppNavbar />

  <main class="detail-shell text-[#f0ede8]">
    <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10">

      <!-- Volver + Breadcrumb -->
      <div class="flex items-center justify-between gap-4 mb-8">
        <nav class="flex items-center gap-2 text-[10px] tracking-[0.15em] uppercase text-[#3a3835]">
          <RouterLink to="/stores" class="hover:text-[#c9a96e] transition-colors">Directorio</RouterLink>
          <span>/</span>
          <RouterLink
            v-if="store"
            :to="`/stores/${store.slug || store.id}`"
            class="hover:text-[#c9a96e] transition-colors"
          >{{ store.name }}</RouterLink>
          <span v-if="store">/</span>
          <span class="text-[#555550]">Producto</span>
        </nav>

        <button
          @click="goBack"
          class="flex items-center gap-1.5 text-[10px] tracking-[0.15em] uppercase text-[#555550] border border-[#1e1e1e] px-3 h-8 hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors shrink-0"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Volver
        </button>
      </div>

      <!-- ══ ERROR ══════════════════════════════════════════════════ -->
      <div v-if="error" class="flex flex-col items-center py-24 gap-4">
        <p class="text-[#555550] text-sm">{{ error }}</p>
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
      <div v-else-if="product" class="grid grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-16">

        <!-- ── GALERÍA DE IMÁGENES ─────────────────────────────────── -->
        <div class="space-y-3">
          <!-- Imagen principal -->
          <div class="relative aspect-square bg-[#0f0f0f] border border-[#1a1a1a] overflow-hidden">
            <img
              v-if="images.length"
              :src="imgUrl(images[activeImage], '800x800')"
              :alt="product.name"
              class="w-full h-full object-contain"
            />
            <div
              v-else
              class="w-full h-full flex flex-col items-center justify-center gap-3"
              style="background:linear-gradient(135deg,#111111 0%,#14110d 100%);"
            >
              <svg class="w-16 h-16 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="text-[10px] tracking-widest uppercase text-[#2a2520]">Sin imagen</span>
            </div>

            <!-- Badge destacado -->
            <div v-if="product.featured" class="absolute top-3 left-3">
              <span class="badge-gold">Destacado</span>
            </div>

            <!-- Badge descuento -->
            <div v-if="pricing.hasDiscount" class="absolute top-3 right-3">
              <span class="inline-flex items-center px-2 py-1 text-[10px] tracking-widest uppercase bg-red-900/70 text-red-300 border border-red-800/40 font-medium">
                {{ pricing.discountLabel }}
              </span>
            </div>

            <!-- Flechas navegación (si hay más de 1 imagen) -->
            <template v-if="images.length > 1">
              <button
                @click="activeImage = (activeImage - 1 + images.length) % images.length"
                class="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/60 border border-[#2a2a2a] hover:border-[#c9a96e44] transition-colors"
                aria-label="Imagen anterior"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button
                @click="activeImage = (activeImage + 1) % images.length"
                class="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/60 border border-[#2a2a2a] hover:border-[#c9a96e44] transition-colors"
                aria-label="Imagen siguiente"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </template>
          </div>

          <!-- Thumbnails -->
          <div v-if="images.length > 1" class="grid grid-cols-5 gap-2">
            <button
              v-for="(img, idx) in images"
              :key="img"
              @click="activeImage = idx"
              :class="[
                'aspect-square border overflow-hidden transition-colors',
                idx === activeImage
                  ? 'border-[#c9a96e]'
                  : 'border-[#1e1e1e] hover:border-[#333330]',
              ]"
            >
              <img
                :src="imgUrl(img, '400x400')"
                :alt="`Imagen ${idx + 1}`"
                class="w-full h-full object-cover"
              />
            </button>
          </div>
        </div>

        <!-- ── DETALLES ─────────────────────────────────────────────── -->
        <div class="flex flex-col gap-5">

          <!-- Categoría + condición -->
          <div class="flex items-center gap-2 flex-wrap">
            <span v-if="category" class="section-label">{{ category.name }}</span>
            <span
              v-if="product.condition"
              class="inline-flex items-center px-2 py-0.5 text-[10px] tracking-widest uppercase border border-[#222] text-[#6f6a61]"
            >
              {{ conditionMap[product.condition] || product.condition }}
            </span>
          </div>

          <!-- Nombre -->
          <h1 class="font-display text-3xl md:text-4xl font-light leading-tight">
            {{ product.name }}
          </h1>

          <!-- Precio -->
          <div class="flex items-baseline gap-3">
            <span class="text-2xl font-semibold text-[#c9a96e] tabular-nums">
              ${{ pricing.final.toLocaleString('es-CL') }}
            </span>
            <span v-if="pricing.hasDiscount" class="text-base text-[#3a3835] line-through tabular-nums">
              ${{ pricing.base.toLocaleString('es-CL') }}
            </span>
          </div>

          <!-- Stock -->
          <p class="text-xs" :class="stockStatus.cls">
            {{ stockStatus.label }}
          </p>

          <div class="border-t border-[#141414]" />

          <!-- Descripción -->
          <div
            v-if="product.description"
            class="prose-dark text-[13px] text-[#7a7570] leading-relaxed"
            v-html="product.description"
          />

          <div class="border-t border-[#141414]" />

          <!-- Tienda vendedora -->
          <RouterLink
            v-if="store"
            :to="`/stores/${store.slug || store.id}`"
            class="flex items-center gap-3 p-3 border border-[#1a1a1a] hover:border-[#c9a96e44] transition-colors group"
          >
            <div class="w-10 h-10 shrink-0 border border-[#222] bg-[#0f0f0f] overflow-hidden">
              <img
                v-if="logoUrl(store)"
                :src="logoUrl(store)"
                :alt="store.name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <span class="font-display text-sm font-light text-[#2a2520]">
                  {{ storeInitials(store.name).charAt(0) }}
                </span>
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[10px] tracking-[0.15em] uppercase text-[#444440] mb-0.5">Vendido por</p>
              <p class="text-sm text-[#d8d4ce] group-hover:text-[#c9a96e] transition-colors truncate">
                {{ store.name }}
              </p>
            </div>
            <svg class="w-3.5 h-3.5 text-[#333330] group-hover:text-[#c9a96e] transition-colors shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </RouterLink>

          <!-- Acciones -->
          <div class="flex flex-col sm:flex-row gap-3 mt-1">
            <!-- WhatsApp -->
            <a
              v-if="whatsappUrl"
              :href="whatsappUrl"
              target="_blank"
              rel="noopener"
              class="flex-1 flex items-center justify-center gap-2 h-11 px-5 bg-[#25d366]/10 border border-[#25d366]/30 text-[#25d366] text-xs tracking-[0.12em] uppercase hover:bg-[#25d366]/20 transition-colors"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Consultar por WhatsApp
            </a>

            <!-- Ver reseñas -->
            <button
              @click="showReviews = !showReviews"
              class="flex-1 flex items-center justify-center gap-2 h-11 px-5 border border-[#2a2a2a] text-[#666259] text-xs tracking-[0.12em] uppercase hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Ver reseñas
            </button>
          </div>

          <!-- Panel de reseñas (solo front) -->
          <div v-if="showReviews" class="border border-[#1a1a1a] bg-[#0c0c0c] p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-medium text-[#d8d4ce] tracking-wide">Reseñas del producto</h2>
              <button @click="showReviews = false" class="text-[#333330] hover:text-[#c9a96e] transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>

            <!-- Estado vacío decorativo -->
            <div class="flex flex-col items-center py-8 gap-3">
              <svg class="w-10 h-10 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <p class="font-display text-lg font-light text-[#333330]">Sin reseñas aún</p>
              <p class="text-[10px] tracking-widest uppercase text-[#252520]">Sé el primero en reseñar este producto</p>
              <button class="mt-2 h-8 px-4 text-[10px] tracking-[0.15em] uppercase border border-[#1e1e1e] text-[#3a3835] cursor-not-allowed opacity-50">
                Escribir reseña
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
.detail-shell {
  background: linear-gradient(180deg, #090909 0%, #0a0a0a 100%);
  flex: 1;
  width: 100%;
  overflow-x: hidden;
}

/* Prose oscuro para la descripción HTML */
.prose-dark :deep(p)      { margin-bottom: 0.75rem; }
.prose-dark :deep(strong) { color: #c9a96e; font-weight: 500; }
.prose-dark :deep(em)     { color: #9a9590; }
.prose-dark :deep(ul)     { list-style: disc; padding-left: 1.25rem; }
.prose-dark :deep(ol)     { list-style: decimal; padding-left: 1.25rem; }
.prose-dark :deep(li)     { margin-bottom: 0.25rem; }
.prose-dark :deep(a)      { color: #c9a96e; text-decoration: underline; }
</style>
