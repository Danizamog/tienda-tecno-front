<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'

const router = useRouter()
const api    = useVendorApi()
const { setStore } = useVendorStore()

const stores  = ref([])
const loading = ref(true)
const error   = ref('')
const totalPages = ref(1)
const totalItems = ref(0)
const page = ref(1)
const perPage = 12

async function loadStores() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.getMyStores({ page: page.value, perPage })
    stores.value = data?.items || []
    totalItems.value = data?.totalItems || 0
    totalPages.value = data?.totalPages || 1
    // Si solo tiene una tienda, seleccionarla directamente
    if (totalItems.value === 1 && stores.value.length === 1) {
      selectStore(stores.value[0])
    }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(loadStores)

function selectStore(store) {
  setStore(store)
  router.push('/vendor')
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  loadStores()
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  loadStores()
}

function logoUrl(store) {
  if (!store?.logo) return ''
  const pb = import.meta.env.VITE_POCKETBASE_URL || ''
  return `${pb}/api/files/stores/${store.id}/${store.logo}`
}
</script>

<template>
  <div class="min-h-screen bg-surface-base flex flex-col items-center justify-center px-4 py-12">

    <!-- Logo / título -->
    <div class="mb-10 text-center">
      <p class="text-[10px] tracking-[0.25em] uppercase text-text-disabled mb-2">Panel de Vendedor</p>
      <h1 class="text-2xl font-light tracking-wide text-text-primary">Selecciona tu tienda</h1>
      <p class="text-sm text-text-muted mt-2">Elige con qué tienda quieres operar</p>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-6 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm max-w-md w-full text-center">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-text-muted text-sm">Cargando tiendas...</div>

    <!-- Sin tiendas -->
    <div v-else-if="!stores.length && !error" class="text-center max-w-sm">
      <div class="w-16 h-16 rounded-full border border-border-default bg-surface-raised flex items-center justify-center mx-auto mb-4">
        <svg class="w-7 h-7 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      </div>
      <p class="text-text-muted text-sm mb-1">No tienes tiendas registradas</p>
      <p class="text-text-disabled text-xs">Contacta al administrador para activar tu tienda</p>
    </div>

    <!-- Lista de tiendas -->
    <div v-else class="w-full max-w-xl flex flex-col gap-3">
      <button
        v-for="store in stores"
        :key="store.id"
        class="store-card group"
        @click="selectStore(store)"
      >
        <!-- Logo -->
        <div class="w-12 h-12 rounded-sm border border-border-default bg-surface-raised flex items-center justify-center shrink-0 overflow-hidden">
          <img
            v-if="logoUrl(store)"
            :src="logoUrl(store)"
            :alt="store.name"
            class="w-full h-full object-cover"
          />
          <svg v-else class="w-5 h-5 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0 text-left">
          <p class="text-[14px] font-medium text-text-primary group-hover:text-white transition-colors truncate">
            {{ store.name }}
          </p>
          <div class="flex items-center gap-3 mt-0.5">
            <span
              class="text-[9px] tracking-[0.18em] uppercase font-medium px-1.5 py-0.5 rounded-sm border"
              :class="{
                'text-emerald-400 border-emerald-900/50 bg-emerald-950/40': store.status === 'active',
                'text-yellow-400 border-yellow-900/50 bg-yellow-950/40': store.status === 'pending',
                'text-red-400 border-red-900/50 bg-red-950/40': store.status === 'suspended',
              }"
            >{{ store.status }}</span>
            <span v-if="store.verified" class="text-[9px] tracking-[0.18em] uppercase text-vendor">
              ✓ verificada
            </span>
            <span v-if="store.rating > 0" class="text-[10px] text-text-muted">
              ★ {{ Number(store.rating).toFixed(1) }}
            </span>
          </div>
        </div>

        <!-- Flecha -->
        <svg class="w-4 h-4 text-text-disabled group-hover:text-vendor transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div v-if="totalPages > 1" class="flex items-center justify-between gap-3 pt-2">
        <p class="text-[11px] text-text-muted">
          Página {{ page }} de {{ totalPages }} · {{ totalItems }} tiendas
        </p>
        <div class="flex items-center gap-2">
          <button class="page-btn" :disabled="page <= 1" @click="prevPage">‹</button>
          <button class="page-btn" :disabled="page >= totalPages" @click="nextPage">›</button>
        </div>
      </div>
    </div>

    <!-- Volver -->
    <RouterLink
      to="/"
      class="mt-10 back-link"
    >
      <span class="back-link__icon">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </span>
      <span class="back-link__copy">
        <strong>Volver al sitio</strong>
        <small>Salir del panel de vendedor</small>
      </span>
    </RouterLink>

  </div>
</template>

<style scoped>
.back-link {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  width: 100%;
  max-width: 26rem;
  padding: 0.95rem 1rem;
  border: 1px solid var(--vendor-border);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--surface-raised) 0%, var(--surface-sunken) 100%);
  color: var(--text-secondary);
  transition: all 0.18s ease;
}

.back-link:hover {
  border-color: var(--vendor)44;
  background: linear-gradient(180deg, var(--vendor-soft) 0%, var(--surface-raised) 100%);
  color: var(--text-primary);
}

.back-link__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  border: 1px solid var(--vendor-border);
  background: var(--vendor-soft);
  color: var(--vendor);
  flex-shrink: 0;
}

.back-link__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.back-link__copy strong {
  font-size: 0.86rem;
  font-weight: 500;
  color: var(--text-primary);
}

.back-link__copy small {
  margin-top: 0.15rem;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.store-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.1rem;
  background: var(--surface-sunken);
  border: 1px solid var(--surface-overlay);
  border-radius: 3px;
  transition: border-color 0.18s ease, background 0.18s ease;
  cursor: pointer;
}
.store-card:hover {
  border-color: var(--vendor-soft);
  background: var(--vendor-soft);
}

.page-btn {
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid var(--border-subtle);
  border-radius: 3px;
  background: var(--surface-raised);
  color: var(--text-muted);
  font-size: 0.75rem;
  transition: all 0.18s ease;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--vendor)44;
  color: var(--vendor);
}

.page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
