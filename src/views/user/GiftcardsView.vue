<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useAuthSession } from '@/composables/useAuthSession'
import { useGiftcardApi } from '@/composables/useGiftcardApi'

const router = useRouter()
const { isAuthenticated } = useAuthSession()
const { listMyGiftcards, redeemCode } = useGiftcardApi()

const giftcards   = ref([])
const loading     = ref(false)
const redeemInput = ref('')
const redeemMsg   = ref(null)  // { type: 'ok'|'err', text }
const redeemBusy  = ref(false)

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { return Number(n || 0).toLocaleString('es-CL') }

function statusLabel(s) {
  return { active: 'Activa', redeemed: 'Canjeada', expired: 'Expirada', cancelled: 'Cancelada' }[s] || s
}

function statusClass(s) {
  return {
    active:    'badge-active',
    redeemed:  'badge-redeemed',
    expired:   'badge-expired',
    cancelled: 'badge-cancelled',
  }[s] || 'badge-expired'
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function gcStoreId(gc) {
  return Array.isArray(gc.store) ? gc.store[0] : gc.store
}

const activeCards = computed(() =>
  giftcards.value.filter(g =>
    g.status === 'active' &&
    Number(g.balance || 0) > 0 &&
    !!gcStoreId(g)
  )
)

const otherCards = computed(() =>
  giftcards.value.filter(g =>
    g.status !== 'active' ||
    Number(g.balance || 0) <= 0 ||
    !gcStoreId(g)
  )
)

// Agrupar activas por tienda para que se vea claramente "solo válidas en esta tienda".
const activeByStore = computed(() => {
  const groups = new Map()
  for (const gc of activeCards.value) {
    const key = gcStoreId(gc) || 'unknown'
    const name = gc.expand?.store?.name || 'Tienda'
    if (!groups.has(key)) groups.set(key, { storeId: key, storeName: name, items: [] })
    groups.get(key).items.push(gc)
  }
  return Array.from(groups.values())
})

// ── Cargar gift cards ─────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const data = await listMyGiftcards()
    giftcards.value = data.items || []
  } catch (err) {
    console.error('[GiftcardsView] load error:', err.message)
  } finally {
    loading.value = false
  }
}

// ── Canjear código ────────────────────────────────────────────────────────────
async function handleRedeem() {
  const code = redeemInput.value.trim().toUpperCase()
  if (!code) return
  redeemMsg.value  = null
  redeemBusy.value = true
  try {
    await redeemCode(code)
    redeemMsg.value  = { type: 'ok', text: `¡Gift card "${code}" canjeada exitosamente!` }
    redeemInput.value = ''
    await load()
  } catch (err) {
    redeemMsg.value = { type: 'err', text: err.message || 'Error al canjear el código' }
  } finally {
    redeemBusy.value = false
  }
}

// ── Mount ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  await load()
})
</script>

<template>
  <AppNavbar />

  <main class="gc-page">
    <div class="gc-container">

      <!-- Header -->
      <div class="gc-header">
        <h1 class="gc-title">Mis Gift Cards</h1>
        <p class="gc-subtitle">Consulta y canjea tus tarjetas de regalo</p>
      </div>

      <!-- Canjear código -->
      <div class="redeem-box">
        <p class="redeem-box__label">¿Tienes un código?</p>
        <div class="redeem-box__row">
          <input
            v-model="redeemInput"
            class="redeem-box__input"
            type="text"
            placeholder="Ej: GC-2024-ABC123"
            maxlength="32"
            @keydown.enter="handleRedeem"
          />
          <button
            class="redeem-box__btn"
            :disabled="redeemBusy || !redeemInput.trim()"
            @click="handleRedeem"
          >
            <span v-if="redeemBusy">Canjeando…</span>
            <span v-else>Canjear</span>
          </button>
        </div>
        <p
          v-if="redeemMsg"
          class="redeem-box__msg"
          :class="redeemMsg.type === 'ok' ? 'redeem-box__msg--ok' : 'redeem-box__msg--err'"
        >
          {{ redeemMsg.text }}
        </p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="gc-empty">
        <div class="gc-spinner" />
        <p>Cargando gift cards…</p>
      </div>

      <!-- Sin gift cards -->
      <div v-else-if="!giftcards.length" class="gc-empty">
        <svg class="gc-empty__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v13m0-13V6a4 4 0 00-4-4H5.45a1 1 0 00-.9 1.447L6 6m6 2l1.45-2.553A1 1 0 0114.55 2H16a4 4 0 014 4v2M4 10h16M4 10a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2v-6a2 2 0 00-2-2M4 10h16" />
        </svg>
        <p class="gc-empty__text">Aún no tienes gift cards</p>
        <p class="gc-empty__sub">Canjea un código arriba para comenzar</p>
      </div>

      <!-- Gift cards activas (agrupadas por tienda) -->
      <template v-else>
        <div v-if="activeByStore.length">
          <h2 class="gc-section-title">Activas</h2>
          <div v-for="group in activeByStore" :key="group.storeId" class="gc-store-group">
            <p class="gc-store-group__title">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              {{ group.storeName }}
              <span class="gc-store-group__hint">solo válidas en esta tienda</span>
            </p>
            <div class="gc-grid">
              <div v-for="gc in group.items" :key="gc.id" class="gc-card gc-card--active">
                <div class="gc-card__top">
                  <span class="gc-card__code">{{ gc.code }}</span>
                  <span class="badge badge-active">Activa</span>
                </div>
                <div class="gc-card__balance">
                  <span class="gc-card__balance-label">Saldo disponible</span>
                  <span class="gc-card__balance-amount">Bs {{ fmt(gc.balance) }}</span>
                </div>
                <div class="gc-card__meta">
                  <span v-if="gc.expires_at" class="gc-card__exp">
                    Vence: {{ fmtDate(gc.expires_at) }}
                  </span>
                  <span v-else class="gc-card__exp">Sin vencimiento</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Gift cards históricas -->
        <div v-if="otherCards.length" class="gc-history">
          <h2 class="gc-section-title">Historial</h2>
          <div class="gc-table-wrap">
            <table class="gc-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Tienda</th>
                  <th>Canjeada</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="gc in otherCards" :key="gc.id">
                  <td class="gc-table__code">{{ gc.code }}</td>
                  <td>Bs {{ fmt(gc.balance) }}</td>
                  <td><span class="badge" :class="statusClass(gc.status)">{{ statusLabel(gc.status) }}</span></td>
                  <td>{{ gc.expand?.store?.name || '—' }}</td>
                  <td>{{ fmtDate(gc.created) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

    </div>
  </main>

  <AppFooter />
</template>

<style scoped>
.gc-page {
  min-height: calc(100vh - 76px);
  background: linear-gradient(180deg, var(--surface-base) 0%, var(--surface-base) 60%, var(--surface-base) 100%);
  color: var(--text-primary);
  padding: 2.5rem 1rem 4rem;
}

.gc-container {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* Header */
.gc-header { text-align: center; }

.gc-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-primary);
}

.gc-subtitle {
  margin-top: 0.35rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Redeem box */
.redeem-box {
  padding: 1.4rem 1.6rem;
  border: 1px solid var(--vendor-border);
  border-radius: 20px;
  background: linear-gradient(180deg, var(--vendor-soft) 0%, var(--vendor-soft) 100%);
}

.redeem-box__label {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.redeem-box__row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.redeem-box__input {
  flex: 1;
  min-width: 0;
  padding: 0.72rem 1rem;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font-size: 0.92rem;
  font-family: monospace;
  letter-spacing: 0.08em;
  outline: none;
  transition: border-color 0.18s;
}

.redeem-box__input:focus { border-color: var(--vendor)55; }
.redeem-box__input::placeholder { color: #44423e; }

.redeem-box__btn {
  padding: 0.72rem 1.4rem;
  border: 1px solid var(--vendor-border);
  border-radius: 999px;
  background: var(--vendor-soft);
  color: var(--vendor);
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}

.redeem-box__btn:hover:not(:disabled) {
  border-color: var(--vendor)44;
  background: var(--vendor-soft);
  color: var(--text-primary);
}

.redeem-box__btn:disabled { opacity: 0.45; cursor: not-allowed; }

.redeem-box__msg {
  margin-top: 0.75rem;
  font-size: 0.84rem;
  border-radius: 10px;
  padding: 0.5rem 0.8rem;
}

.redeem-box__msg--ok  { background: rgba(138,180,160,0.1); color: var(--vendor); border: 1px solid var(--vendor-border); }
.redeem-box__msg--err { background: rgba(220,80,80,0.08);  color: var(--danger); border: 1px solid var(--danger-soft); }

/* Empty / loading */
.gc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 1rem;
  color: var(--text-muted);
}

.gc-empty__icon { width: 3rem; height: 3rem; color: var(--text-disabled); }
.gc-empty__text { font-size: 1rem; color: var(--text-secondary); }
.gc-empty__sub  { font-size: 0.84rem; }

.gc-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--vendor);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Group por tienda */
.gc-store-group { margin-bottom: 1.5rem; }

.gc-store-group__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin-bottom: 0.6rem;
}

.gc-store-group__hint {
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-left: 0.4rem;
}

/* Section title */
.gc-section-title {
  font-size: 0.72rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-disabled);
  margin-bottom: 0.85rem;
}

/* Cards grid */
.gc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.gc-card {
  padding: 1.4rem;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.gc-card--active {
  border: 1px solid var(--vendor-border);
  background: linear-gradient(135deg, var(--vendor-soft) 0%, var(--vendor-soft) 100%);
  position: relative;
  overflow: hidden;
}

.gc-card--active::before {
  content: '';
  position: absolute;
  top: -30px;
  right: -30px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(138,180,160,0.06) 0%, transparent 70%);
}

.gc-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.gc-card__code {
  font-family: monospace;
  font-size: 0.88rem;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
}

.gc-card__balance {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.gc-card__balance-label {
  font-size: 0.68rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.gc-card__balance-amount {
  font-size: 1.65rem;
  font-weight: 600;
  color: var(--vendor);
}

.gc-card__meta {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.gc-card__store,
.gc-card__exp {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.76rem;
  color: var(--text-muted);
}

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.22rem 0.65rem;
  border-radius: 999px;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge-active    { background: rgba(138,180,160,0.12); color: var(--vendor); border: 1px solid var(--vendor-border); }
.badge-redeemed  { background: rgba(180,160,80,0.10);  color: var(--accent); border: 1px solid var(--accent-soft); }
.badge-expired   { background: rgba(100,100,100,0.10); color: var(--text-muted); border: 1px solid var(--border-default); }
.badge-cancelled { background: rgba(220,80,80,0.08);   color: var(--danger); border: 1px solid var(--danger-soft); }

/* History table */
.gc-history { margin-top: 0.5rem; }

.gc-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
}

.gc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.gc-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-disabled);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-sunken);
}

.gc-table td {
  padding: 0.85rem 1rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--surface-overlay);
}

.gc-table tbody tr:last-child td { border-bottom: none; }
.gc-table tbody tr:hover td { background: var(--surface-raised); }

.gc-table__code {
  font-family: monospace;
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}
</style>
