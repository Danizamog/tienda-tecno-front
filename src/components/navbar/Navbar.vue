<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthSession } from '@/composables/useAuthSession'
import { useCartStore } from '@/composables/useCartStore'
import { useWishlistStore } from '@/composables/useWishlistStore'
import { useTheme } from '@/composables/useTheme'
import CartDrawer from '@/components/ui/CartDrawer.vue'

const { isAuthenticated, displayName, avatarInitial, canViewVendor, isAdmin, clearSession, syncSessionRoleFromBackend } = useAuthSession()
const { totalItemCount } = useCartStore()
const { totalWishlistCount, loadWishlist, clearWishlist } = useWishlistStore()
const { theme, toggleTheme } = useTheme()
const showMenu = ref(false)
const showMobileMenu = ref(false)
const showCart = ref(false)
const ROLE_SYNC_COOLDOWN_MS = 60000
let lastRoleSyncAt = 0
let isRoleSyncInFlight = false

const route = useRoute()
const dropdownRef = ref(null)

watch(() => route.path, () => {
	showMenu.value = false
	showMobileMenu.value = false
})

watch(showMobileMenu, (val) => {
	document.body.style.overflow = val ? 'hidden' : ''
})

function handleClickOutside(e) {
	if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
		showMenu.value = false
	}
}

const userLabel = computed(() => displayName.value || 'Mi cuenta')
const userRole = computed(() => {
	if (isAdmin.value) return 'Administrador'
	if (canViewVendor.value) return 'Vendedor'
	return 'Usuario'
})

function handleLogout() {
	showMenu.value = false
	showMobileMenu.value = false
	showCart.value = false
	clearWishlist()
	clearSession()
	window.location.href = '/'
}

async function syncRoleIfNeeded(force = false) {
	if (!isAuthenticated.value) return
	const now = Date.now()
	if (!force && now - lastRoleSyncAt < ROLE_SYNC_COOLDOWN_MS) return
	if (isRoleSyncInFlight) return
	isRoleSyncInFlight = true
	try {
		await syncSessionRoleFromBackend()
		lastRoleSyncAt = Date.now()
	} finally {
		isRoleSyncInFlight = false
	}
}

function handleWindowFocus() { syncRoleIfNeeded() }
function handleVisibilityChange() {
	if (document.visibilityState === 'visible') syncRoleIfNeeded()
}

onMounted(() => {
	if (!isAuthenticated.value) return
	syncRoleIfNeeded(true)
	loadWishlist()
	window.addEventListener('focus', handleWindowFocus)
	document.addEventListener('visibilitychange', handleVisibilityChange)
	document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
	window.removeEventListener('focus', handleWindowFocus)
	document.removeEventListener('visibilitychange', handleVisibilityChange)
	document.removeEventListener('click', handleClickOutside)
	document.body.style.overflow = ''
})
</script>

<template>
	<!--
		flex-col: apila las dos filas verticalmente.
		relative: para el menú móvil (absolute top-full).
		w-full: ocupa todo el ancho del contenedor del header.
	-->
	<nav class="relative flex flex-col w-full">

		<!-- ══════════════════════════════════════════
		     FILA 1 — Logo · Links principales · Usuario
		     h-16 = 64px fija para esta fila
		════════════════════════════════════════════ -->
		<div class="grid grid-cols-[1fr_auto_1fr] items-center h-16">

			<!-- Logo (fijo izquierda) -->
			<RouterLink
				to="/"
				class="shrink-0 font-display text-base sm:text-xl lg:text-2xl font-light tracking-[0.04em] sm:tracking-[0.08em] lg:tracking-[0.15em] text-text-primary uppercase whitespace-nowrap transition-opacity duration-300 hover:opacity-70"
			>
				TuVenta<span class="text-accent">Confiada</span>
			</RouterLink>

			<!-- Links principales — centrados en lg+ -->
			<div class="hidden lg:flex items-center justify-center gap-8">
				<RouterLink to="/"         class="nav-link" active-class="nav-link-active">Inicio</RouterLink>
				<RouterLink to="/stores"   class="nav-link" active-class="nav-link-active">Tiendas</RouterLink>
				<RouterLink to="/products" class="nav-link" active-class="nav-link-active">Productos</RouterLink>
				<RouterLink to="/auctions" class="nav-link" active-class="nav-link-active">Subastas</RouterLink>
			</div>
			<!-- Columna central vacía en mobile (mantiene el grid de 3 cols) -->
			<div class="lg:hidden" aria-hidden="true"></div>

			<!-- Acciones derecha (fijo derecha) -->
			<div class="flex items-center gap-3 justify-end">

				<!-- Hamburguesa — solo < lg -->
				<button
					type="button"
					class="lg:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-sm border border-border-default bg-surface-raised transition-all duration-200 hover:border-[#c9a96e44] hover:bg-surface-overlay"
					:aria-expanded="showMobileMenu"
					aria-label="Menú"
					@click="showMobileMenu = !showMobileMenu"
				>
					<span class="hamburger-line" :class="showMobileMenu ? 'rotate-45 translate-y-1.75' : ''"></span>
					<span class="hamburger-line" :class="showMobileMenu ? 'opacity-0 scale-x-0' : ''"></span>
					<span class="hamburger-line" :class="showMobileMenu ? '-rotate-45 -translate-y-1.75' : ''"></span>
				</button>

				<!-- Toggle de tema (sol/luna) con animación de rotación -->
				<button
					type="button"
					class="theme-toggle"
					:aria-label="theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
					:title="theme === 'dark' ? 'Modo claro' : 'Modo oscuro'"
					@click="toggleTheme"
				>
					<span class="theme-toggle-icons">
						<!-- Luna (visible en dark) -->
						<svg class="icon-moon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
						</svg>
						<!-- Sol (visible en light) -->
						<svg class="icon-sun" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
						</svg>
					</span>
				</button>

				<!-- Carrito -->
				<button
					type="button"
					aria-label="Carrito de compras"
					@click="showCart = true"
					class="cart-btn group relative flex items-center justify-center w-9 h-9 rounded-sm border border-border-default bg-surface-raised transition-all duration-300 hover:border-[#c9a96e55] hover:bg-surface-overlay hover:shadow-[0_0_16px_rgba(201,169,110,0.06)]"
				>
					<svg
						class="w-4 h-4 text-text-muted transition-all duration-300 group-hover:text-accent group-hover:scale-110"
						fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
					</svg>
					<!-- Badge con cantidad real -->
					<Transition name="badge">
						<span
							v-if="totalItemCount > 0"
							class="absolute -top-1.5 -right-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-accent text-accent-on text-[10px] font-bold leading-none flex items-center justify-center"
						>
							{{ totalItemCount > 99 ? '99+' : totalItemCount }}
						</span>
					</Transition>
				</button>

				<!-- Usuario autenticado -->
				<template v-if="isAuthenticated">
					<div class="relative" ref="dropdownRef">
						<button
							type="button"
							class="group flex items-center gap-2.5 px-3 py-2 border border-border-default bg-surface-raised rounded-sm transition-all duration-300 hover:border-[#c9a96e55] hover:bg-surface-overlay hover:shadow-[0_0_16px_rgba(201,169,110,0.06)]"
							@click="showMenu = !showMenu"
						>
							<div class="w-8 h-8 rounded-full border border-[#c9a96e44] bg-surface-overlay flex items-center justify-center text-accent font-display text-sm shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:border-[#c9a96e88] group-hover:shadow-[0_0_10px_rgba(201,169,110,0.2)]">
								{{ avatarInitial }}
							</div>
							<div class="hidden sm:block shrink-0 text-left">
								<p class="text-[13px] font-medium tracking-wide text-text-primary whitespace-nowrap transition-colors duration-300 group-hover:text-white">{{ userLabel }}</p>
								<p class="text-[9px] tracking-[0.22em] uppercase text-[#c9a96e66] whitespace-nowrap transition-colors duration-300 group-hover:text-[#c9a96e99]">{{ userRole }}</p>
							</div>
							<svg
								class="w-3 h-3 text-text-disabled shrink-0 transition-all duration-300 group-hover:text-[#c9a96e55]"
								:class="showMenu ? 'rotate-180' : ''"
								fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>

						<!-- Dropdown de cuenta -->
						<Transition name="dropdown">
							<div
								v-if="showMenu"
								class="absolute right-0 mt-2 w-64 border border-border-subtle bg-surface-sunken shadow-2xl shadow-black/50 z-50 rounded-sm overflow-hidden"
							>
								<div class="px-4 py-3 border-b border-border-subtle flex items-center gap-3">
									<div class="w-8 h-8 rounded-full border border-[#c9a96e33] bg-surface-overlay flex items-center justify-center text-accent font-display text-sm shrink-0">
										{{ avatarInitial }}
									</div>
									<div class="min-w-0">
										<p class="text-[13px] font-medium text-text-primary truncate">{{ userLabel }}</p>
										<p class="text-[9px] tracking-[0.22em] uppercase text-[#c9a96e77]">{{ userRole }}</p>
									</div>
								</div>

								<div class="px-4 py-3 border-b border-border-subtle">
									<p class="dropdown-section-label">Cuenta</p>
									<div class="flex flex-col gap-0.5">
										<RouterLink to="/account"   class="dropdown-link" @click="showMenu = false">Perfil</RouterLink>
										<RouterLink to="/reviews"   class="dropdown-link" @click="showMenu = false">Reviews</RouterLink>
										<RouterLink to="/orders"     class="dropdown-link" @click="showMenu = false">Pedidos</RouterLink>
										<RouterLink to="/bid-orders" class="dropdown-link" @click="showMenu = false">Subastas ganadas</RouterLink>
										<RouterLink to="/wishlist"   class="dropdown-link" @click="showMenu = false">Wishlist</RouterLink>
										<RouterLink to="/giftcards"  class="dropdown-link" @click="showMenu = false">Giftcards</RouterLink>
									</div>
								</div>

								<div v-if="canViewVendor" class="px-4 py-3 border-b border-border-subtle">
									<p class="dropdown-section-label" style="color:#c9a96e66">Vendedor</p>
									<div class="flex flex-col gap-0.5">
										<RouterLink to="/vendor"           class="dropdown-link" @click="showMenu = false">Mi tienda</RouterLink>
										<RouterLink to="/vendor/products"  class="dropdown-link" @click="showMenu = false">Productos</RouterLink>
										<RouterLink to="/vendor/auctions"   class="dropdown-link" @click="showMenu = false">Subastas</RouterLink>
										<RouterLink to="/vendor/orders"     class="dropdown-link" @click="showMenu = false">Órdenes</RouterLink>
										<RouterLink to="/vendor/bid-orders" class="dropdown-link" @click="showMenu = false">Pedidos subasta</RouterLink>
										<RouterLink to="/vendor/payments"   class="dropdown-link" @click="showMenu = false">Pagos QR</RouterLink>
										<RouterLink to="/vendor/giftcards"  class="dropdown-link" @click="showMenu = false">Gift Cards</RouterLink>
									</div>
								</div>

								<div v-if="isAdmin" class="px-4 py-3 border-b border-border-subtle">
									<p class="dropdown-section-label">Admin</p>
									<div class="flex flex-col gap-0.5">
										<RouterLink to="/admin/users"        class="dropdown-link" @click="showMenu = false">Usuarios</RouterLink>
										<RouterLink to="/admin/stores"       class="dropdown-link" @click="showMenu = false">Tiendas</RouterLink>
										<RouterLink to="/admin/transactions" class="dropdown-link" @click="showMenu = false">Transacciones</RouterLink>
									</div>
								</div>

								<button
									type="button"
									class="w-full text-left px-4 py-3 text-[11px] tracking-[0.16em] uppercase text-text-secondary hover:bg-surface-overlay hover:text-accent transition-all duration-200 flex items-center gap-2 group/logout"
									@click="handleLogout"
								>
									<svg class="w-3.5 h-3.5 shrink-0 transition-transform duration-200 group-hover/logout:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
									</svg>
									Cerrar sesión
								</button>
							</div>
						</Transition>
					</div>
				</template>

				<!-- Ingresar -->
				<template v-else>
					<RouterLink
						to="/login"
						class="group flex items-center gap-2.5 px-3 py-2 border border-border-default bg-surface-raised rounded-sm transition-all duration-300 hover:border-[#c9a96e55] hover:bg-surface-overlay hover:shadow-[0_0_16px_rgba(201,169,110,0.06)]"
					>
						<div class="w-8 h-8 rounded-full border border-[#c9a96e33] bg-surface-overlay flex items-center justify-center shrink-0 transition-all duration-300 group-hover:border-[#c9a96e66] group-hover:shadow-[0_0_8px_rgba(201,169,110,0.15)]">
							<svg class="w-3.5 h-3.5 text-[#c9a96e88] transition-colors duration-300 group-hover:text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
							</svg>
						</div>
						<div class="hidden sm:block shrink-0 text-left">
							<p class="text-[13px] font-medium tracking-wide text-text-primary whitespace-nowrap transition-colors duration-300 group-hover:text-white">Ingresar</p>
							<p class="text-[9px] tracking-[0.22em] uppercase text-[#c9a96e66] whitespace-nowrap transition-colors duration-300 group-hover:text-[#c9a96e99]">Mi cuenta</p>
						</div>
					</RouterLink>
				</template>
			</div>
		</div>

		<!-- ══════════════════════════════════════════
		     FILA 2 — Links secundarios (solo auth, lg+)
		     Centrados horizontalmente, separados por un borde superior fino
		════════════════════════════════════════════ -->
		<div
			v-if="isAuthenticated"
			class="hidden lg:flex items-center justify-center gap-9 h-11 border-t border-border-subtle"
		>
			<RouterLink to="/orders"     class="nav-link-sub" active-class="nav-link-active">Pedidos</RouterLink>
			<RouterLink to="/bid-orders" class="nav-link-sub" active-class="nav-link-active">Subastas</RouterLink>
			<RouterLink to="/wishlist" class="nav-link-sub relative" active-class="nav-link-active">
				Wishlist
				<span
					v-if="totalWishlistCount > 0"
					class="absolute -top-1.5 -right-3.5 min-w-4 h-4 px-0.5 rounded-full bg-[#c9a96e22] border border-[#c9a96e44] text-accent text-[9px] font-bold leading-none flex items-center justify-center tabular-nums"
				>{{ totalWishlistCount > 99 ? '99+' : totalWishlistCount }}</span>
			</RouterLink>
			<RouterLink v-if="canViewVendor" to="/vendor/dashboard" class="nav-link-sub" active-class="nav-link-active">Panel vendedor</RouterLink>
			<RouterLink v-if="isAdmin"       to="/admin"            class="nav-link-sub" active-class="nav-link-active">Admin</RouterLink>
		</div>

		<!-- ══════════════════════════════════════════
		     MENÚ MÓVIL — panel fixed con scroll (< lg)
		     fixed top-16: queda justo debajo del header sticky (h-16 = 64px)
		════════════════════════════════════════════ -->
		<Transition name="mobile-menu">
			<div
				v-if="showMobileMenu"
				class="lg:hidden fixed inset-x-0 top-16 bottom-0 z-40 flex flex-col"
			>
				<!-- Overlay oscuro detrás del panel -->
				<div
					class="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
					@click="showMobileMenu = false"
				></div>

				<!-- Panel scrollable -->
				<div class="relative flex flex-col h-full max-h-full bg-surface-base border-t border-border-subtle overflow-y-auto overscroll-contain shadow-xl shadow-black/50">

					<div class="px-5 pt-5 pb-2 flex flex-col gap-0.5">
						<p class="mobile-section-label">Navegación</p>
						<RouterLink to="/"         class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Inicio</RouterLink>
						<RouterLink to="/stores"   class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Tiendas</RouterLink>
						<RouterLink to="/products" class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Productos</RouterLink>
						<RouterLink to="/auctions" class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Subastas</RouterLink>
					</div>

					<template v-if="isAuthenticated">
						<div class="px-5 py-3 border-t border-border-subtle flex flex-col gap-0.5">
							<p class="mobile-section-label">Cuenta</p>
							<RouterLink to="/orders"     class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Pedidos</RouterLink>
							<RouterLink to="/bid-orders" class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Subastas ganadas</RouterLink>
							<RouterLink to="/wishlist"   class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Wishlist</RouterLink>
							<RouterLink to="/giftcards"  class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Giftcards</RouterLink>
							<RouterLink to="/account"    class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Perfil</RouterLink>
						</div>

						<div v-if="canViewVendor" class="px-5 py-3 border-t border-border-subtle flex flex-col gap-0.5">
							<p class="mobile-section-label" style="color:#c9a96e88">Vendedor</p>
							<RouterLink to="/vendor/dashboard" class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Panel vendedor</RouterLink>
							<RouterLink to="/vendor"           class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Mi tienda</RouterLink>
							<RouterLink to="/vendor/products"  class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Productos</RouterLink>
							<RouterLink to="/vendor/orders"    class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Órdenes</RouterLink>
							<RouterLink to="/vendor/bid-orders" class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Pedidos subasta</RouterLink>
							<RouterLink to="/vendor/giftcards"  class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Gift Cards</RouterLink>
						</div>

						<div v-if="isAdmin" class="px-5 py-3 border-t border-border-subtle flex flex-col gap-0.5">
							<p class="mobile-section-label">Admin</p>
							<RouterLink to="/admin"              class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Panel</RouterLink>
							<RouterLink to="/admin/users"        class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Usuarios</RouterLink>
							<RouterLink to="/admin/stores"       class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Tiendas</RouterLink>
							<RouterLink to="/admin/transactions" class="mobile-link" active-class="mobile-link-active" @click="showMobileMenu = false">Transacciones</RouterLink>
						</div>

						<div class="px-5 py-4 mt-auto border-t border-border-subtle">
							<button
								type="button"
								class="flex items-center gap-2.5 text-[11px] tracking-[0.16em] uppercase text-text-muted hover:text-accent transition-colors duration-200 py-1"
								@click="handleLogout"
							>
								<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
								</svg>
								Cerrar sesión
							</button>
						</div>
					</template>

					<template v-else>
						<div class="px-5 py-4 border-t border-border-subtle">
							<RouterLink
								to="/login"
								class="flex items-center gap-2.5 text-[11px] tracking-[0.16em] uppercase text-[#c9a96e88] hover:text-accent transition-colors duration-200 py-1"
								@click="showMobileMenu = false"
							>
								<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
								</svg>
								Ingresar
							</RouterLink>
						</div>
					</template>

				</div>
			</div>
		</Transition>

	</nav>

	<!-- Cart Drawer — Teleport a body para evitar que backdrop-filter del
	     navbar rompa position:fixed y el drawer quede anclado fuera del viewport -->
	<Teleport to="body">
		<CartDrawer :open="showCart" @close="showCart = false" />
	</Teleport>
</template>

<style scoped>
/* ══ Links fila 1 (Inicio / Tiendas / Productos / Subastas) ══ */
.nav-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  font-size: 0.695rem;
  letter-spacing: 0.17em;
  text-transform: uppercase;
  color: var(--text-muted);
  white-space: nowrap;
  transition: color 0.25s ease;
}
.nav-link::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 0;
  width: 0;
  height: 1px;
  background: var(--accent);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.nav-link:hover         { color: var(--text-primary); }
.nav-link:hover::after  { width: 100%; }

/* ══ Links fila 2 (Pedidos / Wishlist / … ) ══ */
.nav-link-sub {
  position: relative;
  display: inline-flex;
  align-items: center;
  font-size: 0.695rem;
  letter-spacing: 0.17em;
  text-transform: uppercase;
  color: var(--text-muted);
  white-space: nowrap;
  transition: color 0.25s ease;
}
.nav-link-sub::after {
  content: '';
  position: absolute;
  bottom: -3px;
  left: 0;
  width: 0;
  height: 1px;
  background: var(--accent);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.nav-link-sub:hover        { color: var(--accent); }
.nav-link-sub:hover::after { width: 100%; }

/* ══ Estado activo (ambas filas) ══ */
.nav-link-active          { color: var(--accent) !important; }
.nav-link-active::after   { width: 100% !important; }

/* ══ Hamburguesa ══ */
.hamburger-line {
  display: block;
  width: 16px;
  height: 1.5px;
  background: var(--text-muted);
  border-radius: 1px;
  transform-origin: center;
  transition: transform 0.22s ease, opacity 0.22s ease, background 0.22s ease;
}
button:hover .hamburger-line { background: var(--accent); }

/* ══ Menú móvil ══ */
.mobile-section-label {
  font-size: 0.625rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-disabled);
  padding: 0.2rem 0.5rem 0.35rem;
}
.mobile-link {
  display: flex;
  align-items: center;
  min-height: 2.75rem;
  font-size: 0.875rem;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  padding: 0.55rem 0.6rem;
  border-radius: 3px;
  transition: color 0.18s ease, background 0.18s ease, padding-left 0.18s ease;
}
.mobile-link:hover  { color: var(--text-primary); background: var(--surface-raised); padding-left: 1rem; }
.mobile-link-active { color: var(--accent) !important; background: var(--surface-raised); }

/* ══ Dropdown ══ */
.dropdown-section-label {
  font-size: 0.625rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-disabled);
  margin-bottom: 0.375rem;
}
.dropdown-link {
  display: block;
  font-size: 0.72rem;
  color: var(--text-secondary);
  padding: 0.28rem 0.4rem;
  border-radius: 2px;
  transition: color 0.18s ease, background 0.18s ease, padding-left 0.18s ease;
}
.dropdown-link:hover { color: var(--accent); background: var(--surface-overlay); padding-left: 0.7rem; }

/* ══ Animación dropdown ══ */
.dropdown-enter-active { transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.4,0,0.2,1); }
.dropdown-leave-active { transition: opacity 0.13s ease, transform 0.13s cubic-bezier(0.4,0,0.2,1); }
.dropdown-enter-from,
.dropdown-leave-to     { opacity: 0; transform: translateY(-5px) scale(0.985); }

/* ══ Animación badge del carrito ══ */
.badge-enter-active { transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s ease; }
.badge-leave-active { transition: transform 0.15s ease, opacity 0.15s ease; }
.badge-enter-from   { transform: scale(0); opacity: 0; }
.badge-leave-to     { transform: scale(0); opacity: 0; }

/* ══ Animación menú móvil ══ */
.mobile-menu-enter-active { transition: opacity 0.22s ease; }
.mobile-menu-leave-active { transition: opacity 0.18s ease; }
.mobile-menu-enter-from,
.mobile-menu-leave-to     { opacity: 0; }

.mobile-menu-enter-active .relative,
.mobile-menu-leave-active .relative {
  transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
}
.mobile-menu-enter-from .relative,
.mobile-menu-leave-to .relative { transform: translateY(-6px); }
</style>
