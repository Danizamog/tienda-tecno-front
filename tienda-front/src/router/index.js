import { createRouter, createWebHistory } from 'vue-router'
import { useVendorStore } from '@/composables/useVendorStore'

function getSessionRole() {
  const match = document.cookie
    .split(';')
    .find(c => c.trim().startsWith('tv_auth_session='))
  if (!match) return null
  try {
    const raw = match.split('=').slice(1).join('=')
    const data = JSON.parse(decodeURIComponent(raw))
    return data?.role || null
  } catch { return null }
}

function isLoggedIn() {
  return getSessionRole() !== null
}

const routes = [
  // ── Públicas ────────────────────────────────────────────────
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/AuthCallbackView.vue'),
  },

  // ── Vendor ───────────────────────────────────────────────────
  {
    path: '/vendor/select-store',
    name: 'vendor-select-store',
    component: () => import('@/views/vendor/VendorStoreSelectView.vue'),
    meta: { requiresVendor: true },
  },
  {
    path: '/vendor',
    component: () => import('@/views/vendor/VendorLayout.vue'),
    meta: { requiresVendor: true },
    children: [
      {
        path: '',
        name: 'vendor-dashboard',
        component: () => import('@/views/vendor/VendorDashboardView.vue'),
      },
      {
        path: 'dashboard',
        redirect: { name: 'vendor-dashboard' },
      },
      {
        path: 'products',
        name: 'vendor-products',
        component: () => import('@/views/vendor/VendorProductsView.vue'),
      },
      {
        path: 'auctions',
        name: 'vendor-auctions',
        component: () => import('@/views/vendor/VendorAuctionsView.vue'),
      },
      {
        path: 'orders',
        name: 'vendor-orders',
        component: () => import('@/views/vendor/VendorOrdersView.vue'),
      },
      {
        path: 'payments',
        name: 'vendor-payments',
        component: () => import('@/views/vendor/VendorPaymentsView.vue'),
      },
    ],
  },

  // ── Admin ────────────────────────────────────────────────────
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { requiresAdmin: true },
    children: [
      {
        path: '',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/AdminDashboardView.vue'),
      },
      {
        path: 'stores',
        name: 'admin-stores',
        component: () => import('@/views/admin/stores/AdminStoresView.vue'),
      },
      {
        path: 'stores/:id',
        name: 'admin-store-detail',
        component: () => import('@/views/admin/stores/AdminStoreDetailView.vue'),
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('@/views/admin/users/AdminUsersView.vue'),
      },
      {
        path: 'users/:id',
        name: 'admin-user-detail',
        component: () => import('@/views/admin/users/AdminUserDetailView.vue'),
      },
      {
        path: 'transactions',
        name: 'admin-transactions',
        component: () => import('@/views/admin/transactions/AdminTransactionsView.vue'),
      },
    ],
  },

  // ── 404 → home ───────────────────────────────────────────────
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, saved) {
    if (saved) return saved
    return { top: 0, behavior: 'smooth' }
  },
})

router.beforeEach((to) => {
  if (to.meta.requiresAdmin && getSessionRole() !== 'admin') {
    return '/'
  }
  if (to.meta.requiresVendor && !['vendor', 'admin'].includes(getSessionRole())) {
    return '/'
  }
  // Si es ruta del panel vendor (no el selector), exigir tienda seleccionada
  if (
    to.meta.requiresVendor &&
    to.name !== 'vendor-select-store' &&
    to.path.startsWith('/vendor')
  ) {
    const { hasStore } = useVendorStore()
    if (!hasStore.value) return '/vendor/select-store'
  }
  if (to.meta.guestOnly && isLoggedIn()) {
    return '/'
  }
})

export default router
