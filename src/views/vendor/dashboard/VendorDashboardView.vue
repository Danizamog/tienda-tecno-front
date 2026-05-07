<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'

const router = useRouter()
const api    = useVendorApi()
const { selectedStore, selectedStoreId, hasStore } = useVendorStore()

// ── Estado ──────────────────────────────────────────────────────────────────
const loadingLive    = ref(true)
const loadingMetrics = ref(true)
const errorLive      = ref('')
const errorMetrics   = ref('')

const summary      = ref(null)
const store        = ref(null)
const metrics      = ref(null)

const selectedDays   = ref(30)
const syncingMetrics = ref(false)
const syncResult     = ref(null)

const RANGE_OPTIONS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

// ── Carga de datos en vivo (store-service) ─────────────────────────────────
async function loadLive() {
  if (!hasStore.value) { router.push('/vendor/select-store'); return }
  loadingLive.value = true
  errorLive.value   = ''
  try {
    const data = await api.getVendorDashboard(selectedStoreId.value)
    summary.value = data?.summary || null
    store.value   = data?.store   || selectedStore.value
  } catch (e) {
    errorLive.value = e.message
  } finally {
    loadingLive.value = false
  }
}

// ── Carga de métricas históricas (dashboard-service) ──────────────────────
async function loadMetrics() {
  if (!hasStore.value) return
  loadingMetrics.value = true
  errorMetrics.value   = ''
  try {
    const data = await api.getStoreDashboardMetrics(selectedStoreId.value, { days: selectedDays.value })
    metrics.value = data || null
  } catch (e) {
    // Si el servicio no está disponible, no bloquear el dashboard principal
    errorMetrics.value = e.message
    metrics.value = null
  } finally {
    loadingMetrics.value = false
  }
}

onMounted(() => { loadLive(); loadMetrics() })
watch(selectedStoreId, () => { loadLive(); loadMetrics() })
watch(selectedDays,    () => loadMetrics())

// ── Sincronización manual ──────────────────────────────────────────────────
async function syncToday() {
  syncingMetrics.value = true
  syncResult.value = null
  try {
    // Los vendors no pueden lanzar sync directo; simplemente recargar
    await loadMetrics()
    syncResult.value = { ok: true }
  } catch (e) {
    syncResult.value = { ok: false, error: e.message }
  } finally {
    syncingMetrics.value = false
    setTimeout(() => { syncResult.value = null }, 3000)
  }
}

// ── Formateo ───────────────────────────────────────────────────────────────
function money(v) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(v || 0))
}
function dec(v) {
  return new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(v || 0))
}
function shortDate(str) {
  if (!str) return ''
  const d = new Date(str.slice(0, 10) + 'T00:00:00Z')
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

// ── Métricas en vivo (tarjetas superiores) ─────────────────────────────────
const metricCards = computed(() => {
  const s = summary.value || {}
  return [
    { label: 'Productos activos',   value: s.products_active   ?? '—', note: `${s.products_draft ?? 0} en borrador`,      color: 'green' },
    { label: 'Órdenes pendientes',  value: s.orders_pending    ?? '—', note: 'pago por verificar',                          color: 'yellow' },
    { label: 'Órdenes enviadas',    value: s.orders_shipped    ?? '—', note: `${s.orders_delivered ?? 0} entregadas`,       color: 'blue' },
    { label: 'Subastas activas',    value: s.auctions_active   ?? '—', note: `${s.auctions_ended ?? 0} cerradas`,           color: 'purple' },
    { label: 'Ingresos brutos',     value: money(s.gross_revenue), note: 'de órdenes completadas',                          color: 'green' },
    { label: 'Reviews recibidas',   value: s.reviews_total     ?? '—', note: `rating ${dec(s.store_rating)} / 5`,           color: 'orange' },
  ]
})

// ── Gráfico de barras (dashboard_metrics) ─────────────────────────────────
const chartItems = computed(() => metrics.value?.items || [])
const chartSummary = computed(() => metrics.value?.summary || {})

const maxSales = computed(() => {
  const vals = chartItems.value.map(i => Number(i.sales_total || 0))
  return Math.max(...vals, 1)
})

function barHeight(item) {
  const val = Number(item.sales_total || 0)
  return Math.max(4, Math.round((val / maxSales.value) * 100))
}

const periodCards = computed(() => {
  const s = chartSummary.value
  return [
    { label: 'Ventas totales',     value: money(s.sales_total),        note: `${selectedDays.value} días`, color: 'green' },
    { label: 'Transacciones',      value: s.transactions_count ?? '—', note: `${s.days_with_sales ?? 0} días activos`, color: 'blue' },
    { label: 'Promedio diario',    value: money(s.avg_daily_sales),    note: 'días con ventas',             color: 'teal' },
    { label: 'Descuentos/GC',      value: money(s.discounts_total),    note: 'gift cards aplicadas',        color: 'yellow' },
    { label: 'Gift cards emitidas',value: s.giftcards_total ?? '—',    note: 'en el período',               color: 'purple' },
    { label: 'Subastas cerradas',  value: s.auctions_total ?? '—',     note: 'finalizadas',                 color: 'orange' },
  ]
})

// Accesos rápidos
const quickLinks = [
  { to: '/vendor/products', label: 'Productos',  icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z', desc: 'Catálogo y stock' },
  { to: '/vendor/orders',   label: 'Órdenes',    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', desc: 'Aprobar y gestionar pedidos' },
  { to: '/vendor/auctions', label: 'Subastas',   icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'Crear y monitorear subastas' },
  { to: '/vendor/payments', label: 'Pagos QR',   icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z', desc: 'QR y comprobantes' },
]
</script>

<template>
  <div class="p-5 lg:p-8 min-h-screen">

    <!-- Error en vivo -->
    <div v-if="errorLive" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ errorLive }}
    </div>

    <div v-if="loadingLive" class="flex items-center justify-center py-24 text-text-muted text-sm">Cargando dashboard...</div>

    <template v-else>
      <!-- ── Encabezado ─────────────────────────────────────────────────── -->
      <div class="mb-7 flex flex-col sm:flex-row sm:items-center gap-4">
        <div class="flex-1 min-w-0">
          <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-0.5">Panel de Vendedor</p>
          <h1 class="text-xl lg:text-2xl font-light tracking-wide text-text-primary truncate">{{ store?.name || 'Mi Tienda' }}</h1>
          <div class="flex items-center gap-3 mt-1.5 flex-wrap">
            <span
              class="text-[9px] tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-sm border font-medium"
              :class="{
                'text-emerald-400 border-emerald-900/50 bg-emerald-950/40': store?.status === 'active',
                'text-yellow-400 border-yellow-900/50 bg-yellow-950/40': store?.status === 'pending',
                'text-red-400 border-red-900/50 bg-red-950/40': store?.status === 'suspended',
              }"
            >{{ store?.status }}</span>
            <span v-if="store?.verified" class="text-[9px] tracking-[0.18em] uppercase text-vendor">✓ verificada</span>
            <span v-if="store?.location" class="text-[10px] text-text-muted">{{ store.location }}</span>
          </div>
        </div>
      </div>

      <!-- ── Métricas en vivo ───────────────────────────────────────────── -->
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-7">
        <div v-for="card in metricCards" :key="card.label" class="metric-card">
          <p class="metric-label">{{ card.label }}</p>
          <p class="metric-value">{{ card.value }}</p>
          <p class="metric-note">{{ card.note }}</p>
        </div>
      </div>

      <!-- ── Sección de ventas históricas ──────────────────────────────── -->
      <div class="panel mb-7">
        <!-- Header con selector de período -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Ventas históricas</p>
            <h2 class="text-[15px] font-light text-text-primary mt-0.5">Análisis del período</h2>
            <p class="text-[11px] text-text-muted mt-1">Fuente: <code class="text-[var(--vendor)66] text-[10px]">dashboard_metrics</code> — el dashboard-service corre 01:00 UTC, calcula el día anterior y hace upsert.</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              v-for="opt in RANGE_OPTIONS"
              :key="opt.days"
              class="range-btn"
              :class="{ 'range-btn--active': selectedDays === opt.days }"
              @click="selectedDays = opt.days"
            >{{ opt.label }}</button>
            <button
              class="ml-2 px-2.5 py-1 text-[9px] tracking-[0.14em] uppercase border border-vendor-border text-[var(--vendor)66] hover:text-vendor hover:border-[var(--vendor)44] rounded-sm transition-colors disabled:opacity-40"
              :disabled="syncingMetrics"
              @click="syncToday"
            >
              <span v-if="syncingMetrics">...</span>
              <span v-else>↻ actualizar</span>
            </button>
          </div>
        </div>

        <!-- Tarjetas del período -->
        <div v-if="loadingMetrics" class="flex items-center justify-center py-12 text-text-muted text-xs">
          Cargando métricas...
        </div>

        <template v-else-if="errorMetrics">
          <div class="px-4 py-3 bg-yellow-950/30 border border-yellow-900/40 text-yellow-500/80 text-xs rounded-sm mb-4">
            Servicio de métricas no disponible: {{ errorMetrics }}
          </div>
        </template>

        <template v-else>
          <!-- Resumen del período -->
          <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-6">
            <div v-for="card in periodCards" :key="card.label" class="period-card">
              <p class="metric-label">{{ card.label }}</p>
              <p class="metric-value text-base">{{ card.value }}</p>
              <p class="metric-note">{{ card.note }}</p>
            </div>
          </div>

          <!-- Gráfico de barras diario -->
          <div>
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-3">Ventas diarias (Bs)</p>

            <div v-if="!chartItems.length" class="py-10 text-center text-text-muted text-xs">
              Sin datos de métricas para este período. El cron job las genera automáticamente cada día.
            </div>

            <div v-else class="relative">
              <!-- Barras -->
              <div class="flex items-end gap-px h-28 border-b border-border-subtle mb-1 overflow-x-auto scrollbar-none pb-0.5">
                <div
                  v-for="item in chartItems"
                  :key="item.id"
                  class="flex-1 min-w-1.5 group relative"
                  :style="{ height: '100%', display: 'flex', alignItems: 'flex-end' }"
                >
                  <!-- Tooltip -->
                  <div class="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10
                              hidden group-hover:flex flex-col items-center pointer-events-none">
                    <div class="bg-surface-raised border border-border-default rounded-sm px-2 py-1.5 text-center whitespace-nowrap">
                      <p class="text-[9px] text-text-muted tracking-wider">{{ shortDate(item.metric_date) }}</p>
                      <p class="text-[12px] text-vendor font-medium">Bs {{ money(item.sales_total) }}</p>
                      <p class="text-[9px] text-text-muted">{{ item.transactions_count }} ventas</p>
                    </div>
                    <div class="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--border-default)]"></div>
                  </div>
                  <!-- Barra -->
                  <div
                    class="w-full rounded-t-[1px] transition-all duration-200 group-hover:opacity-90"
                    :class="Number(item.sales_total || 0) > 0 ? 'bg-linear-to-t from-[#4a7a65] to-[var(--vendor)]' : 'bg-surface-overlay'"
                    :style="{ height: `${barHeight(item)}%` }"
                  ></div>
                </div>
              </div>

              <!-- Etiquetas de fecha (cada ~7 items) -->
              <div class="flex items-start gap-px overflow-x-auto scrollbar-none">
                <div
                  v-for="(item, idx) in chartItems"
                  :key="'lbl-' + item.id"
                  class="flex-1 min-w-1.5 text-center"
                >
                  <span
                    v-if="idx === 0 || idx === Math.floor(chartItems.length / 2) || idx === chartItems.length - 1"
                    class="text-[8px] text-text-disabled block"
                  >{{ shortDate(item.metric_date) }}</span>
                </div>
              </div>

              <!-- Línea de máximo -->
              <div class="mt-3 flex items-center justify-between text-[9px] text-text-disabled">
                <span>0 Bs</span>
                <span>máx. Bs {{ money(maxSales) }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- ── Accesos rápidos ────────────────────────────────────────────── -->
      <div class="mb-7">
        <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-3">Accesos rápidos</p>
        <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <RouterLink
            v-for="link in quickLinks"
            :key="link.to"
            :to="link.to"
            class="quick-card group"
          >
            <div class="flex items-center gap-2.5 mb-2.5">
              <div class="w-8 h-8 rounded-sm border border-vendor-border bg-vendor-soft flex items-center justify-center shrink-0 transition-colors group-hover:border-[var(--vendor)44]">
                <svg class="w-4 h-4 text-[var(--vendor)66] transition-colors group-hover:text-vendor" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" :d="link.icon" />
                </svg>
              </div>
              <p class="text-[12px] font-medium text-text-secondary group-hover:text-white transition-colors">{{ link.label }}</p>
            </div>
            <p class="text-[10px] text-text-muted leading-relaxed hidden sm:block">{{ link.desc }}</p>
            <div class="mt-3 flex items-center gap-1 text-[var(--vendor)66] group-hover:text-vendor transition-colors">
              <span class="text-[9px] tracking-[0.14em] uppercase">Ir</span>
              <svg class="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.metric-card, .panel { background: var(--surface-sunken); border: 1px solid var(--surface-overlay); border-radius: 3px; padding: 0.9rem 1rem; }
.period-card { background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; padding: 0.75rem 0.85rem; }
.metric-label { font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--border-strong); margin-bottom: 0.3rem; }
.metric-value { font-size: 1.25rem; font-weight: 300; color: var(--text-primary); line-height: 1.05; }
.metric-note  { margin-top: 0.35rem; font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }

.quick-card {
  display: block;
  background: var(--surface-sunken); border: 1px solid var(--surface-overlay); border-radius: 3px; padding: 0.9rem 1rem;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.quick-card:hover { border-color: var(--vendor-soft); background: var(--vendor-soft); }

.mini-stat {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 0.5rem 0.65rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px;
  font-size: 0.65rem; letter-spacing: 0.08em;
}
.mini-stat span   { color: var(--text-muted); text-transform: uppercase; }
.mini-stat strong { color: var(--text-secondary); font-weight: 500; }

.range-btn {
  padding: 0.2rem 0.6rem;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  border-radius: 2px;
  transition: all 0.15s ease;
  background: transparent;
  cursor: pointer;
}
.range-btn:hover   { color: var(--text-muted); border-color: var(--border-default); }
.range-btn--active { color: var(--vendor); border-color: var(--vendor)44; background: var(--vendor-soft); }

.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
