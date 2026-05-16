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

function formatPrice(n) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(n || 0)
}

function goToProduct() {
  if (!props.product) return
  emit('close')
  router.push(`/products/${props.product.id}`)
}

function handleKey(e) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowRight' && images.value.length > 1) {
    activeImageIdx.value = (activeImageIdx.value + 1) % images.value.length
  }
  if (e.key === 'ArrowLeft' && images.value.length > 1) {
    activeImageIdx.value = (activeImageIdx.value - 1 + images.value.length) % images.value.length
  }
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

          <!-- Media -->
          <div class="quick-view-media">
            <template v-for="(src, i) in images" :key="src">
              <img
                :src="src"
                :alt="product.name"
                :style="{ opacity: i === activeImageIdx ? 1 : 0 }"
                loading="lazy"
              />
            </template>
            <div v-if="!images.length" class="absolute inset-0 flex items-center justify-center">
              <svg class="w-12 h-12 text-text-disabled" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>

            <!-- Thumbs progress bar -->
            <div v-if="images.length > 1" class="quick-view-thumbs">
              <span
                v-for="(_, i) in images"
                :key="i"
                class="quick-view-thumb"
                :class="{ 'is-active': i === activeImageIdx }"
                @click="activeImageIdx = i"
              />
            </div>
          </div>

          <!-- Content -->
          <div class="quick-view-content">
            <div>
              <p v-if="categoryName" class="text-[10px] tracking-[0.28em] uppercase text-accent mb-2">{{ categoryName }}</p>
              <h2 class="font-display text-3xl md:text-4xl font-light leading-tight text-text-primary">
                {{ product.name }}
              </h2>
              <p v-if="storeName" class="text-[11px] tracking-[0.2em] uppercase text-text-muted mt-3">
                Tienda · {{ storeName }}
              </p>
            </div>

            <div class="border-t border-border-subtle pt-4">
              <p class="text-[10px] tracking-[0.22em] uppercase text-text-disabled mb-1">Precio</p>
              <p class="font-display text-3xl font-medium text-accent tabular-nums">
                {{ formatPrice(product.price) }}
              </p>
            </div>

            <p v-if="product.description" class="text-sm text-text-muted leading-relaxed line-clamp-4">
              {{ product.description }}
            </p>

            <div class="flex flex-wrap gap-3 mt-2">
              <button class="btn-gold flex-1 min-w-[10rem]" @click="goToProduct">
                Ver detalles
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/>
                </svg>
              </button>
              <button class="btn-outline flex-1 min-w-[10rem]" @click="emit('close')">
                Cerrar
              </button>
            </div>

            <!-- Meta info -->
            <div class="mt-2 pt-4 border-t border-border-subtle grid grid-cols-2 gap-3">
              <div>
                <p class="text-[9px] tracking-[0.22em] uppercase text-text-disabled mb-1">Stock</p>
                <p class="text-sm text-text-primary tabular-nums">{{ product.stock ?? '—' }}</p>
              </div>
              <div>
                <p class="text-[9px] tracking-[0.22em] uppercase text-text-disabled mb-1">Imágenes</p>
                <p class="text-sm text-text-primary tabular-nums">{{ images.length || 0 }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
