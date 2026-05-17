<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  product: { type: Object, default: null },
  imageBaseUrl: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const router = useRouter()

const activeImageIdx = ref(0)

const images = computed(() => {
  if (!props.product) return []
  const imgs = Array.isArray(props.product.images)
    ? props.product.images
    : (props.product.images ? [props.product.images] : [])
  return imgs.map(name =>
    `${props.imageBaseUrl}/api/files/products/${props.product.id}/${name}?thumb=900x1200`
  )
})

const storeName    = computed(() => props.product?.expand?.store?.name || '')
const categoryName = computed(() => props.product?.expand?.category?.name || '')

const stockStatus = computed(() => {
  const s = props.product?.stock
  if (s === undefined || s === null) return null
  if (s <= 0)  return { label: 'Agotado',              color: 'danger',  pct: 0 }
  if (s <= 5)  return { label: `Solo ${s} disponibles`, color: 'warning', pct: Math.min(100, s * 10) }
  if (s <= 20) return { label: `${s} en stock`,         color: 'normal',  pct: Math.min(100, s * 5) }
  return         { label: 'En stock',                   color: 'good',    pct: 100 }
})

function formatPrice(n) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(n || 0)
}

function goToProduct() {
  if (!props.product) return
  emit('close')
  router.push(`/products/${props.product.id}`)
}

function prevImage() {
  if (images.value.length < 2) return
  activeImageIdx.value = (activeImageIdx.value - 1 + images.value.length) % images.value.length
}
function nextImage() {
  if (images.value.length < 2) return
  activeImageIdx.value = (activeImageIdx.value + 1) % images.value.length
}

function handleKey(e) {
  if (e.key === 'Escape')     emit('close')
  if (e.key === 'ArrowRight') nextImage()
  if (e.key === 'ArrowLeft')  prevImage()
}

watch(() => props.product, (val) => {
  activeImageIdx.value = 0
  if (val) {
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
  } else {
    document.body.style.overflow = ''
    document.removeEventListener('keydown', handleKey)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="qv">
      <div
        v-if="product"
        class="quick-view-backdrop"
        @click.self="emit('close')"
      >
        <div class="quick-view-panel">

          <!-- Gold top accent hairline -->
          <div class="quick-view-accent-line" />

          <!-- Close button (top-right of whole panel) -->
          <button
            type="button"
            class="quick-view-close"
            aria-label="Cerrar"
            @click="emit('close')"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>

          <!-- ── Media panel ── -->
          <div class="quick-view-media">
            <!-- Images (crossfade) -->
            <template v-for="(src, i) in images" :key="src">
              <img
                :src="src"
                :alt="product.name"
                :style="{ opacity: i === activeImageIdx ? 1 : 0 }"
                loading="lazy"
              />
            </template>

            <!-- Placeholder when no images -->
            <div v-if="!images.length" class="absolute inset-0 flex items-center justify-center">
              <svg class="w-14 h-14 text-text-disabled" fill="none" stroke="currentColor" stroke-width="0.8" viewBox="0 0 24 24">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>

            <!-- Arrow navigation (only with multiple images) -->
            <template v-if="images.length > 1">
              <button class="quick-view-nav quick-view-nav-prev" aria-label="Imagen anterior" @click.stop="prevImage">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <button class="quick-view-nav quick-view-nav-next" aria-label="Siguiente imagen" @click.stop="nextImage">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </template>

            <!-- Dot indicators -->
            <div v-if="images.length > 1" class="quick-view-dots">
              <button
                v-for="(_, i) in images"
                :key="i"
                class="quick-view-dot"
                :class="{ 'is-active': i === activeImageIdx }"
                @click="activeImageIdx = i"
              />
            </div>

            <!-- Bottom vignette -->
            <div class="quick-view-media-vignette" />
          </div>

          <!-- ── Content panel ── -->
          <div class="quick-view-content">

            <!-- Category + store header -->
            <div class="quick-view-header">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span v-if="categoryName" class="quick-view-category-tag">{{ categoryName }}</span>
                <span v-if="storeName" class="quick-view-store-tag">{{ storeName }}</span>
              </div>
              <h2 class="quick-view-title">{{ product.name }}</h2>
            </div>

            <!-- Price -->
            <div class="quick-view-price-block">
              <span class="quick-view-label">Precio</span>
              <p class="quick-view-price">{{ formatPrice(product.price) }}</p>
            </div>

            <!-- Description -->
            <p v-if="product.description" class="quick-view-description">
              {{ product.description }}
            </p>

            <!-- Stock indicator -->
            <div v-if="stockStatus" class="quick-view-stock">
              <div class="flex items-center justify-between mb-2">
                <span class="quick-view-label" style="margin-bottom:0">Disponibilidad</span>
                <span
                  class="text-[11px] font-semibold tracking-wide"
                  :class="{
                    'text-emerald-500': stockStatus.color === 'good' || stockStatus.color === 'normal',
                    'text-amber-500':   stockStatus.color === 'warning',
                    'text-red-400':     stockStatus.color === 'danger',
                  }"
                >{{ stockStatus.label }}</span>
              </div>
              <div class="quick-view-stock-bar">
                <div class="quick-view-stock-fill" :style="{ width: `${stockStatus.pct}%` }" />
              </div>
            </div>

            <!-- Primary action -->
            <div class="quick-view-actions">
              <button class="btn-gold w-full" @click="goToProduct">
                Ver detalles completos
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/>
                </svg>
              </button>
            </div>

            <!-- Decorative footer -->
            <div class="quick-view-footer">
              <div class="quick-view-footer-line" />
              <span class="quick-view-footer-brand">TuVentaConfiada</span>
              <div class="quick-view-footer-line" style="background: linear-gradient(90deg, transparent, var(--border-subtle))" />
            </div>

          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
