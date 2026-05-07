<script setup>
import { ref, onMounted, computed } from 'vue'
import { useVendorStore } from '@/composables/useVendorStore'
import { useGiftcardApi } from '@/composables/useGiftcardApi'
import { useAuthSession } from '@/composables/useAuthSession'
import Swal from 'sweetalert2'

const { selectedStore } = useVendorStore()
const { listCodes, createCode, updateCode, deleteCode } = useGiftcardApi()
const { session } = useAuthSession()

const codes    = ref([])
const total    = ref(0)
const page     = ref(1)
const perPage  = ref(20)
const loading  = ref(false)
const filterStatus = ref('')

// ── Crear código ──────────────────────────────────────────────────────────────
const showForm    = ref(false)
const formBusy    = ref(false)
const formError   = ref('')
const formSuccess = ref('')
const pageAlert   = ref({ type: '', text: '' })
let pageAlertTimer = null

const form = ref({
  code:            '',
  amount:          '',
  currency:        'BS',
  usage_type:      'single_use',
  max_redemptions: '',
  expires_at:      '',
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))
const canDeleteCodes = computed(() => session.value?.role === 'admin')

function fmt(n) { return Number(n || 0).toLocaleString('es-CL') }

function statusLabel(s) {
  return {
    active:   'Activo',
    reserved: 'Reservado',
    redeemed: 'Canjeado',
    expired:  'Expirado',
    cancelled:'Cancelado',
  }[s] || s
}

function statusClass(s) {
  return {
    active:    'badge-active',
    reserved:  'badge-reserved',
    redeemed:  'badge-redeemed',
    expired:   'badge-expired',
    cancelled: 'badge-cancelled',
  }[s] || 'badge-expired'
}

function fmtDate(d) {
  if (!d) return '—'
  const raw = String(d)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, y, m, day] = match
    const localDate = new Date(Number(y), Number(m) - 1, Number(day))
    return localDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return new Date(raw).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function maxRedemptionsLabel(item) {
  if (item.usage_type === 'single_use') return '1'
  return item.max_redemptions ? String(item.max_redemptions) : 'Sin límite'
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const parts = [
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''),
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''),
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''),
  ]
  form.value.code = parts.join('-')
}

function setPageAlert(type, text) {
  pageAlert.value = { type, text }
  if (pageAlertTimer) clearTimeout(pageAlertTimer)
  pageAlertTimer = setTimeout(() => {
    pageAlert.value = { type: '', text: '' }
  }, 3500)
}

// ── Cargar códigos ────────────────────────────────────────────────────────────
async function load() {
  if (!selectedStore.value?.id) return
  loading.value = true
  try {
    const data = await listCodes({
      storeId: selectedStore.value.id,
      status:  filterStatus.value || undefined,
      page:    page.value,
      perPage: perPage.value,
    })
    codes.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    setPageAlert('error', err.message || 'No se pudieron cargar los códigos.')
  } finally {
    loading.value = false
  }
}

async function changePage(n) {
  page.value = n
  await load()
}

async function applyFilter() {
  page.value = 1
  await load()
}

// ── Crear ─────────────────────────────────────────────────────────────────────
async function handleCreate() {
  formError.value   = ''
  formSuccess.value = ''

  const code = form.value.code.trim().toUpperCase()
  if (!code || code.length < 6) { formError.value = 'El código debe tener al menos 6 caracteres'; return }
  if (!form.value.amount || Number(form.value.amount) <= 0) { formError.value = 'El monto debe ser mayor a 0'; return }

  formBusy.value = true
  try {
    await createCode({
      code,
      amount:          Number(form.value.amount),
      currency:        form.value.currency,
      usage_type:      form.value.usage_type,
      max_redemptions: form.value.max_redemptions ? Number(form.value.max_redemptions) : null,
      expires_at:      form.value.expires_at || null,
      storeId:         selectedStore.value.id,
    })
    formSuccess.value = `Código "${code}" creado exitosamente`
    form.value = { code: '', amount: '', currency: 'BS', usage_type: 'single_use', max_redemptions: '', expires_at: '' }
    await load()
  } catch (err) {
    formError.value = err.message || 'Error al crear el código'
  } finally {
    formBusy.value = false
  }
}

// ── Cambiar estado ────────────────────────────────────────────────────────────
async function toggleStatus(item) {
  const newStatus = item.status === 'active' ? 'cancelled' : 'active'
  try {
    await updateCode(item.id, { status: newStatus })
    await load()
  } catch (err) {
    setPageAlert('error', err.message || 'No se pudo actualizar el estado.')
  }
}

// ── Eliminar ──────────────────────────────────────────────────────────────────
async function handleDelete(item) {
  if (!canDeleteCodes.value) {
    setPageAlert('error', 'Solo admin puede eliminar códigos.')
    return
  }

  const result = await Swal.fire({
    title: '¿Eliminar código?',
    text: `Se eliminará ${item.code} y no se puede deshacer.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: 'var(--danger)',
    cancelButtonColor: 'var(--border-strong)',
    background: 'var(--surface-raised)',
    color: 'var(--text-primary)',
  })

  if (!result.isConfirmed) return

  try {
    await deleteCode(item.id)
    await load()
    await Swal.fire({
      title: 'Eliminado',
      text: `El código ${item.code} fue eliminado correctamente.`,
      icon: 'success',
      confirmButtonText: 'Aceptar',
      confirmButtonColor: '#2b6f58',
      background: 'var(--surface-raised)',
      color: 'var(--text-primary)',
    })
  } catch (err) {
    await Swal.fire({
      title: 'No se pudo eliminar',
      text: err.message || 'Ocurrió un error al eliminar el código.',
      icon: 'error',
      confirmButtonText: 'Entendido',
      confirmButtonColor: 'var(--danger)',
      background: 'var(--surface-raised)',
      color: 'var(--text-primary)',
    })
  }
}

onMounted(load)
</script>

<template>
  <div class="vgc-page">

    <!-- Top bar -->
    <div class="vgc-topbar">
      <div>
        <h1 class="vgc-title">Gift Cards</h1>
        <p class="vgc-sub">Gestiona los códigos de regalo de tu tienda</p>
      </div>
      <button class="btn-primary" @click="showForm = !showForm">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" :d="showForm ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'" />
        </svg>
        {{ showForm ? 'Cancelar' : 'Nuevo código' }}
      </button>
    </div>

    <!-- Formulario de creación -->
    <Transition name="slide-down">
      <div v-if="showForm" class="form-box">
        <h2 class="form-box__title">Crear código de gift card</h2>

        <div class="form-grid">

          <div class="form-field form-field--full">
            <label class="form-label">Código</label>
            <div class="form-code-row">
              <input
                v-model="form.code"
                class="form-input form-input--mono"
                type="text"
                placeholder="GC-XXXX-XXXX"
                maxlength="32"
              />
              <button type="button" class="btn-ghost" @click="generateCode">
                Generar
              </button>
            </div>
          </div>

          <div class="form-field">
            <label class="form-label">Monto (Bs)</label>
            <input v-model="form.amount" class="form-input" type="number" min="1" placeholder="100" />
          </div>

          <div class="form-field">
            <label class="form-label">Tipo de uso</label>
            <select v-model="form.usage_type" class="form-select">
              <option value="single_use">Un solo uso</option>
              <option value="multi_use">Múltiples usos</option>
            </select>
          </div>

          <div v-if="form.usage_type === 'multi_use'" class="form-field">
            <label class="form-label">Máx. canjes</label>
            <input v-model="form.max_redemptions" class="form-input" type="number" min="2" placeholder="Sin límite" />
          </div>

          <div class="form-field">
            <label class="form-label">Vence el (opcional)</label>
            <input v-model="form.expires_at" class="form-input" type="date" />
          </div>

        </div>

        <p v-if="formError"   class="form-msg form-msg--err">{{ formError }}</p>
        <p v-if="formSuccess" class="form-msg form-msg--ok">{{ formSuccess }}</p>

        <div class="form-actions">
          <button class="btn-primary" :disabled="formBusy" @click="handleCreate">
            <span v-if="formBusy">Creando…</span>
            <span v-else>Crear código</span>
          </button>
        </div>
      </div>
    </Transition>

    <!-- Filtros -->
    <div class="filter-bar">
      <select v-model="filterStatus" class="form-select filter-select" @change="applyFilter">
        <option value="">Todos los estados</option>
        <option value="active">Activos</option>
        <option value="redeemed">Canjeados</option>
        <option value="expired">Expirados</option>
        <option value="cancelled">Cancelados</option>
      </select>
      <span class="filter-count">{{ total }} código{{ total !== 1 ? 's' : '' }}</span>
    </div>

    <div v-if="pageAlert.text" class="page-alert" :class="pageAlert.type === 'success' ? 'page-alert--success' : 'page-alert--error'">
      {{ pageAlert.text }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="vgc-empty">
      <div class="vgc-spinner" />
      <p>Cargando códigos…</p>
    </div>

    <!-- Sin códigos -->
    <div v-else-if="!codes.length" class="vgc-empty">
      <svg class="vgc-empty__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v13m0-13V6a4 4 0 00-4-4H5.45a1 1 0 00-.9 1.447L6 6m6 2l1.45-2.553A1 1 0 0114.55 2H16a4 4 0 014 4v2M4 10h16M4 10a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2v-6a2 2 0 00-2-2M4 10h16" />
      </svg>
      <p>No hay códigos aún</p>
    </div>

    <!-- Tabla de códigos -->
    <div v-else class="vgc-table-wrap">
      <table class="vgc-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Monto</th>
            <th>Tipo</th>
            <th>Máx. canjes</th>
            <th>Canjes usados</th>
            <th>Estado</th>
            <th>Vence</th>
            <th>Creado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in codes" :key="item.id">
            <td class="vgc-table__code">{{ item.code }}</td>
            <td>Bs {{ fmt(item.amount) }}</td>
            <td>{{ item.usage_type === 'single_use' ? '1 uso' : 'Multi' }}</td>
            <td>{{ maxRedemptionsLabel(item) }}</td>
            <td>
              <span>{{ item.redeemed_count || 0 }}</span>
            </td>
            <td>
              <span class="badge" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
            </td>
            <td>{{ fmtDate(item.expires_at) }}</td>
            <td>{{ fmtDate(item.created) }}</td>
            <td class="vgc-table__actions">
              <button
                class="action-btn"
                :class="item.status === 'active' ? 'action-btn--cancel' : 'action-btn--activate'"
                :title="item.status === 'active' ? 'Cancelar código' : 'Reactivar código'"
                :disabled="['redeemed','expired'].includes(item.status)"
                @click="toggleStatus(item)"
              >
                {{ item.status === 'active' ? 'Cancelar' : 'Activar' }}
              </button>
              <button
                v-if="canDeleteCodes"
                class="action-btn action-btn--delete"
                title="Eliminar código"
                @click="handleDelete(item)"
              >
                Eliminar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div v-if="totalPages > 1" class="vgc-pagination">
      <button class="page-btn" :disabled="page <= 1" @click="changePage(page - 1)">Anterior</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="page >= totalPages" @click="changePage(page + 1)">Siguiente</button>
    </div>

  </div>
</template>

<style scoped>
.vgc-page {
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  color: var(--text-primary);
}

/* Topbar */
.vgc-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.vgc-title {
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--text-primary);
}

.vgc-sub {
  margin-top: 0.2rem;
  font-size: 0.82rem;
  color: var(--text-muted);
}

/* Buttons */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.62rem 1.1rem;
  border: 1px solid var(--vendor-border);
  border-radius: 999px;
  background: var(--vendor-soft);
  color: var(--vendor);
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.18s;
}

.btn-primary:hover:not(:disabled) {
  border-color: var(--vendor)44;
  background: var(--vendor-soft);
  color: var(--text-primary);
}

.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

.btn-ghost {
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.btn-ghost:hover { border-color: var(--vendor)33; color: var(--text-primary); }

/* Form */
.form-box {
  padding: 1.5rem;
  border: 1px solid var(--vendor-border);
  border-radius: 20px;
  background: linear-gradient(180deg, var(--vendor-soft) 0%, var(--vendor-soft) 100%);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-box__title {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.form-field { display: flex; flex-direction: column; gap: 0.45rem; }
.form-field--full { grid-column: 1 / -1; }

.form-label {
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.form-input,
.form-select {
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.18s;
}

.form-input:focus,
.form-select:focus { border-color: var(--vendor)55; }

.form-input--mono { font-family: monospace; letter-spacing: 0.1em; }
.form-select { cursor: pointer; }

.form-code-row { display: flex; gap: 0.6rem; }
.form-code-row .form-input { flex: 1; min-width: 0; }

.form-msg {
  font-size: 0.84rem;
  border-radius: 10px;
  padding: 0.5rem 0.8rem;
}

.form-msg--ok  { background: rgba(138,180,160,0.1); color: var(--vendor); border: 1px solid var(--vendor-border); }
.form-msg--err { background: rgba(220,80,80,0.08);  color: var(--danger); border: 1px solid var(--danger-soft); }

.form-actions { display: flex; justify-content: flex-end; }

/* Filters */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.filter-select { max-width: 200px; }

.filter-count {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.page-alert {
  padding: 0.62rem 0.85rem;
  border-radius: 10px;
  border: 1px solid;
  font-size: 0.84rem;
}

.page-alert--success {
  background: rgba(138,180,160,0.1);
  border-color: var(--vendor-border);
  color: var(--vendor);
}

.page-alert--error {
  background: rgba(220,80,80,0.08);
  border-color: var(--danger-soft);
  color: var(--danger);
}

/* Empty / loading */
.vgc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 1rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.vgc-empty__icon { width: 2.5rem; height: 2.5rem; color: var(--text-disabled); }

.vgc-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--vendor);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Table */
.vgc-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
}

.vgc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.vgc-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-disabled);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-sunken);
  white-space: nowrap;
}

.vgc-table td {
  padding: 0.85rem 1rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--surface-overlay);
  white-space: nowrap;
}

.vgc-table tbody tr:last-child td { border-bottom: none; }
.vgc-table tbody tr:hover td { background: var(--surface-raised); }

.vgc-table__code {
  font-family: monospace;
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.vgc-table__actions {
  display: flex;
  gap: 0.5rem;
}

.text-muted { color: var(--text-disabled); }

/* Action buttons */
.action-btn {
  padding: 0.32rem 0.7rem;
  border-radius: 8px;
  font-size: 0.72rem;
  border: 1px solid;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.action-btn--cancel   { border-color: var(--danger-soft); background: rgba(220,80,80,0.08);   color: var(--danger); }
.action-btn--activate { border-color: var(--vendor-border); background: rgba(138,180,160,0.08); color: var(--vendor); }
.action-btn--delete   { border-color: #2a1f1f; background: rgba(180,60,60,0.06);   color: #a05050; }

.action-btn--cancel:hover:not(:disabled)   { background: rgba(220,80,80,0.14); }
.action-btn--activate:hover:not(:disabled) { background: rgba(138,180,160,0.14); }
.action-btn--delete:hover:not(:disabled)   { background: rgba(180,60,60,0.12); }

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.22rem 0.65rem;
  border-radius: 999px;
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge-active    { background: rgba(138,180,160,0.12); color: var(--vendor); border: 1px solid var(--vendor-border); }
.badge-reserved  { background: rgba(100,140,255,0.08); color: #6080c0; border: 1px solid #1a2040; }
.badge-redeemed  { background: rgba(180,160,80,0.10);  color: var(--accent); border: 1px solid var(--accent-soft); }
.badge-expired   { background: rgba(100,100,100,0.10); color: var(--text-muted); border: 1px solid var(--border-default); }
.badge-cancelled { background: rgba(220,80,80,0.08);   color: var(--danger); border: 1px solid var(--danger-soft); }

/* Pagination */
.vgc-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.page-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s;
}

.page-btn:hover:not(:disabled) { border-color: var(--vendor)33; color: var(--text-primary); }
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.page-info { font-size: 0.8rem; color: var(--text-muted); }

/* Slide transition */
.slide-down-enter-active,
.slide-down-leave-active { transition: all 0.25s ease; }
.slide-down-enter-from,
.slide-down-leave-to { opacity: 0; transform: translateY(-10px); }
</style>
