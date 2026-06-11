<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCompareStore } from '@/composables/useCompareStore'

const route  = useRoute()
const router = useRouter()

const {
  compareItems,
  totalCompareCount,
  maxCompare,
  removeFromCompare,
  clearCompare,
} = useCompareStore()

const visible = computed(() => {
  if (totalCompareCount.value === 0) return false
  const p = route.path
  if (p.startsWith('/vendor') || p.startsWith('/admin') || p === '/compare') return false
  return true
})

const canCompare = computed(() => totalCompareCount.value >= 2)

function goCompare() {
  if (!canCompare.value) return
  router.push('/compare')
}
</script>

<template>
  <Transition name="compare-bar">
    <div v-if="visible" class="compare-bar">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-5">
        <!-- Etiqueta -->
        <div class="hidden sm:flex flex-col shrink-0">
          <span class="text-[9px] tracking-[0.18em] uppercase text-text-muted">Comparar</span>
          <span class="font-display text-lg text-accent tabular-nums leading-tight">{{ totalCompareCount }}/{{ maxCompare }}</span>
        </div>

        <!-- Thumbnails -->
        <div class="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
          <div
            v-for="item in compareItems"
            :key="item.id"
            class="compare-bar-thumb group shrink-0"
            :title="item.name"
          >
            <img v-if="item.image" :src="item.image" :alt="item.name" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full flex items-center justify-center text-text-disabled">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <button
              type="button"
              class="compare-bar-remove"
              :aria-label="`Quitar ${item.name} del comparador`"
              @click="removeFromCompare(item.id)"
            >✕</button>
          </div>

          <!-- Huecos restantes -->
          <div
            v-for="n in (maxCompare - totalCompareCount)"
            :key="`empty-${n}`"
            class="compare-bar-thumb compare-bar-thumb--empty shrink-0 hidden sm:flex"
          >
            <span class="text-text-disabled text-lg leading-none">+</span>
          </div>
        </div>

        <!-- Acciones -->
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            class="btn-gold disabled:opacity-40 disabled:cursor-not-allowed"
            style="padding: 0.6rem 1.4rem;"
            :disabled="!canCompare"
            :title="canCompare ? 'Ver comparación' : 'Selecciona al menos 2 productos'"
            @click="goCompare"
          >
            Comparar<span class="sm:hidden"> ({{ totalCompareCount }})</span>
          </button>
          <button
            type="button"
            class="text-text-muted hover:text-accent transition-colors text-[10px] tracking-[0.14em] uppercase"
            @click="clearCompare"
          >
            Limpiar
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.compare-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 60;
  background: var(--surface-base);
  border-top: 1px solid var(--border-subtle);
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.35);
}

.compare-bar-thumb {
  position: relative;
  width: 52px;
  height: 52px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}

.compare-bar-thumb img {
  display: block;
}

.compare-bar-thumb--empty {
  border-style: dashed;
  background: transparent;
}

.compare-bar-remove {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.compare-bar-remove:hover {
  background: var(--accent);
  color: var(--accent-on);
  border-color: var(--accent);
}

.compare-bar-enter-active,
.compare-bar-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.compare-bar-enter-from,
.compare-bar-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
