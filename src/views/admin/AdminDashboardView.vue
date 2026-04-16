<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminApi } from '@/composables/useAdminApi'

const api = useAdminApi()

// ── Estado: métricas en vivo ───────────────────────────────────────────────
const loading          = ref(true)
const error            = ref('')
const financeSummary   = ref(null)
const marketplaceSummary = ref(null)

// ── Estado: métricas históricas ────────────────────────────────────────────
const loadingHistory  = ref(true)
const errorHistory    = ref('')
const historyOverview = ref(null)
const historyStores   = ref(null)
const selectedDays    = ref(30)
const syncing         = ref(false)
const syncResult      = ref(null)

const RANGE_OPTIONS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

// ── Carga en vivo ──────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  error.value = ''
  try {
    const [financeData, marketplaceData] = await Promise.all([
      api.getFinanceSummary(),
      api.getMarketplaceOverview(),
    ])
    financeSummary.value   = financeData?.summary   || null
    marketplaceSummary.value = marketplaceData?.summary || null
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// ── Carga histórica ────────────────────────────────────────────────────────
async function loadHistory() {
  loadingHistory.value = true
  errorHistory.value   = ''
  try {
    const [overview, stores] = await Promise.all([
      api.getDashboardOverview({ days: selectedDays.value }),
      api.getDashboardByStore({ days: selectedDays.value }),
    ])
    historyOverview.value = overview || null
    historyStores.value   = stores   || null
  } catch (e) {
    errorHistory.value = e.message
    historyOverview.value = null
    historyStores.value   = null
  } finally {
    loadingHistory.value = false
  }
}

// ── Sync manual ────────────────────────────────────────────────────────────
async function runSync() {
  syncing.value = true
  syncResult.value = null
  try {
    const result = await api.syncDashboardMetrics()
    syncResult.value = { ok: true, synced: result?.synced ?? '—', total: result?.total ?? '—', date: result?.date }
    await loadHistory()
  } catch (e) {
    syncResult.value = { ok: false, error: e.message }
  } finally {
    syncing.value = false
    setTimeout(() => { syncResult.value = null }, 5000)
  }
}

onMounted(() => { load(); loadHistory() })
watch(selectedDays, loadHistory)

// ── Computed en vivo ───────────────────────────────────────────────────────
const topStores     = computed(() => (financeSummary.value?.by_store || []).slice(0, 6))
const topRatedStores = computed(() => (marketplaceSummary.value?.top_stores || []).slice(0, 5))
const maxStoreAmount = computed(() => Math.max(...topStores.value.map((i) => i.gross_amount || 0), 1))

const marketplaceCards = computed(() => {
  const data = marketplaceSummary.value || {}
  return [
    { label: 'Usuarios',         value: data.users_total || 0,     note: `${data.users_verified || 0} verificados` },
    { label: 'Vendedores',       value: data.users_vendor || 0,    note: `${data.stores_total || 0} tiendas vinculadas` },
    { label: 'Tiendas activas',  value: data.stores_active || 0,   note: `${data.stores_verified || 0} verificadas` },
    { label: 'Productos activos',value: data.products_active || 0, note: `${data.products_sold || 0} vendidos` },
    { label: 'Órdenes completadas', value: data.orders_completed || 0, note: `${data.orders_pending || 0} pendientes` },
    { label: 'Subastas activas', value: data.auctions_active || 0, note: `${data.auctions_total || 0} en total` },
    { label: 'Reviews',          value: data.reviews_total || 0,   note: `${data.reviewed_stores || 0} tiendas calificadas` },
    { label: 'Rating medio',     value: formatDecimal(data.avg_store_rating || 0), note: 'sobre 5 en tiendas' },
  ]
})

const financeCards = computed(() => {
  const data = financeSummary.value || {}
  const mkt  = marketplaceSummary.value || {}
  return [
    { label: 'Transacciones',    value: data.transactions_count || 0,        note: `${data.completed_transactions || 0} completadas` },
    { label: 'Bruto',            value: money(data.gross_transactions),       note: 'ventas acumuladas' },
    { label: 'Descuentos',       value: money(data.discounts_total),          note: 'giftcards aplicadas' },
    { label: 'Neto estimado',    value: money(data.net_revenue_estimate),     note: 'recaudo esperado' },
    { label: 'Giftcards activas',value: data.active_giftcards || 0,          note: `${money(data.giftcards_outstanding_balance)} por redimir` },
    { label: 'Tiendas activas',  value: `${formatPercent(mkt.stores_active || 0, mkt.stores_total || 1)}%`, note: 'sobre tiendas registradas' },
  ]
})

const healthBars = computed(() => {
  const data = marketplaceSummary.value || {}
  const items = [
    { label: 'Tiendas verificadas',  value: data.stores_verified || 0,  total: data.stores_total || 0,   note: `${data.stores_total || 0} tiendas` },
    { label: 'Catálogo activo',      value: data.products_active || 0,  total: data.products_total || 0, note: `${data.products_total || 0} productos` },
    { label: 'Órdenes completadas',  value: data.orders_completed || 0, total: data.orders_total || 0,   note: `${data.orders_total || 0} órdenes` },
    { label: 'Subastas activas',     value: data.auctions_active || 0,  total: data.auctions_total || 0, note: `${data.auctions_total || 0} subastas` },
    { label: 'Usuarios verificados', value: data.users_verified || 0,   total: data.users_total || 0,    note: `${data.users_total || 0} usuarios` },
  ]
  return items.map((item) => ({ ...item, percent: percent(item.value, item.total) }))
})

// ── Computed histórico ─────────────────────────────────────────────────────
const dailyItems = computed(() => historyOverview.value?.daily || [])
const globalSummary = computed(() => historyOverview.value?.summary || {})
const storesList    = computed(() => (historyStores.value?.stores || []).slice(0, 8))

const maxDailySales = computed(() => {
  const vals = dailyItems.value.map(i => Number(i.sales_total || 0))
  return Math.max(...vals, 1)
})
const maxStoreSales = computed(() => {
  const vals = storesList.value.map(s => Number(s.sales_total || 0))
  return Math.max(...vals, 1)
})

function barHeightDaily(item) {
  return Math.max(4, Math.round((Number(item.sales_total || 0) / maxDailySales.value) * 100))
}

const globalCards = computed(() => {
  const s = globalSummary.value
  return [
    { label: 'Ventas totales',      value: money(s.sales_total),        note: `${selectedDays.value} días` },
    { label: 'Transacciones',       value: s.transactions_count ?? '—', note: 'órdenes entregadas' },
    { label: 'Gift cards emitidas', value: s.giftcards_total ?? '—',    note: 'en el período' },
    { label: 'Descuentos aplicados',value: money(s.discounts_total),    note: 'total descontado' },
    { label: 'Subastas cerradas',   value: s.auctions_total ?? '—',     note: 'finalizadas' },
  ]
})

// ── Formateo ───────────────────────────────────────────────────────────────
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
function shortDate(str) {
  if (!str) return ''
  const d = new Date(str.slice(0, 10) + 'T00:00:00Z')
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', timeZone: 'UTC' })
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
      <!-- Métricas de marketplace en vivo -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <div v-for="card in marketplaceCards" :key="card.label" class="metric-card">
          <p class="metric-label">{{ card.label }}</p>
          <p class="metric-value">{{ card.value }}</p>
          <p class="metric-note">{{ card.note }}</p>
        </div>
      </div>

      <!-- Métricas financieras en vivo -->
      <div class="grid grid-cols-2 xl:grid-cols-6 gap-3 mb-6">
        <div v-for="card in financeCards" :key="card.label" class="metric-card xl:col-span-1">
          <p class="metric-label">{{ card.label }}</p>
          <p class="metric-value">{{ card.value }}</p>
          <p class="metric-note">{{ card.note }}</p>
        </div>
      </div>

      <!-- Tablas en vivo: por tienda + salud del marketplace -->
      <div class="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6 mb-8">
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
                <div class="h-full bg-linear-to-r from-[#c9a96e] to-[#8a6b2e] rounded-full" :style="{ width: `${percent(item.gross_amount, maxStoreAmount)}%` }"></div>
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
                  <div class="h-full bg-linear-to-r from-[#c9a96e] to-[#5e4b26] rounded-full" :style="{ width: `${item.percent}%` }"></div>
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

      <!-- ═══════════════════════════════════════════════════════════════════
           SECCIÓN HISTÓRICA — dashboard_metrics
           ═══════════════════════════════════════════════════════════════════ -->
      <div class="panel">
        <!-- Header con selector de período y botón de sync -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38]">Ventas históricas</p>
            <h2 class="text-lg font-light text-[#e8e5e0] mt-0.5">Análisis del período</h2>
            <p class="text-xs text-[#555] mt-0.5">Datos de <code class="text-[#c9a96e66] text-[10px]">dashboard_metrics</code> — el dashboard-service corre cada día a las 01:00 UTC, calcula el día anterior y hace upsert.</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center gap-1">
              <button
                v-for="opt in RANGE_OPTIONS"
                :key="opt.days"
                class="range-btn"
                :class="{ 'range-btn--active': selectedDays === opt.days }"
                @click="selectedDays = opt.days"
              >{{ opt.label }}</button>
            </div>
            <!-- Botón de sync manual -->
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-[9px] tracking-[0.14em] uppercase border rounded-sm transition-all disabled:opacity-40"
              :class="syncing ? 'border-[#2a3a2a] text-[#8ab4a066]' : 'border-[#c9a96e44] text-[#c9a96e88] hover:text-[#c9a96e] hover:border-[#c9a96e88]'"
              :disabled="syncing"
              @click="runSync"
            >
              <svg class="w-3 h-3" :class="syncing ? 'animate-spin' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{{ syncing ? 'sincronizando...' : 'sincronizar ayer' }}</span>
            </button>
          </div>
        </div>

        <!-- Resultado del sync -->
        <div v-if="syncResult" class="mb-4 px-3 py-2 rounded-sm text-xs border"
          :class="syncResult.ok ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400' : 'bg-red-950/30 border-red-900/40 text-red-400'"
        >
          <span v-if="syncResult.ok">
            Sync completado — {{ syncResult.synced }} de {{ syncResult.total }} tiendas sincronizadas para {{ syncResult.date }}
          </span>
          <span v-else>Error en sync: {{ syncResult.error }}</span>
        </div>

        <!-- Error de history -->
        <div v-if="errorHistory" class="mb-4 px-3 py-2 bg-yellow-950/30 border border-yellow-900/40 text-yellow-500/80 text-xs rounded-sm">
          Servicio de métricas no disponible: {{ errorHistory }}
        </div>

        <div v-else-if="loadingHistory" class="flex items-center justify-center py-10 text-[#555] text-xs">
          Cargando métricas históricas...
        </div>

        <template v-else>
          <!-- Tarjetas globales del período -->
          <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-7">
            <div v-for="card in globalCards" :key="card.label" class="period-card">
              <p class="metric-label">{{ card.label }}</p>
              <p class="text-xl font-light text-[#e8e5e0]">{{ card.value }}</p>
              <p class="metric-note">{{ card.note }}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
            <!-- Gráfico de barras diario (global) -->
            <div>
              <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-3">Ventas diarias globales (Bs)</p>
              <div v-if="!dailyItems.length" class="py-8 text-center text-[#555] text-xs">
                Sin datos para este período. El cron job genera métricas automáticamente cada día.
              </div>
              <div v-else>
                <div class="flex items-end gap-px h-32 border-b border-[#1a1a1a] mb-1 overflow-x-auto scrollbar-none pb-0.5">
                  <div
                    v-for="item in dailyItems"
                    :key="item.metric_date"
                    class="flex-1 min-w-1.5 group relative"
                    style="height: 100%; display: flex; align-items: flex-end"
                  >
                    <!-- Tooltip -->
                    <div class="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10
                                hidden group-hover:flex flex-col items-center pointer-events-none">
                      <div class="bg-[#111] border border-[#2a2a2a] rounded-sm px-2 py-1.5 text-center whitespace-nowrap">
                        <p class="text-[9px] text-[#888] tracking-wider">{{ shortDate(item.metric_date) }}</p>
                        <p class="text-[12px] text-[#c9a96e] font-medium">Bs {{ money(item.sales_total) }}</p>
                        <p class="text-[9px] text-[#666]">{{ item.transactions_count }} trans.</p>
                      </div>
                      <div class="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#2a2a2a]"></div>
                    </div>
                    <!-- Barra -->
                    <div
                      class="w-full rounded-t-[1px] transition-all duration-200 group-hover:opacity-80"
                      :class="Number(item.sales_total || 0) > 0 ? 'bg-linear-to-t from-[#7a5c1e] to-[#c9a96e]' : 'bg-[#181818]'"
                      :style="{ height: `${barHeightDaily(item)}%` }"
                    ></div>
                  </div>
                </div>
                <!-- Etiquetas de fecha -->
                <div class="flex items-start gap-px overflow-x-auto scrollbar-none">
                  <div
                    v-for="(item, idx) in dailyItems"
                    :key="'lbl-' + item.metric_date"
                    class="flex-1 min-w-1.5 text-center"
                  >
                    <span
                      v-if="idx === 0 || idx === Math.floor(dailyItems.length / 2) || idx === dailyItems.length - 1"
                      class="text-[8px] text-[#444] block"
                    >{{ shortDate(item.metric_date) }}</span>
                  </div>
                </div>
                <div class="mt-2 flex items-center justify-between text-[9px] text-[#444]">
                  <span>0 Bs</span>
                  <span>máx. Bs {{ money(maxDailySales) }}</span>
                </div>
              </div>
            </div>

            <!-- Ranking de tiendas por ventas en el período -->
            <div>
              <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-3">Top tiendas por ventas</p>
              <div v-if="!storesList.length" class="py-8 text-center text-[#555] text-xs">
                Sin datos de tiendas para este período.
              </div>
              <div v-else class="flex flex-col gap-2.5">
                <div v-for="(store, idx) in storesList" :key="store.store_id" class="store-rank-row">
                  <div class="flex items-center gap-2.5 mb-1.5">
                    <span class="text-[10px] text-[#3a3a38] w-4 shrink-0 font-medium">{{ idx + 1 }}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-[12px] text-[#d8d5cf] truncate">{{ store.store_name }}</p>
                      <p class="text-[9px] text-[#555] tracking-wider">{{ store.transactions_count }} transacciones</p>
                    </div>
                    <p class="text-[12px] text-[#c9a96e] shrink-0">Bs {{ money(store.sales_total) }}</p>
                  </div>
                  <div class="h-1.5 bg-[#141414] rounded-full overflow-hidden">
                    <div
                      class="h-full bg-linear-to-r from-[#7a5c1e] to-[#c9a96e] rounded-full"
                      :style="{ width: `${Math.max(4, Math.round((store.sales_total / maxStoreSales) * 100))}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.metric-card, .panel { background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; padding: 1rem 1.1rem; }
.period-card { background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; padding: 0.75rem 0.85rem; }
.metric-label { font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: #3a3a38; margin-bottom: 0.35rem; }
.metric-value { font-size: 1.3rem; font-weight: 300; color: #e8e5e0; line-height: 1.05; }
.metric-note  { margin-top: 0.4rem; font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: #666; }

.store-row { padding: 0.95rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; }
.mini-stat { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.45rem 0.55rem; background: #0b0b0b; border: 1px solid #161616; border-radius: 3px; }
.mini-stat span   { color: #666; }
.mini-stat strong { color: #d8d5cf; font-weight: 500; }
.health-row { padding: 0.9rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; }
.top-rated-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 0.8rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; }
.store-rank-row { padding: 0.65rem 0.75rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; }

.range-btn {
  padding: 0.2rem 0.6rem;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: 1px solid #1e1e1e;
  color: #555;
  border-radius: 2px;
  transition: all 0.15s ease;
  background: transparent;
  cursor: pointer;
}
.range-btn:hover   { color: #888; border-color: #2a2a2a; }
.range-btn--active { color: #c9a96e; border-color: #c9a96e44; background: #13110c; }

.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
