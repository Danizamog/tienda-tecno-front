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
    component: () => import('@/views/public/home/HomeView.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/public/auth/LoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/public/auth/AuthCallbackView.vue'),
  },

  {
    path: '/stores',
    name: 'stores',
    component: () => import('@/views/public/stores/StoresView.vue'),
  },
  {
    path: '/products',
    name: 'products',
    component: () => import('@/views/public/products/ProductsView.vue'),
  },
  {
    path: '/auctions',
    name: 'auctions',
    component: () => import('@/views/public/products/AuctionsView.vue'),
  },
  {
    path: '/auctions/:id',
    name: 'auction-detail',
    component: () => import('@/views/public/products/AuctionDetailView.vue'),
  },
  {
    path: '/stores/:slug',
    name: 'store-products',
    component: () => import('@/views/public/stores/StoreProductsView.vue'),
  },
  {
    path: '/products/:id',
    name: 'product-detail',
    component: () => import('@/views/public/products/ProductDetailView.vue'),
  },
  {
    path: '/compare',
    name: 'compare',
    component: () => import('@/views/public/products/CompareView.vue'),
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('@/views/user/OrdersView.vue'),
  },
  {
    path: '/bid-orders',
    name: 'bid-orders',
    component: () => import('@/views/user/BidOrdersView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('@/views/user/AccountView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/wishlist',
    name: 'wishlist',
    component: () => import('@/views/user/WishlistView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/giftcards',
    name: 'giftcards',
    component: () => import('@/views/user/GiftcardsView.vue'),
    meta: { requiresAuth: true },
  },

  // ── Vendor ───────────────────────────────────────────────────
  {
    path: '/vendor/select-store',
    name: 'vendor-select-store',
    component: () => import('@/views/vendor/dashboard/VendorStoreSelectView.vue'),
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
        component: () => import('@/views/vendor/dashboard/VendorDashboardView.vue'),
      },
      {
        path: 'dashboard',
        redirect: { name: 'vendor-dashboard' },
      },
      {
        path: 'products',
        name: 'vendor-products',
        component: () => import('@/views/vendor/products/VendorProductsView.vue'),
      },
      {
        path: 'auctions',
        name: 'vendor-auctions',
        component: () => import('@/views/vendor/auctions/VendorAuctionsView.vue'),
      },
      {
        path: 'orders',
        name: 'vendor-orders',
        component: () => import('@/views/vendor/orders/VendorOrdersView.vue'),
      },
      {
        path: 'payments',
        name: 'vendor-payments',
        component: () => import('@/views/vendor/payments/VendorPaymentsView.vue'),
      },
      {
        path: 'transactions',
        name: 'vendor-transactions',
        component: () => import('@/views/vendor/transactions/VendorTransactionsView.vue'),
      },
      {
        path: 'giftcards',
        name: 'vendor-giftcards',
        component: () => import('@/views/vendor/giftcards/VendorGiftcardsView.vue'),
      },
      {
        path: 'bid-orders',
        name: 'vendor-bid-orders',
        component: () => import('@/views/vendor/orders/VendorBidOrdersView.vue'),
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
        component: () => import('@/views/admin/dashboard/AdminDashboardView.vue'),
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
    // En un refresh, el browser conserva el history.state con la posición
    // anterior y 'saved' llega con ese valor — ignorarlo para ir siempre
    // al inicio. Solo restaurar posición en navegación atrás/adelante del
    // historial (type !== 'reload').
    const isReload = performance?.getEntriesByType?.('navigation')?.[0]?.type === 'reload'
    if (saved && !isReload) return saved
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isLoggedIn()) {
    return '/login'
  }
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
