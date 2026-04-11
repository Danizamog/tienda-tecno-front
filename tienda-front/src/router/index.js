import { createRouter, createWebHistory } from 'vue-router'

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
  if (to.meta.guestOnly && isLoggedIn()) {
    return '/'
  }
})

export default router
