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

onMounted(async () => {
  try {
    const data = await api.getMyStores()
    stores.value = data?.items || []
    // Si solo tiene una tienda, seleccionarla directamente
    if (stores.value.length === 1) {
      selectStore(stores.value[0])
    }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

function selectStore(store) {
  setStore(store)
  router.push('/vendor')
}

function logoUrl(store) {
  if (!store?.logo) return ''
  const pb = import.meta.env.VITE_POCKETBASE_URL || ''
  return `${pb}/api/files/stores/${store.id}/${store.logo}`
}
</script>

<template>
  <div class="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-4 py-12">

    <!-- Logo / título -->
    <div class="mb-10 text-center">
      <p class="text-[10px] tracking-[0.25em] uppercase text-[#3a3a38] mb-2">Panel de Vendedor</p>
      <h1 class="text-2xl font-light tracking-wide text-[#e8e5e0]">Selecciona tu tienda</h1>
      <p class="text-sm text-[#555] mt-2">Elige con qué tienda quieres operar</p>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-6 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm max-w-md w-full text-center">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-[#555] text-sm">Cargando tiendas...</div>

    <!-- Sin tiendas -->
    <div v-else-if="!stores.length && !error" class="text-center max-w-sm">
      <div class="w-16 h-16 rounded-full border border-[#222] bg-[#0f0f0f] flex items-center justify-center mx-auto mb-4">
        <svg class="w-7 h-7 text-[#333]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      </div>
      <p class="text-[#555] text-sm mb-1">No tienes tiendas registradas</p>
      <p class="text-[#3a3a38] text-xs">Contacta al administrador para activar tu tienda</p>
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
        <div class="w-12 h-12 rounded-sm border border-[#222] bg-[#111] flex items-center justify-center shrink-0 overflow-hidden">
          <img
            v-if="logoUrl(store)"
            :src="logoUrl(store)"
            :alt="store.name"
            class="w-full h-full object-cover"
          />
          <svg v-else class="w-5 h-5 text-[#333]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0 text-left">
          <p class="text-[14px] font-medium text-[#e8e5e0] group-hover:text-white transition-colors truncate">
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
            <span v-if="store.verified" class="text-[9px] tracking-[0.18em] uppercase text-[#8ab4a0]">
              ✓ verificada
            </span>
            <span v-if="store.rating > 0" class="text-[10px] text-[#666]">
              ★ {{ Number(store.rating).toFixed(1) }}
            </span>
          </div>
        </div>

        <!-- Flecha -->
        <svg class="w-4 h-4 text-[#3a3a38] group-hover:text-[#8ab4a0] transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Volver -->
    <RouterLink
      to="/"
      class="mt-10 flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase text-[#444] hover:text-[#8ab4a0] transition-colors"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Volver al sitio
    </RouterLink>

  </div>
</template>

<style scoped>
.store-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.1rem;
  background: #0c0c0c;
  border: 1px solid #181818;
  border-radius: 3px;
  transition: border-color 0.18s ease, background 0.18s ease;
  cursor: pointer;
}
.store-card:hover {
  border-color: #1e2e28;
  background: #0d110f;
}
</style>
