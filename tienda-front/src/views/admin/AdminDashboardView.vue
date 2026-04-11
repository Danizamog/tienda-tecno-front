<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAdminApi } from '@/composables/useAdminApi'

const api = useAdminApi()

const loading = ref(true)
const error = ref('')
const financeSummary = ref(null)
const marketplaceSummary = ref(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [financeData, marketplaceData] = await Promise.all([
      api.getFinanceSummary(),
      api.getMarketplaceOverview(),
    ])
    financeSummary.value = financeData?.summary || null
    marketplaceSummary.value = marketplaceData?.summary || null
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

const topStores = computed(() => (financeSummary.value?.by_store || []).slice(0, 6))
const topRatedStores = computed(() => (marketplaceSummary.value?.top_stores || []).slice(0, 5))
const maxStoreAmount = computed(() => Math.max(...topStores.value.map((item) => item.gross_amount || 0), 1))
const marketplaceCards = computed(() => {
  const data = marketplaceSummary.value || {}

  return [
    {
      label: 'Usuarios',
      value: data.users_total || 0,
      note: `${data.users_verified || 0} verificados`,
    },
    {
      label: 'Vendedores',
      value: data.users_vendor || 0,
      note: `${data.stores_total || 0} tiendas vinculadas`,
    },
    {
      label: 'Tiendas activas',
      value: data.stores_active || 0,
      note: `${data.stores_verified || 0} verificadas`,
    },
    {
      label: 'Productos activos',
      value: data.products_active || 0,
      note: `${data.products_sold || 0} vendidos`,
    },
    {
      label: 'Órdenes completadas',
      value: data.orders_completed || 0,
      note: `${data.orders_pending || 0} pendientes`,
    },
    {
      label: 'Subastas activas',
      value: data.auctions_active || 0,
      note: `${data.auctions_total || 0} en total`,
    },
    {
      label: 'Reviews',
      value: data.reviews_total || 0,
      note: `${data.reviewed_stores || 0} tiendas calificadas`,
    },
    {
      label: 'Rating medio',
      value: formatDecimal(data.avg_store_rating || 0),
      note: 'sobre 5 en tiendas',
    },
  ]
})

const financeCards = computed(() => {
  const data = financeSummary.value || {}
  const marketplaceData = marketplaceSummary.value || {}
  return [
    { label: 'Transacciones', value: data.transactions_count || 0, note: `${data.completed_transactions || 0} completadas` },
    { label: 'Bruto', value: money(data.gross_transactions), note: 'ventas acumuladas' },
    { label: 'Descuentos', value: money(data.discounts_total), note: 'giftcards aplicadas' },
    { label: 'Neto estimado', value: money(data.net_revenue_estimate), note: 'recaudo esperado' },
    { label: 'Giftcards activas', value: data.active_giftcards || 0, note: `${money(data.giftcards_outstanding_balance)} por redimir` },
    { label: 'Tiendas activas', value: `${formatPercent(marketplaceData.stores_active || 0, marketplaceData.stores_total || 1)}%`, note: 'sobre tiendas registradas' },
  ]
})

const healthBars = computed(() => {
  const data = marketplaceSummary.value || {}
  const items = [
    { label: 'Tiendas verificadas', value: data.stores_verified || 0, total: data.stores_total || 0, note: `${data.stores_total || 0} tiendas` },
    { label: 'Catálogo activo', value: data.products_active || 0, total: data.products_total || 0, note: `${data.products_total || 0} productos` },
    { label: 'Órdenes completadas', value: data.orders_completed || 0, total: data.orders_total || 0, note: `${data.orders_total || 0} órdenes` },
    { label: 'Subastas activas', value: data.auctions_active || 0, total: data.auctions_total || 0, note: `${data.auctions_total || 0} subastas` },
    { label: 'Usuarios verificados', value: data.users_verified || 0, total: data.users_total || 0, note: `${data.users_total || 0} usuarios` },
  ]

  return items.map((item) => ({
    ...item,
    percent: percent(item.value, item.total),
  }))
})

function money(value) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatDecimal(value) {
  return new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value || 0))
}

function percent(value, maxValue) {
  if (!maxValue) return 0
  return Math.max(6, Math.round((value / maxValue) * 100))
}

function formatPercent(value, total) {
  if (!total) return 0
  return Math.round((Number(value || 0) / Number(total || 0)) * 100)
}
</script>

<template>
  <div class="p-6 lg:p-8 min-h-screen">
    <div class="mb-8">
      <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-1">Panel de</p>
      <h1 class="text-2xl font-light tracking-wide text-[#e8e5e0]">Administración</h1>
      <p class="text-sm text-[#666] mt-2 max-w-2xl">Resumen general de tiendas, usuarios y transacciones con enfoque operativo.</p>
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ error }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-24 text-[#666]">Cargando dashboard...</div>

    <template v-else>
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <div v-for="card in marketplaceCards" :key="card.label" class="metric-card">
          <p class="metric-label">{{ card.label }}</p>
          <p class="metric-value">{{ card.value }}</p>
          <p class="metric-note">{{ card.note }}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 xl:grid-cols-6 gap-3 mb-6">
        <div v-for="card in financeCards" :key="card.label" class="metric-card xl:col-span-1">
          <p class="metric-label">{{ card.label }}</p>
          <p class="metric-value">{{ card.value }}</p>
          <p class="metric-note">{{ card.note }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <section class="panel">
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38]">Transacciones por tienda</p>
              <h2 class="text-lg text-[#e8e5e0] mt-1">Carga operativa</h2>
            </div>
          </div>

          <div v-if="topStores.length === 0" class="text-sm text-[#666] py-8">No hay transacciones para mostrar.</div>

          <div v-else class="flex flex-col gap-4">
            <div v-for="item in topStores" :key="item.store_id || item.store_name" class="store-row">
              <div class="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p class="text-sm text-[#e8e5e0]">{{ item.store_name }}</p>
                  <p class="text-[10px] text-[#666] tracking-[0.16em] uppercase">{{ item.transactions_count }} transacciones</p>
                </div>
                <p class="text-sm text-[#c9a96e]">{{ money(item.gross_amount) }}</p>
              </div>
              <div class="h-3 bg-[#121212] rounded-full overflow-hidden border border-[#1b1b1b]">
                <div class="h-full bg-gradient-to-r from-[#c9a96e] to-[#8a6b2e] rounded-full" :style="{ width: `${percent(item.gross_amount, maxStoreAmount)}%` }"></div>
              </div>
              <div class="mt-2 grid grid-cols-3 gap-2 text-[10px] text-[#666]">
                <div class="mini-stat"><span>Completadas</span><strong>{{ item.completed_count }}</strong></div>
                <div class="mini-stat"><span>Pendientes</span><strong>{{ item.pending_count }}</strong></div>
                <div class="mini-stat"><span>Ticket bruto</span><strong>{{ money(item.gross_amount) }}</strong></div>
              </div>
            </div>
          </div>
        </section>

        <aside class="panel flex flex-col gap-5">
          <div>
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38]">Salud del marketplace</p>
            <div class="mt-4 flex flex-col gap-3">
              <div v-for="item in healthBars" :key="item.label" class="health-row">
                <div class="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p class="text-sm text-[#e8e5e0]">{{ item.label }}</p>
                    <p class="text-[10px] text-[#666] tracking-[0.16em] uppercase">{{ item.note }}</p>
                  </div>
                  <p class="text-sm text-[#c9a96e]">{{ item.value }} / {{ item.total }}</p>
                </div>
                <div class="h-3 bg-[#121212] rounded-full overflow-hidden border border-[#1b1b1b]">
                  <div class="h-full bg-gradient-to-r from-[#c9a96e] to-[#5e4b26] rounded-full" :style="{ width: `${item.percent}%` }"></div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38]">Tiendas mejor valoradas</p>
            <div class="mt-4 flex flex-col gap-3">
              <div v-for="store in topRatedStores" :key="store.id" class="top-rated-row">
                <div>
                  <p class="text-sm text-[#e8e5e0]">{{ store.name }}</p>
                  <p class="text-[10px] text-[#666] tracking-[0.16em] uppercase">{{ store.status }} · {{ store.verified ? 'verificada' : 'sin verificar' }}</p>
                </div>
                <div class="text-right">
                  <p class="text-sm text-[#c9a96e]">{{ formatDecimal(store.rating || 0) }}</p>
                  <p class="text-[10px] text-[#666]">{{ store.reviews_count || 0 }} reviews</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.metric-card, .panel { background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; padding: 1rem 1.1rem; }
.metric-label { font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: #3a3a38; margin-bottom: 0.35rem; }
.metric-value { font-size: 1.3rem; font-weight: 300; color: #e8e5e0; line-height: 1.05; }
.metric-note { margin-top: 0.4rem; font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: #666; }
.store-row { padding: 0.95rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; }
.mini-stat { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.45rem 0.55rem; background: #0b0b0b; border: 1px solid #161616; border-radius: 3px; }
.mini-stat span { color: #666; }
.mini-stat strong { color: #d8d5cf; font-weight: 500; }
.health-row { padding: 0.9rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; }
.top-rated-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 0.8rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; }
</style>
