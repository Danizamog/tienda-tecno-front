<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Line as LineChart } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale } from 'chart.js'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale)

const router = useRouter()
const api = useVendorApi()
const { selectedStore, selectedStoreId, hasStore } = useVendorStore()

const loading = ref(true)
const error = ref('')
const transactions = ref([])
const summary = ref(null)
const chartDaily = ref([])

function money(value) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(value || 0))
}

function fmtDate(value) {
  return value
    ? new Date(value).toLocaleString('es-BO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
}

function statusClass(status) {
  return {
    completed: 'tx-completed',
    pending: 'tx-pending',
    reserved: 'tx-reserved',
    approved: 'tx-approved',
    failed: 'tx-failed',
    cancelled: 'tx-cancelled',
    rejected: 'tx-failed',
  }[status] || 'tx-neutral'
}

function typeLabel(type) {
  return {
    order_payment: 'Pago de pedido',
    order_refund: 'Reembolso de pedido',
    auction_payment: 'Pago de subasta',
    giftcard_issue: 'Emisión giftcard',
    giftcard_redeem: 'Canje giftcard',
    manual_adjustment: 'Ajuste manual',
  }[type] || type
}

async function load() {
  if (!hasStore.value) {
    router.push('/vendor/select-store')
    return
  }

  loading.value = true
  error.value = ''

  try {
    const [transactionsRes, summaryRes] = await Promise.all([
      api.listFinanceTransactions({ storeId: selectedStoreId.value }),
      api.getFinanceSummary({ storeId: selectedStoreId.value }),
    ])

    transactions.value = transactionsRes?.items || []
    chartDaily.value = transactionsRes?.chartDaily || []
    summary.value = summaryRes?.summary || null
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(selectedStoreId, load)

const chartData = computed(() => ({
  labels: chartDaily.value.map((item) => item.date),
  datasets: [
    {
      label: 'Ingresos diarios',
      data: chartDaily.value.map((item) => item.amount),
      borderColor: 'var(--accent)',
      backgroundColor: 'rgba(201, 169, 110, 0.18)',
      fill: true,
      tension: 0.35,
      pointRadius: 2,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: 'var(--text-primary)' } },
  },
  scales: {
    x: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'var(--chart-grid)' } },
    y: { beginAtZero: true, ticks: { color: 'var(--text-muted)' }, grid: { color: 'var(--chart-grid)' } },
  },
}

const metrics = computed(() => {
  const data = summary.value || {}
  return [
    { label: 'Transacciones', value: data.transactions_count ?? 0 },
    { label: 'Completadas', value: data.completed_transactions ?? 0 },
    { label: 'Bruto', value: money(data.gross_transactions) },
    { label: 'Ganancia neta', value: money(data.net_revenue_estimate) },
    { label: 'Giftcards activas', value: data.active_giftcards ?? 0 },
    { label: 'Saldo giftcards', value: money(data.giftcards_outstanding_balance) },
  ]
})
</script>

<template>
  <div class="p-5 lg:p-8 min-h-screen">
    <div class="mb-6">
      <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-0.5">Vendedor</p>
      <h1 class="text-xl lg:text-2xl font-light tracking-wide text-text-primary">Transacciones</h1>
      <p class="text-sm text-text-muted mt-2">Resumen financiero de {{ selectedStore?.name || 'la tienda seleccionada' }}.</p>
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ error }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-24 text-text-muted">Cargando transacciones...</div>

    <template v-else>
      <section class="panel mb-6">
        <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div v-for="item in metrics" :key="item.label" class="metric-card">
            <p class="metric-label">{{ item.label }}</p>
            <p class="metric-value">{{ item.value }}</p>
          </div>
        </div>
      </section>

      <section class="panel mb-6">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div>
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Gráfico</p>
            <h2 class="text-lg text-text-primary mt-1">Ingresos diarios</h2>
          </div>
          <p class="text-xs text-text-muted">{{ chartDaily.length }} puntos</p>
        </div>
        <div v-if="chartDaily.length" class="h-72">
          <LineChart :data="chartData" :options="chartOptions" />
        </div>
        <div v-else class="text-sm text-text-muted py-8 text-center">No hay datos de ingresos para mostrar.</div>
      </section>

      <section class="panel">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div>
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Tabla</p>
            <h2 class="text-lg text-text-primary mt-1">Movimientos de la tienda</h2>
          </div>
          <p class="text-xs text-text-muted">{{ transactions.length }} registros</p>
        </div>

        <div v-if="!transactions.length" class="text-sm text-text-muted py-10 text-center">Sin transacciones registradas.</div>

        <div v-else class="flex flex-col gap-2 max-h-128 overflow-auto pr-1">
          <article v-for="tx in transactions" :key="tx.id" class="tx-card">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm text-text-primary truncate">{{ typeLabel(tx.type) }}</p>
                <p class="text-[10px] text-text-muted mt-0.5 truncate">{{ tx.notes || tx.id }}</p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm text-accent">{{ money(tx.amount) }}</p>
                <span :class="['tx-badge', statusClass(tx.status)]">{{ tx.status }}</span>
              </div>
            </div>
            <div class="mt-3 flex items-center justify-between text-[10px] text-text-muted">
              <span>{{ tx.currency || 'BS' }}</span>
              <span>{{ fmtDate(tx.created || tx.updated) }}</span>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.panel { background: var(--surface-sunken); border: 1px solid var(--surface-overlay); border-radius: 3px; padding: 1rem 1.1rem; }
.metric-card { padding: 0.8rem 0.9rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; display: flex; flex-direction: column; gap: 0.2rem; }
.metric-label { font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.metric-value { font-size: 1rem; color: var(--text-primary); font-weight: 500; }
.tx-card { padding: 0.85rem 0.95rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; }
.tx-badge { display: inline-flex; padding: 0.18rem 0.5rem; border-radius: 999px; font-size: 0.65rem; letter-spacing: 0.05em; text-transform: uppercase; margin-top: 0.25rem; }
.tx-completed { background: var(--success-soft); color: var(--success); }
.tx-pending { background: var(--warning-soft); color: var(--warning); }
.tx-reserved { background: var(--info-soft); color: var(--info); }
.tx-approved { background: var(--info-soft); color: var(--info); }
.tx-failed { background: var(--danger-soft); color: var(--danger); }
.tx-cancelled { background: var(--surface-raised); color: var(--text-secondary); }
.tx-neutral { background: var(--surface-raised); color: var(--text-secondary); }
</style>