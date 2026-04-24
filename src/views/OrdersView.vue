<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
import AppFooter from '@/components/AppFooter.vue'
import { useAuthSession } from '@/composables/useAuthSession'
import { useReviewsApi } from '@/composables/useReviewsApi'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

const { session, isAuthenticated } = useAuthSession()
const { createReview, checkExistingReview } = useReviewsApi()

const orders      = ref([])
const loading     = ref(true)
const error       = ref('')
const filterStatus = ref('')
const page        = ref(1)
const totalPages  = ref(1)
const totalItems  = ref(0)

const STATUS_LABELS = {
  pending:          { label: 'Pendiente',          cls: 'text-amber-400   border-amber-800/40  bg-amber-900/20'  },
  payment_uploaded: { label: 'Pago enviado',        cls: 'text-blue-400    border-blue-800/40   bg-blue-900/20'   },
  approved:         { label: 'Aprobado',            cls: 'text-emerald-400 border-emerald-800/40 bg-emerald-900/20'},
  shipped:          { label: 'Enviado',             cls: 'text-purple-400  border-purple-800/40 bg-purple-900/20' },
  delivered:        { label: 'Entregado',           cls: 'text-teal-400    border-teal-800/40   bg-teal-900/20'   },
  rejected:         { label: 'Rechazado',           cls: 'text-red-400     border-red-800/40    bg-red-900/20'    },
  cancelled:        { label: 'Cancelado',           cls: 'text-[#555]      border-[#222]        bg-[#111]'        },
}

function statusInfo(status) {
  return STATUS_LABELS[status] || { label: status, cls: 'text-[#888] border-[#222] bg-[#111]' }
}

function fmt(n) { return Number(n || 0).toLocaleString('es-CL') }
function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function productImgUrl(productId, filename) {
  if (!filename || !productId) return ''
  return `${PB}/api/files/products/${productId}/${filename}?thumb=100x100`
}

async function fetchOrders() {
  if (!isAuthenticated.value) return
  loading.value = true
  error.value   = ''
  try {
    const params = new URLSearchParams({ page: page.value, perPage: 10 })
    if (filterStatus.value) params.set('status', filterStatus.value)

    const res = await fetch(`${API}/orders/buyer/my?${params}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id':   session.value?.userId || '',
        'X-User-Role': session.value?.role   || 'user',
      },
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) { error.value = data?.error || `Error ${res.status}`; return }

    orders.value     = data?.items || []
    totalPages.value  = data?.totalPages || 1
    totalItems.value  = data?.totalItems || 0
  } catch {
    error.value = 'No se pudo conectar al servidor.'
  } finally {
    loading.value = false
  }
}

function applyFilter(status) {
  filterStatus.value = status
  page.value = 1
  fetchOrders()
}

function changePage(p) {
  page.value = p
  fetchOrders()
}

// ── Modal de reseña ───────────────────────────────────────────────────────────
const reviewModal = ref({
  open:      false,
  orderId:   '',
  productId: '',
  storeId:   '',
  productName: '',
  storeName:   '',
  // form
  rating:    0,
  title:     '',
  comment:   '',
  // estado
  loading:   false,
  error:     '',
  success:   false,
})

// Mapa de reseñas ya existentes: `${orderId}:${productId}` → true/false
const reviewedMap = ref({})

async function checkReviewedItems(orders) {
  for (const order of orders) {
    if (order.status !== 'delivered') continue
    for (const item of (order.items || [])) {
      const productId = item.product || item.expand?.product?.id
      if (!productId) continue
      const key = `${order.id}:${productId}`
      if (reviewedMap.value[key] !== undefined) continue
      try {
        const result = await checkExistingReview({ productId })
        reviewedMap.value[key] = result.hasReview
      } catch {
        reviewedMap.value[key] = false
      }
    }
  }
}

function isReviewed(orderId, productId) {
  return reviewedMap.value[`${orderId}:${productId}`] === true
}

function openReviewModal(order, item) {
  const productId = item.product || item.expand?.product?.id
  const storeId   = order.store  || order.expand?.store?.id
  reviewModal.value = {
    open:        true,
    orderId:     order.id,
    productId,
    storeId,
    productName: item.expand?.product?.name || 'Producto',
    storeName:   order.expand?.store?.name  || '',
    rating:      0,
    title:       '',
    comment:     '',
    loading:     false,
    error:       '',
    success:     false,
  }
}

function closeReviewModal() {
  reviewModal.value.open = false
}

function setRating(r) {
  reviewModal.value.rating = r
}

async function submitReview() {
  const m = reviewModal.value
  if (!m.rating) { m.error = 'Selecciona una puntuación'; return }

  m.loading = true
  m.error   = ''
  try {
    const result = await createReview({
      productId: m.productId,
      storeId:   m.storeId,
      orderId:   m.orderId,
      rating:    m.rating,
      title:     m.title,
      comment:   m.comment,
    })

    if (!result.ok) {
      m.error = result.message || result.error || 'Error al enviar reseña'
      return
    }

    m.success = true
    // Marcar como reseñado en el mapa local
    reviewedMap.value[`${m.orderId}:${m.productId}`] = true
    setTimeout(closeReviewModal, 1800)
  } catch (e) {
    m.error = e.message || 'Error al enviar reseña'
  } finally {
    m.loading = false
  }
}

onMounted(async () => {
  await fetchOrders()
  checkReviewedItems(orders.value)
})
</script>

<template>
  <AppNavbar />

  <main class="orders-shell text-[#f0ede8]">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-10">

      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="font-display text-3xl font-light">Mis pedidos</h1>
          <p class="text-[11px] tracking-[0.15em] uppercase text-[#555550] mt-1">Historial de compras</p>
        </div>
        <RouterLink
          to="/products"
          class="h-9 px-4 text-[10px] tracking-[0.15em] uppercase border border-[#1e1e1e] text-[#555] hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors flex items-center"
        >
          Seguir comprando
        </RouterLink>
      </div>

      <!-- Sin autenticar -->
      <div v-if="!isAuthenticated" class="flex flex-col items-center py-24 gap-4">
        <svg class="w-12 h-12 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p class="text-[#555550] text-sm">Inicia sesión para ver tus pedidos</p>
        <RouterLink to="/login" class="h-9 px-5 text-[10px] tracking-[0.15em] uppercase bg-[#c9a96e15] border border-[#c9a96e33] text-[#c9a96e] hover:bg-[#c9a96e25] transition-colors flex items-center">
          Ingresar
        </RouterLink>
      </div>

      <template v-else>
        <!-- Filtros de estado -->
        <div class="flex flex-wrap gap-2 mb-6">
          <button
            @click="applyFilter('')"
            :class="['px-3 h-7 text-[10px] tracking-[0.15em] uppercase border transition-colors', filterStatus === '' ? 'border-[#c9a96e] text-[#c9a96e] bg-[#c9a96e10]' : 'border-[#1e1e1e] text-[#555] hover:border-[#333] hover:text-[#888]']"
          >
            Todos
          </button>
          <button
            v-for="(info, key) in STATUS_LABELS"
            :key="key"
            @click="applyFilter(key)"
            :class="['px-3 h-7 text-[10px] tracking-[0.15em] uppercase border transition-colors', filterStatus === key ? 'border-[#c9a96e] text-[#c9a96e] bg-[#c9a96e10]' : 'border-[#1e1e1e] text-[#555] hover:border-[#333] hover:text-[#888]']"
          >
            {{ info.label }}
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="space-y-4">
          <div v-for="i in 3" :key="i" class="border border-[#1a1a1a] bg-[#0c0c0c] p-5">
            <div class="skeleton h-3 w-32 mb-3" />
            <div class="skeleton h-3 w-48 mb-2" />
            <div class="skeleton h-3 w-24" />
          </div>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="flex flex-col items-center py-16 gap-3">
          <p class="text-[#555550] text-sm">{{ error }}</p>
          <button @click="fetchOrders" class="h-8 px-4 text-[10px] tracking-[0.15em] uppercase border border-[#1e1e1e] text-[#555] hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors">
            Reintentar
          </button>
        </div>

        <!-- Sin resultados -->
        <div v-else-if="orders.length === 0" class="flex flex-col items-center py-20 gap-4">
          <svg class="w-14 h-14 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p class="font-display text-lg font-light text-[#2a2520]">Sin pedidos</p>
          <p class="text-[10px] tracking-widest uppercase text-[#252520]">
            {{ filterStatus ? 'Sin pedidos con ese estado' : 'Aún no has realizado ningún pedido' }}
          </p>
          <RouterLink to="/stores" class="mt-2 h-9 px-5 text-[10px] tracking-[0.15em] uppercase border border-[#1e1e1e] text-[#555] hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors flex items-center">
            Explorar tiendas
          </RouterLink>
        </div>

        <!-- Lista de pedidos -->
        <div v-else class="flex flex-col gap-4">
          <div
            v-for="order in orders"
            :key="order.id"
            class="border border-[#1a1a1a] bg-[#0c0c0c] overflow-hidden"
          >
            <!-- Header del pedido -->
            <div class="flex items-center justify-between flex-wrap gap-2 px-5 py-3.5 border-b border-[#121212]">
              <div class="flex items-center gap-3">
                <span class="text-[10px] font-mono text-[#555550]">#{{ order.id?.slice(0, 8) }}</span>
                <span :class="['inline-flex items-center px-2 py-0.5 text-[9px] tracking-[0.12em] uppercase border font-medium', statusInfo(order.status).cls]">
                  {{ statusInfo(order.status).label }}
                </span>
              </div>
              <div class="flex items-center gap-4">
                <span class="text-[10px] text-[#3a3835]">{{ fmtDate(order.created) }}</span>
                <span class="text-sm font-medium text-[#c9a96e] tabular-nums">${{ fmt(order.total) }}</span>
              </div>
            </div>

            <!-- Tienda -->
            <div class="px-5 py-3 border-b border-[#0f0f0f] flex items-center gap-2">
              <svg class="w-3 h-3 text-[#333330]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="text-[11px] text-[#888880]">
                {{ order.expand?.store?.name || order.store }}
              </span>
            </div>

            <!-- Items -->
            <div v-if="order.items?.length" class="px-5 py-3 flex flex-col gap-3">
              <div
                v-for="item in order.items"
                :key="item.id"
                class="flex items-center gap-3"
              >
                <div class="w-10 h-10 shrink-0 bg-[#0f0f0f] border border-[#1a1a1a] overflow-hidden">
                  <img
                    v-if="item.expand?.product?.images?.length || item.expand?.product?.images"
                    :src="productImgUrl(item.product, Array.isArray(item.expand?.product?.images) ? item.expand.product.images[0] : item.expand.product.images)"
                    :alt="item.expand?.product?.name"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <svg class="w-4 h-4 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[12px] text-[#c8c4be] truncate">{{ item.expand?.product?.name || 'Producto' }}</p>
                  <p class="text-[10px] text-[#555550]">× {{ item.quantity }} · ${{ fmt(item.unit_price) }} c/u</p>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="text-[12px] text-[#e8e5e0] tabular-nums">${{ fmt(item.total) }}</span>
                  <!-- Botón de reseña solo para pedidos entregados -->
                  <template v-if="order.status === 'delivered'">
                    <span
                      v-if="isReviewed(order.id, item.product || item.expand?.product?.id)"
                      class="inline-flex items-center gap-1 px-2 h-6 text-[9px] tracking-[0.1em] uppercase text-teal-500/60 border border-teal-800/20 bg-teal-900/10"
                    >
                      <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      Reseñado
                    </span>
                    <button
                      v-else
                      @click="openReviewModal(order, item)"
                      class="inline-flex items-center gap-1 px-2 h-6 text-[9px] tracking-[0.1em] uppercase border border-[#c9a96e33] text-[#c9a96e] hover:bg-[#c9a96e15] transition-colors"
                    >
                      <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      Reseñar
                    </button>
                  </template>
                </div>
              </div>
            </div>

            <!-- Footer del pedido -->
            <div class="px-5 py-3 bg-[#090909] border-t border-[#0f0f0f] flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-4 text-[10px] text-[#3a3835]">
                <span v-if="order.payment_method">Pago: {{ order.payment_method }}</span>
                <span v-if="order.notes" class="truncate max-w-[200px]">Nota: {{ order.notes }}</span>
              </div>
              <div class="flex items-center gap-3 text-[10px] text-[#555550]">
                <span>Subtotal: ${{ fmt(order.subtotal) }}</span>
                <span v-if="order.shipping_cost > 0">Envío: ${{ fmt(order.shipping_cost) }}</span>
                <span v-if="order.discount_total > 0" class="text-emerald-500">Desc: -${{ fmt(order.discount_total) }}</span>
              </div>
            </div>

            <!-- Nota de aprobación -->
            <div v-if="order.approval_note" class="px-5 py-2.5 bg-[#0f0f0a] border-t border-[#1a1a0a]">
              <p class="text-[10px] text-[#888850]">
                <span class="tracking-wide uppercase text-[#555530]">Nota del vendedor:</span>
                {{ order.approval_note }}
              </p>
            </div>
          </div>

          <!-- Paginación -->
          <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-4">
            <button
              v-for="p in totalPages"
              :key="p"
              @click="changePage(p)"
              :class="['w-8 h-8 text-[11px] border transition-colors', p === page ? 'border-[#c9a96e] text-[#c9a96e] bg-[#c9a96e10]' : 'border-[#1e1e1e] text-[#555] hover:border-[#333]']"
            >
              {{ p }}
            </button>
          </div>
        </div>
      </template>

    </div>
  </main>

  <!-- ── Modal de reseña ─────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="reviewModal.open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="closeReviewModal"
      >
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="closeReviewModal" />

        <div class="relative w-full max-w-md bg-[#0d0d0d] border border-[#1e1e1e] overflow-hidden">
          <!-- Header modal -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-[#141414]">
            <div>
              <h2 class="text-sm font-medium text-[#d8d4ce]">Escribir reseña</h2>
              <p class="text-[10px] text-[#555550] mt-0.5 truncate max-w-[280px]">{{ reviewModal.productName }}</p>
            </div>
            <button @click="closeReviewModal" class="text-[#333330] hover:text-[#c9a96e] transition-colors p-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <!-- Éxito -->
          <div v-if="reviewModal.success" class="px-6 py-12 flex flex-col items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-teal-900/30 border border-teal-700/40 flex items-center justify-center">
              <svg class="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <p class="text-sm text-[#d8d4ce] font-medium">¡Reseña enviada!</p>
            <p class="text-[11px] text-[#555550]">Gracias por tu opinión</p>
          </div>

          <!-- Formulario -->
          <div v-else class="px-6 py-5 flex flex-col gap-5">
            <!-- Estrellas -->
            <div>
              <p class="text-[10px] tracking-[0.15em] uppercase text-[#555550] mb-2">Puntuación</p>
              <div class="flex items-center gap-1">
                <button
                  v-for="star in 5"
                  :key="star"
                  @click="setRating(star)"
                  class="transition-transform hover:scale-110"
                >
                  <svg
                    class="w-7 h-7 transition-colors"
                    :class="star <= reviewModal.rating ? 'text-[#c9a96e]' : 'text-[#2a2520]'"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                  </svg>
                </button>
                <span class="ml-2 text-[11px] text-[#555550]">
                  {{ ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'][reviewModal.rating] || '' }}
                </span>
              </div>
            </div>

            <!-- Título -->
            <div>
              <label class="block text-[10px] tracking-[0.15em] uppercase text-[#555550] mb-1.5">
                Título <span class="text-[#333330]">(opcional)</span>
              </label>
              <input
                v-model="reviewModal.title"
                type="text"
                maxlength="100"
                placeholder="Resume tu experiencia"
                class="w-full h-9 px-3 bg-[#0a0a0a] border border-[#1e1e1e] text-[13px] text-[#c8c4be] placeholder-[#2a2520] focus:outline-none focus:border-[#c9a96e44] transition-colors"
              />
            </div>

            <!-- Comentario -->
            <div>
              <label class="block text-[10px] tracking-[0.15em] uppercase text-[#555550] mb-1.5">
                Comentario <span class="text-[#333330]">(opcional)</span>
              </label>
              <textarea
                v-model="reviewModal.comment"
                rows="4"
                placeholder="Comparte los detalles de tu experiencia con este producto..."
                class="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#1e1e1e] text-[13px] text-[#c8c4be] placeholder-[#2a2520] focus:outline-none focus:border-[#c9a96e44] transition-colors resize-none"
              />
            </div>

            <!-- Error -->
            <p v-if="reviewModal.error" class="text-[11px] text-red-400">{{ reviewModal.error }}</p>

            <!-- Acciones -->
            <div class="flex gap-3 pt-1">
              <button
                @click="closeReviewModal"
                class="flex-1 h-10 text-[10px] tracking-[0.15em] uppercase border border-[#1e1e1e] text-[#555] hover:border-[#333] hover:text-[#888] transition-colors"
              >
                Cancelar
              </button>
              <button
                @click="submitReview"
                :disabled="reviewModal.loading || !reviewModal.rating"
                class="flex-1 h-10 text-[10px] tracking-[0.15em] uppercase bg-[#c9a96e15] border border-[#c9a96e44] text-[#c9a96e] hover:bg-[#c9a96e25] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {{ reviewModal.loading ? 'Enviando…' : 'Publicar reseña' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <AppFooter />
</template>

<style scoped>
.orders-shell {
  background: linear-gradient(180deg, #090909 0%, #0a0a0a 100%);
  flex: 1;
  width: 100%;
  overflow-x: hidden;
  min-height: calc(100vh - 64px);
}
.skeleton {
  background: linear-gradient(90deg, #131313 25%, #1a1a1a 50%, #131313 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 2px;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.modal-enter-active,
.modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from,
.modal-leave-to    { opacity: 0; }
</style>
