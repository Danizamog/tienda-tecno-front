<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Line as LineChart } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale, Filler } from 'chart.js'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale, Filler)

const router = useRouter()
const api = useVendorApi()
const { selectedStore, selectedStoreId, hasStore } = useVendorStore()
const loading = ref(true)
const error = ref('')
const forecast = ref(null)
const horizonDays = ref(30)

const money = (value) => new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(value || 0))
const number = (value) => new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 }).format(Number(value || 0))
const dateLabel = (value) => new Date(`${value}T00:00:00Z`).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })

async function load() {
  if (!hasStore.value) { router.push('/vendor/select-store'); return }
  loading.value = true
  error.value = ''
  try {
    forecast.value = await api.getVendorForecast(selectedStoreId.value, { historyDays: 365, horizonDays: horizonDays.value })
  } catch (err) {
    error.value = err.message
    forecast.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(selectedStoreId, load)
watch(horizonDays, load)

const summary = computed(() => forecast.value?.summary || {})
const model = computed(() => forecast.value?.model || {})
const chartData = computed(() => {
  const historical = (forecast.value?.historical || []).slice(-60)
  const projected = forecast.value?.forecast || []
  return {
    labels: [...historical.map((item) => dateLabel(item.date)), ...projected.map((item) => dateLabel(item.date))],
    datasets: [
      { label: 'Compras reales', data: [...historical.map((item) => item.orders), ...projected.map(() => null)], borderColor: '#c9a96e', backgroundColor: 'transparent', tension: 0.3, pointRadius: 1.5 },
      { label: 'Compras proyectadas', data: [...historical.map(() => null), ...projected.map((item) => item.orders)], borderColor: '#79b89b', backgroundColor: 'rgba(121, 184, 155, 0.12)', fill: true, tension: 0.3, pointRadius: 1.5 },
    ],
  }
})
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#d9ded9', boxWidth: 12 } } },
  scales: { x: { ticks: { color: '#849087', maxTicksLimit: 8 }, grid: { color: 'rgba(132, 144, 135, .12)' } }, y: { beginAtZero: true, ticks: { color: '#849087' }, grid: { color: 'rgba(132, 144, 135, .12)' } } },
}
</script>

<template>
  <div class="p-5 lg:p-8 min-h-screen">
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div>
        <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Vendedor / {{ selectedStore?.name || 'Tienda' }}</p>
        <h1 class="text-xl lg:text-2xl font-light tracking-wide text-text-primary">Proyecciones</h1>
        <p class="text-sm text-text-muted mt-2">Estimación de compras e ingresos usando el historial de la tienda.</p>
      </div>
      <label class="text-[10px] tracking-[0.14em] uppercase text-text-muted">
        Horizonte
        <select v-model="horizonDays" class="input-field ml-2 normal-case tracking-normal">
          <option :value="7">7 días</option>
          <option :value="14">14 días</option>
          <option :value="30">30 días</option>
          <option :value="60">60 días</option>
          <option :value="90">90 días</option>
        </select>
      </label>
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">{{ error }}</div>
    <div v-if="loading" class="flex items-center justify-center py-24 text-text-muted text-sm">Calculando proyección...</div>

    <template v-else-if="forecast">
      <div v-if="forecast.warnings?.length" class="mb-5 px-4 py-3 bg-yellow-950/30 border border-yellow-900/40 text-yellow-500/90 text-xs rounded-sm">
        {{ forecast.warnings[0] }}
      </div>

      <section class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div class="metric-card"><p class="metric-label">Compras estimadas</p><p class="metric-value">{{ number(summary.forecast_orders) }}</p><p class="metric-note">próximos {{ horizonDays }} días</p></div>
        <div class="metric-card"><p class="metric-label">Ingresos estimados</p><p class="metric-value">Bs {{ money(summary.forecast_revenue) }}</p><p class="metric-note">ventas proyectadas</p></div>
        <div class="metric-card"><p class="metric-label">Ganancia estimada</p><p class="metric-value">{{ summary.forecast_profit == null ? 'Sin coste' : `Bs ${money(summary.forecast_profit)}` }}</p><p class="metric-note">{{ summary.forecast_profit == null ? 'registra costes en productos' : 'según costes guardados' }}</p></div>
        <div class="metric-card"><p class="metric-label">Confianza</p><p class="metric-value capitalize" :class="model.confidence === 'low' ? 'text-yellow-400' : 'text-vendor'">{{ model.confidence || '—' }}</p><p class="metric-note">MAE compras: {{ number(model.mae_orders) }}</p></div>
      </section>

      <section class="panel mb-6">
        <div class="flex items-center justify-between gap-3 mb-4"><div><p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Modelo MLP</p><h2 class="text-lg text-text-primary mt-1">Compras reales y proyectadas</h2></div><span class="text-[10px] text-text-muted">{{ model.training_sales_days || 0 }} días con ventas</span></div>
        <div class="h-72"><LineChart :data="chartData" :options="chartOptions" /></div>
      </section>

      <section class="panel">
        <div class="flex items-center justify-between gap-3 mb-4"><div><p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Detalle</p><h2 class="text-lg text-text-primary mt-1">Próximos días</h2></div><span class="text-xs text-text-muted">{{ forecast.forecast?.length || 0 }} puntos</span></div>
        <div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-(--surface-overlay)"><th class="th">Fecha</th><th class="th text-right">Compras</th><th class="th text-right">Ingresos</th><th class="th text-right">Rango</th></tr></thead><tbody><tr v-for="item in forecast.forecast" :key="item.date" class="border-b border-border-subtle"><td class="td text-text-secondary">{{ dateLabel(item.date) }}</td><td class="td text-right text-text-primary">{{ number(item.orders) }}</td><td class="td text-right text-vendor">Bs {{ money(item.revenue) }}</td><td class="td text-right text-text-muted">{{ number(item.lower_bound) }} - {{ number(item.upper_bound) }}</td></tr></tbody></table></div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.panel { background: var(--surface-sunken); border: 1px solid var(--surface-overlay); border-radius: 3px; padding: 1rem 1.1rem; }
.metric-card { padding: .8rem .9rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; display: flex; flex-direction: column; gap: .2rem; }
.metric-label { font-size: .65rem; letter-spacing: .12em; text-transform: uppercase; color: var(--text-muted); }
.metric-value { font-size: 1rem; color: var(--text-primary); font-weight: 500; }
.metric-note { font-size: .65rem; color: var(--text-muted); }
</style>
