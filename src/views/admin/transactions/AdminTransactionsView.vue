<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAdminApi } from '@/composables/useAdminApi'
import { Line as LineChart } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale } from 'chart.js'

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale)

const api = useAdminApi()

const loading = ref(true)
const error = ref('')
const transactions = ref([])
const groups = ref([])
const gananciaTotal = ref(0)
const chartDataDaily = ref([])

function money(value) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(value || 0))
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

function fmtDate(d) {
  return d
    ? new Date(d).toLocaleString('es-BO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [txRes, groupRes] = await Promise.all([
      api.listTransactions(),
      api.listTransactionsByStore(),
    ])
    transactions.value = txRes?.items || []
    gananciaTotal.value = txRes?.gananciaTotal || 0
    chartDataDaily.value = txRes?.chartDaily || []
    groups.value = groupRes?.items || []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

const maxGross = computed(() => Math.max(...groups.value.map((g) => g.gross_amount || 0), 1))

const chartData = computed(() => {
  return {
    labels: chartDataDaily.value.map(d => d.date),
    datasets: [
      {
        label: 'Ganancias',
        data: chartDataDaily.value.map(d => d.amount),
        borderColor: 'var(--accent)',
        backgroundColor: 'rgba(201, 169, 110, 0.2)',
        tension: 0.4
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: { beginAtZero: true, ticks: { color: 'var(--text-muted)' } },
    x: { ticks: { color: 'var(--text-muted)' } }
  },
  plugins: {
    legend: { labels: { color: 'var(--text-primary)' } }
  }
}
</script>

<template>
  <div class="p-6 lg:p-8 min-h-screen">
    <div class="mb-8">
      <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-1">Administración</p>
      <h1 class="text-2xl font-light tracking-wide text-text-primary">Transacciones</h1>
      <p class="text-sm text-text-muted mt-2">Movimientos agrupados por tienda con visualización operativa.</p>
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ error }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-24 text-text-muted">Cargando transacciones...</div>

    <template v-else>
      <section class="panel mb-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Distribución por tienda</p>
            <h2 class="text-lg text-text-primary mt-1">Gráfico de carga</h2>
          </div>
          <p class="text-xs text-text-muted">{{ groups.length }} tiendas</p>
        </div>

        <div v-if="groups.length === 0" class="text-sm text-text-muted py-8">Sin datos.</div>
        <div v-else class="flex flex-col gap-4">
          <div v-for="group in groups" :key="group.store_id || group.store_name" class="group-card">
            <div class="flex items-center justify-between gap-3 mb-2">
              <div>
                <p class="text-sm text-text-primary">{{ group.store_name }}</p>
                <p class="text-[10px] text-text-muted tracking-[0.16em] uppercase">{{ group.transactions_count }} transacciones</p>
              </div>
              <div class="text-right">
                <p class="text-sm text-accent">{{ money(group.gross_amount) }}</p>
                <p class="text-[10px] text-text-muted">{{ money(group.completed_amount) }} completado</p>
              </div>
            </div>
              <div class="h-3 bg-surface-overlay rounded-full overflow-hidden border border-border-subtle">
                <div
                  class="h-full rounded-full"
                  :style="{
                    width: `${Math.max(6, Math.round((group.gross_amount / maxGross) * 100))}%`,
                    backgroundImage: 'linear-gradient(90deg, var(--accent), var(--accent-hover))'
                  }"
                ></div>
            </div>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
        <section class="panel mb-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Evolución</p>
              <h2 class="text-lg text-text-primary mt-1">Ganancia Diaria</h2>
            </div>
            <p class="text-sm text-accent">Ganancia Total: {{ money(gananciaTotal) }}</p>
          </div>
          <div style="height: 250px" v-if="chartDataDaily.length > 0">
            <LineChart :data="chartData" :options="chartOptions" />
          </div>
          <div v-else class="text-sm text-text-muted py-8 text-center">Sin datos de gráficos.</div>
        </section>

        <section class="panel">
          <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Resumen</p>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div class="stat-card"><span>Total</span><strong>{{ transactions.length }}</strong></div>
            <div class="stat-card"><span>Completadas</span><strong class="text-emerald-400">{{ transactions.filter((tx) => tx.status === 'completed').length }}</strong></div>
            <div class="stat-card"><span>Pendientes</span><strong class="text-amber-400">{{ transactions.filter((tx) => tx.status === 'pending').length }}</strong></div>
            <div class="stat-card"><span>Bruto</span><strong>{{ money(transactions.reduce((acc, tx) => acc + Number(tx.amount || 0), 0)) }}</strong></div>
          </div>
        </section>

        <section class="panel overflow-hidden">
          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Listado</p>
              <h2 class="text-lg text-text-primary mt-1">Todas las transacciones</h2>
            </div>
          </div>
          <div class="max-h-160 overflow-auto pr-1">
            <div v-for="group in groups" :key="group.store_name" class="mb-6 last:mb-0">
              <p class="store-heading">{{ group.store_name }}</p>
              <div class="flex flex-col gap-2 mt-3">
                <article v-for="tx in group.transactions" :key="tx.id" class="tx-card">
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
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.panel { background: var(--surface-sunken); border: 1px solid var(--surface-overlay); border-radius: 3px; padding: 1rem 1.1rem; }
.group-card { padding: 0.95rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; }
.store-heading { font-size: 0.68rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-muted); }
.tx-card { padding: 0.85rem 0.95rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; }
.tx-badge { display: inline-flex; padding: 0.18rem 0.5rem; border-radius: 999px; font-size: 0.65rem; letter-spacing: 0.05em; text-transform: uppercase; margin-top: 0.25rem; }
.tx-completed { background: var(--success-soft); color: var(--success); }
.tx-pending { background: var(--warning-soft); color: var(--warning); }
.tx-reserved { background: var(--info-soft); color: var(--info); }
.tx-approved { background: var(--info-soft); color: var(--info); }
.tx-failed { background: var(--danger-soft); color: var(--danger); }
.tx-cancelled { background: var(--surface-raised); color: var(--text-secondary); }
.tx-neutral { background: var(--surface-raised); color: var(--text-secondary); }
.stat-card { padding: 0.8rem 0.9rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; display: flex; flex-direction: column; gap: 0.2rem; }
.stat-card span { font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.stat-card strong { font-size: 1rem; color: var(--text-primary); font-weight: 500; }
</style>