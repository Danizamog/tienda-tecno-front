<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  images: { type: Array, default: () => [] },        // URLs de tamaño completo
  thumbs: { type: Array, default: () => null },      // URLs de thumbnails (opcional)
  alt:    { type: String, default: '' },
  aspect: { type: String, default: 'square' },       // 'square' | '4/3' | '16/9'
  autoIntervalMs: { type: Number, default: 4500 },   // 0 desactiva auto-rotación
  thumbSize: { type: String, default: 'square' },    // tamaño de thumbnails
})

const aspectClass = computed(() => ({
  'square': 'aspect-square',
  '4/3':    'aspect-[4/3]',
  '16/9':   'aspect-video',
}[props.aspect] || 'aspect-square'))

const activeIndex   = ref(0)
const isHovered     = ref(false)
const lightboxOpen  = ref(false)

// ── Hover zoom (estilo Amazon) ───────────────────────────────────────────────
const HOVER_ZOOM = 1.8
const stageEl    = ref(null)
const originX    = ref(50)   // %
const originY    = ref(50)   // %
const isCoarsePointer = ref(false)
const hoverZoomActive = computed(() => isHovered.value && !lightboxOpen.value && !isCoarsePointer.value && total.value > 0)

function onStageMouseMove(e) {
  if (!stageEl.value) return
  const rect = stageEl.value.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width)  * 100
  const y = ((e.clientY - rect.top)  / rect.height) * 100
  originX.value = Math.max(0, Math.min(100, x))
  originY.value = Math.max(0, Math.min(100, y))
}

const total       = computed(() => props.images.length)
const hasMultiple = computed(() => total.value > 1)

function thumbAt(i) {
  return (props.thumbs && props.thumbs[i]) || props.images[i]
}

function next() {
  if (!hasMultiple.value) return
  activeIndex.value = (activeIndex.value + 1) % total.value
}
function prev() {
  if (!hasMultiple.value) return
  activeIndex.value = (activeIndex.value - 1 + total.value) % total.value
}
function setIndex(i) {
  if (i < 0 || i >= total.value) return
  activeIndex.value = i
}

// ── Auto-rotación ─────────────────────────────────────────────────────────────
let timer = null
function clearTimer() { if (timer) { clearInterval(timer); timer = null } }
function startTimer() {
  clearTimer()
  if (!hasMultiple.value || props.autoIntervalMs <= 0) return
  if (isHovered.value || lightboxOpen.value) return
  timer = setInterval(next, props.autoIntervalMs)
}
watch([hasMultiple, isHovered, lightboxOpen], startTimer)
watch(() => props.autoIntervalMs, startTimer)
watch(() => props.images.length, () => { activeIndex.value = 0; startTimer() })

// Precarga de imágenes para evitar parpadeos al rotar
function preload(list) {
  if (typeof window === 'undefined') return
  list.forEach(src => { if (src) { const i = new Image(); i.src = src } })
}
onMounted(() => {
  preload(props.images)
  startTimer()
  window.addEventListener('keydown', onKeydown)
  if (typeof window !== 'undefined' && window.matchMedia) {
    isCoarsePointer.value = window.matchMedia('(pointer: coarse)').matches
  }
})
onBeforeUnmount(() => {
  clearTimer()
  window.removeEventListener('keydown', onKeydown)
  unlockBody()
})
watch(() => props.images, (imgs) => preload(imgs))

// ── Zoom / Pan en lightbox ────────────────────────────────────────────────────
const zoom    = ref(1)
const panX    = ref(0)
const panY    = ref(0)
const dragging = ref(false)
let dragStart = { x: 0, y: 0, panX: 0, panY: 0 }

function openLightbox() {
  if (!total.value) return
  lightboxOpen.value = true
  resetZoom()
  lockBody()
}
function closeLightbox() {
  lightboxOpen.value = false
  resetZoom()
  unlockBody()
}
function resetZoom() { zoom.value = 1; panX.value = 0; panY.value = 0 }

function setZoom(v) {
  const nextV = Math.max(1, Math.min(5, v))
  if (nextV === 1) { panX.value = 0; panY.value = 0 }
  zoom.value = nextV
}
function zoomIn()  { setZoom(zoom.value + 0.5) }
function zoomOut() { setZoom(zoom.value - 0.5) }

function onWheel(e) {
  e.preventDefault()
  const delta = -e.deltaY * 0.0025
  setZoom(zoom.value + delta * Math.max(1, zoom.value))
}

function onMouseDown(e) {
  if (zoom.value <= 1) return
  dragging.value = true
  dragStart = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
}
function onMouseMove(e) {
  if (!dragging.value) return
  panX.value = dragStart.panX + (e.clientX - dragStart.x)
  panY.value = dragStart.panY + (e.clientY - dragStart.y)
}
function onMouseUp() { dragging.value = false }

function onDoubleClick() {
  if (zoom.value > 1) resetZoom()
  else setZoom(2.5)
}

// Pinch-to-zoom táctil
let pinchStartDist = 0
let pinchStartZoom = 1
function touchDist(t) {
  const dx = t[0].clientX - t[1].clientX
  const dy = t[0].clientY - t[1].clientY
  return Math.hypot(dx, dy)
}
function onTouchStart(e) {
  if (e.touches.length === 2) {
    pinchStartDist = touchDist(e.touches)
    pinchStartZoom = zoom.value
  } else if (e.touches.length === 1 && zoom.value > 1) {
    dragging.value = true
    dragStart = {
      x: e.touches[0].clientX, y: e.touches[0].clientY,
      panX: panX.value, panY: panY.value,
    }
  }
}
function onTouchMove(e) {
  if (e.touches.length === 2 && pinchStartDist > 0) {
    e.preventDefault()
    const d = touchDist(e.touches)
    setZoom(pinchStartZoom * (d / pinchStartDist))
  } else if (dragging.value && e.touches.length === 1) {
    panX.value = dragStart.panX + (e.touches[0].clientX - dragStart.x)
    panY.value = dragStart.panY + (e.touches[0].clientY - dragStart.y)
  }
}
function onTouchEnd(e) {
  if (e.touches.length < 2) pinchStartDist = 0
  if (e.touches.length === 0) dragging.value = false
}

function onKeydown(e) {
  if (!lightboxOpen.value) return
  if (e.key === 'Escape')          closeLightbox()
  else if (e.key === 'ArrowLeft')  prev()
  else if (e.key === 'ArrowRight') next()
  else if (e.key === '+' || e.key === '=') zoomIn()
  else if (e.key === '-')          zoomOut()
  else if (e.key === '0')          resetZoom()
}

// Bloquear scroll del body cuando el lightbox está abierto
let prevOverflow = ''
function lockBody() {
  if (typeof document === 'undefined') return
  prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}
function unlockBody() {
  if (typeof document === 'undefined') return
  document.body.style.overflow = prevOverflow || ''
}

watch(activeIndex, resetZoom)
</script>

<template>
  <div class="media-gallery">
    <!-- ── Imagen principal / carrusel ────────────────────────────────────── -->
    <div
      ref="stageEl"
      class="relative bg-surface-raised border border-border-subtle overflow-hidden group"
      :class="aspectClass"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
      @mousemove="onStageMouseMove"
    >
      <template v-if="total">
        <Transition name="fade-img">
          <img
            :key="activeIndex"
            :src="images[activeIndex]"
            :alt="alt"
            class="absolute inset-0 w-full h-full object-contain cursor-zoom-in select-none hover-zoom-img"
            :style="{
              transform: hoverZoomActive ? `scale(${HOVER_ZOOM})` : 'scale(1)',
              transformOrigin: `${originX}% ${originY}%`,
            }"
            draggable="false"
            @click="openLightbox"
          />
        </Transition>
      </template>
      <slot v-else name="placeholder">
        <div class="w-full h-full flex flex-col items-center justify-center gap-2 text-text-disabled">
          <svg class="w-12 h-12" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z"/>
          </svg>
          <span class="text-[10px] tracking-widest uppercase">Sin imagen</span>
        </div>
      </slot>

      <!-- Slot para badges en esquinas (descuento, destacado, status…) -->
      <slot name="overlay" />

      <!-- Botón ampliar (siempre visible si hay imagen) -->
      <button
        v-if="total"
        type="button"
        @click.stop="openLightbox"
        class="absolute bottom-3 right-3 w-9 h-9 flex items-center justify-center bg-black/60 border border-border-default text-text-muted hover:text-accent hover:border-[var(--accent)44] transition-colors"
        aria-label="Ampliar imagen"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6"/>
        </svg>
      </button>

      <!-- Flechas de navegación -->
      <template v-if="hasMultiple">
        <button
          type="button"
          @click.stop="prev"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/60 border border-border-default hover:border-[var(--accent)44] transition-colors text-text-muted hover:text-accent opacity-0 group-hover:opacity-100"
          aria-label="Imagen anterior"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          type="button"
          @click.stop="next"
          class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/60 border border-border-default hover:border-[var(--accent)44] transition-colors text-text-muted hover:text-accent opacity-0 group-hover:opacity-100"
          aria-label="Imagen siguiente"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <!-- Indicadores -->
        <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          <button
            v-for="(_, idx) in images"
            :key="`dot-${idx}`"
            type="button"
            @click.stop="setIndex(idx)"
            :class="[
              'h-1.5 rounded-full transition-all',
              idx === activeIndex ? 'w-6 bg-accent' : 'w-1.5 bg-white/40 hover:bg-white/70',
            ]"
            :aria-label="`Ir a imagen ${idx + 1}`"
          />
        </div>
      </template>
    </div>

    <!-- ── Thumbnails ─────────────────────────────────────────────────────── -->
    <div v-if="hasMultiple" class="flex gap-2 mt-3 overflow-x-auto pb-1 thumbs-scroll">
      <button
        v-for="(img, idx) in images"
        :key="`thumb-${idx}`"
        type="button"
        @click="setIndex(idx)"
        :class="[
          'shrink-0 border overflow-hidden transition-colors',
          thumbSize === 'sm' ? 'w-16 h-16' : 'w-20 h-20',
          idx === activeIndex ? 'border-accent' : 'border-border-subtle hover:border-[var(--text-disabled)]',
        ]"
      >
        <img :src="thumbAt(idx)" :alt="`${alt} ${idx + 1}`" class="w-full h-full object-cover" />
      </button>
    </div>

    <!-- ── Lightbox / Zoom ────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="lightbox">
        <div
          v-if="lightboxOpen"
          class="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center"
          @click.self="closeLightbox"
        >
          <!-- Cerrar -->
          <button
            type="button"
            @click="closeLightbox"
            class="lb-corner-btn top-5 right-5"
            aria-label="Cerrar"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/>
            </svg>
          </button>

          <!-- Contador -->
          <div v-if="hasMultiple" class="absolute top-5 left-5 text-[11px] tracking-[0.18em] uppercase text-text-muted z-10">
            {{ activeIndex + 1 }} / {{ total }}
          </div>

          <!-- Controles de zoom -->
          <div class="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10 bg-black/40 border border-border-default px-1.5 py-1">
            <button type="button" @click="zoomOut" class="lb-btn" aria-label="Alejar">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM7 10h6"/>
              </svg>
            </button>
            <span class="px-2 text-[11px] text-text-muted tabular-nums w-12 text-center">{{ Math.round(zoom * 100) }}%</span>
            <button type="button" @click="zoomIn" class="lb-btn" aria-label="Acercar">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6"/>
              </svg>
            </button>
            <button type="button" @click="resetZoom" class="lb-btn ml-1" aria-label="Restablecer zoom">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582M19.418 15A8.003 8.003 0 014 9m0 0L8 13m12 7v-5h-.582M4.582 9A8.003 8.003 0 0120 15m0 0l-4-4"/>
              </svg>
            </button>
          </div>

          <!-- Flechas (lightbox) -->
          <template v-if="hasMultiple">
            <button type="button" @click.stop="prev" class="lb-nav" style="left:1.25rem" aria-label="Imagen anterior">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button type="button" @click.stop="next" class="lb-nav" style="right:1.25rem" aria-label="Imagen siguiente">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </template>

          <!-- Imagen con zoom -->
          <div
            class="lb-stage"
            @wheel.prevent="onWheel"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseUp"
            @touchstart="onTouchStart"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
            @dblclick="onDoubleClick"
            :style="{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }"
          >
            <img
              :src="images[activeIndex]"
              :alt="alt"
              class="lb-img select-none"
              :style="{
                transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                transition: dragging ? 'none' : 'transform 0.2s ease',
              }"
              draggable="false"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Crossfade entre imágenes del carrusel */
.fade-img-enter-active,
.fade-img-leave-active {
  transition: opacity 0.45s ease;
}
.fade-img-enter-from,
.fade-img-leave-to { opacity: 0; }

/* Hover zoom estilo Amazon: la transformación se anima sólo al entrar/salir,
   pero el origen sigue al cursor sin transition para que se sienta inmediato */
.hover-zoom-img {
  transition: transform 0.18s ease-out;
  will-change: transform;
}

/* Scrollbar fino para los thumbnails */
.thumbs-scroll::-webkit-scrollbar { height: 4px; }
.thumbs-scroll::-webkit-scrollbar-track { background: transparent; }
.thumbs-scroll::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

/* Lightbox */
.lb-corner-btn {
  position: absolute;
  width: 2.5rem; height: 2.5rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55);
  border: 1px solid var(--border-default);
  color: var(--text-muted);
  transition: color 0.15s, border-color 0.15s;
  z-index: 20;
}
.lb-corner-btn:hover { color: var(--accent); border-color: var(--accent); }

.lb-btn {
  width: 2rem; height: 2rem;
  display: flex; align-items: center; justify-content: center;
  background: transparent;
  color: var(--text-muted);
  transition: color 0.15s;
}
.lb-btn:hover { color: var(--accent); }

.lb-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 3rem; height: 3rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55);
  border: 1px solid var(--border-default);
  color: var(--text-muted);
  transition: color 0.15s, border-color 0.15s;
  z-index: 10;
}
.lb-nav:hover { color: var(--accent); border-color: var(--accent); }

.lb-stage {
  width: 100vw; height: 100vh;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  touch-action: none;
}
.lb-img {
  max-width: 92vw; max-height: 86vh;
  object-fit: contain;
  transform-origin: center center;
  user-select: none;
  -webkit-user-drag: none;
  will-change: transform;
}

.lightbox-enter-active,
.lightbox-leave-active { transition: opacity 0.25s ease; }
.lightbox-enter-from,
.lightbox-leave-to { opacity: 0; }
</style>
