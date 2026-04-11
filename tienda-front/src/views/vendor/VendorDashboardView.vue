<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'

const router = useRouter()
const api    = useVendorApi()
const { selectedStore, selectedStoreId, hasStore } = useVendorStore()

const loading = ref(true)
const error   = ref('')
const summary = ref(null)
const store   = ref(null)

async function load() {
  if (!hasStore.value) { router.push('/vendor/select-store'); return }
  loading.value = true
  error.value   = ''
  try {
    const data = await api.getVendorDashboard(selectedStoreId.value)
    summary.value = data?.summary || null
    store.value   = data?.store   || selectedStore.value
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(selectedStoreId, load)

function money(v) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(v || 0))
}
function dec(v) {
  return new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(v || 0))
}

const metricCards = computed(() => {
  const s = summary.value || {}
  return [
    { label: 'Productos activos',   value: s.products_active   ?? '—', note: `${s.products_draft ?? 0} en borrador` },
    { label: 'Órdenes pendientes',  value: s.orders_pending    ?? '—', note: 'pago por verificar' },
    { label: 'Órdenes enviadas',    value: s.orders_shipped    ?? '—', note: `${s.orders_delivered ?? 0} entregadas` },
    { label: 'Subastas activas',    value: s.auctions_active   ?? '—', note: `${s.auctions_ended ?? 0} cerradas` },
    { label: 'Ingresos brutos',     value: money(s.gross_revenue), note: 'de órdenes completadas' },
    { label: 'Reviews recibidas',   value: s.reviews_total     ?? '—', note: `rating ${dec(s.store_rating)} / 5` },
  ]
})

const quickLinks = [
  { to: '/vendor/products', label: 'Productos',  icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z', desc: 'Catálogo y stock' },
  { to: '/vendor/orders',   label: 'Órdenes',    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', desc: 'Aprobar y gestionar pedidos' },
  { to: '/vendor/auctions', label: 'Subastas',   icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'Crear y monitorear subastas' },
  { to: '/vendor/payments', label: 'Pagos QR',   icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z', desc: 'QR y comprobantes' },
]
</script>

<template>
  <div class="p-5 lg:p-8 min-h-screen">

    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ error }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-24 text-[#555] text-sm">Cargando dashboard...</div>

    <template v-else>
      <!-- Encabezado con info de tienda -->
      <div class="mb-7 flex flex-col sm:flex-row sm:items-center gap-4">
        <div class="flex-1 min-w-0">
          <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-0.5">Panel de Vendedor</p>
          <h1 class="text-xl lg:text-2xl font-light tracking-wide text-[#e8e5e0] truncate">{{ store?.name || 'Mi Tienda' }}</h1>
          <div class="flex items-center gap-3 mt-1.5 flex-wrap">
            <span
              class="text-[9px] tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-sm border font-medium"
              :class="{
                'text-emerald-400 border-emerald-900/50 bg-emerald-950/40': store?.status === 'active',
                'text-yellow-400 border-yellow-900/50 bg-yellow-950/40': store?.status === 'pending',
                'text-red-400 border-red-900/50 bg-red-950/40': store?.status === 'suspended',
              }"
            >{{ store?.status }}</span>
            <span v-if="store?.verified" class="text-[9px] tracking-[0.18em] uppercase text-[#8ab4a0]">✓ verificada</span>
            <span v-if="store?.location" class="text-[10px] text-[#555]">{{ store.location }}</span>
          </div>
        </div>
      </div>

      <!-- Métricas -->
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-7">
        <div v-for="card in metricCards" :key="card.label" class="metric-card">
          <p class="metric-label">{{ card.label }}</p>
          <p class="metric-value">{{ card.value }}</p>
          <p class="metric-note">{{ card.note }}</p>
        </div>
      </div>

      <!-- Accesos rápidos -->
      <div class="mb-7">
        <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-3">Accesos rápidos</p>
        <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <RouterLink
            v-for="link in quickLinks"
            :key="link.to"
            :to="link.to"
            class="quick-card group"
          >
            <div class="flex items-center gap-2.5 mb-2.5">
              <div class="w-8 h-8 rounded-sm border border-[#1e2e28] bg-[#0d1511] flex items-center justify-center shrink-0 transition-colors group-hover:border-[#8ab4a044]">
                <svg class="w-4 h-4 text-[#8ab4a066] transition-colors group-hover:text-[#8ab4a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" :d="link.icon" />
                </svg>
              </div>
              <p class="text-[12px] font-medium text-[#d8d5cf] group-hover:text-white transition-colors">{{ link.label }}</p>
            </div>
            <p class="text-[10px] text-[#555] leading-relaxed hidden sm:block">{{ link.desc }}</p>
            <div class="mt-3 flex items-center gap-1 text-[#8ab4a066] group-hover:text-[#8ab4a0] transition-colors">
              <span class="text-[9px] tracking-[0.14em] uppercase">Ir</span>
              <svg class="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </RouterLink>
        </div>
      </div>

      <!-- Barra de estado de tienda -->
      <div class="panel">
        <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-4">Estado de la tienda</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="mini-stat">
            <span>Productos vendidos</span>
            <strong>{{ summary?.products_sold ?? 0 }}</strong>
          </div>
          <div class="mini-stat">
            <span>Órdenes aprobadas</span>
            <strong>{{ summary?.orders_approved ?? 0 }}</strong>
          </div>
          <div class="mini-stat">
            <span>Subastas cerradas</span>
            <strong>{{ summary?.auctions_ended ?? 0 }}</strong>
          </div>
          <div class="mini-stat">
            <span>Rating promedio</span>
            <strong>{{ dec(summary?.store_rating) }} ★</strong>
          </div>
        </div>
        <div v-if="store?.description" class="mt-4 pt-4 border-t border-[#181818]">
          <p class="text-[10px] tracking-[0.16em] uppercase text-[#3a3a38] mb-1.5">Descripción</p>
          <p class="text-[12px] text-[#666] leading-relaxed line-clamp-2">{{ store.description }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.metric-card, .panel { background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; padding: 0.9rem 1rem; }
.metric-label { font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: #3a3a38; margin-bottom: 0.3rem; }
.metric-value { font-size: 1.25rem; font-weight: 300; color: #e8e5e0; line-height: 1.05; }
.metric-note { margin-top: 0.35rem; font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; color: #666; }
.quick-card {
  display: block;
  background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; padding: 0.9rem 1rem;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.quick-card:hover { border-color: #1e2e28; background: #0d110f; }
.mini-stat {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 0.5rem 0.65rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px;
  font-size: 0.65rem; letter-spacing: 0.08em;
}
.mini-stat span { color: #555; text-transform: uppercase; }
.mini-stat strong { color: #d8d5cf; font-weight: 500; }
</style>
