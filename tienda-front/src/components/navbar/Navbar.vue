<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthSession } from '@/composables/useAuthSession'

const { isAuthenticated, displayName, avatarInitial, canViewVendor, isAdmin, clearSession, syncSessionRoleFromBackend } = useAuthSession()
const showMenu = ref(false)

const userLabel = computed(() => displayName.value || 'Mi cuenta')
const userRole = computed(() => {
	if (isAdmin.value) return 'Administrador'
	if (canViewVendor.value) return 'Vendedor'
	return 'Usuario'
})

function handleLogout() {
	showMenu.value = false
	clearSession()
	window.location.href = '/'
}

onMounted(() => {
	if (isAuthenticated.value) {
		syncSessionRoleFromBackend()
	}
})
</script>

<template>
	<nav class="flex items-center justify-between w-full min-w-0 gap-2">
		<RouterLink to="/" class="font-display text-base sm:text-xl font-light tracking-[0.08em] sm:tracking-[0.2em] text-[#f0ede8] uppercase min-w-0 max-w-[60vw] sm:max-w-none truncate">
			TuVenta<span class="text-[#c9a96e]">Confiada</span>
		</RouterLink>

		<div class="hidden md:flex items-center gap-8">
			<RouterLink
				to="/"
				class="text-[10px] tracking-[0.18em] uppercase text-[#555550] hover:text-[#f0ede8] transition-colors"
				active-class="!text-[#c9a96e]"
			>
				Inicio
			</RouterLink>
			<RouterLink
				to="/stores"
				class="text-[10px] tracking-[0.18em] uppercase text-[#555550] hover:text-[#f0ede8] transition-colors"
				active-class="!text-[#c9a96e]"
			>
				Tiendas
			</RouterLink>
			<RouterLink
				to="/products"
				class="text-[10px] tracking-[0.18em] uppercase text-[#555550] hover:text-[#f0ede8] transition-colors"
				active-class="!text-[#c9a96e]"
			>
				Productos
			</RouterLink>
			<RouterLink
				to="/auctions"
				class="text-[10px] tracking-[0.18em] uppercase text-[#555550] hover:text-[#f0ede8] transition-colors"
				active-class="!text-[#c9a96e]"
			>
				Subastas
			</RouterLink>
		</div>

		<div class="flex items-center gap-2 sm:gap-4 shrink-0">
			<template v-if="isAuthenticated">
				<div class="relative">
					<button
						type="button"
						class="flex items-center gap-3 px-3 py-2 border border-[#1f1f1f] bg-[#0f0f0f] transition-all duration-300 hover:border-[#c9a96e55] hover:bg-[#151515] hover:shadow-[0_0_0_1px_rgba(201,169,110,0.08)]"
						@click="showMenu = !showMenu"
					>
						<div class="w-10 h-10 rounded-full border border-[#c9a96e33] bg-[#151515] flex items-center justify-center text-[#c9a96e] font-display text-lg shrink-0 transition-transform duration-300 group-hover:scale-105">
							<span>{{ avatarInitial }}</span>
						</div>
						<div class="min-w-0 text-left">
							<p class="text-sm text-[#f0ede8] truncate">{{ userLabel }}</p>
							<p class="text-[10px] tracking-[0.14em] uppercase text-[#555550] truncate">{{ userRole }}</p>
						</div>
					</button>

					<div
						v-if="showMenu"
						class="absolute right-0 mt-2 w-72 border border-[#1f1f1f] bg-[#0f0f0f] shadow-xl shadow-black/30 z-50"
					>
						<div class="px-4 py-3 border-b border-[#1b1b1b]">
							<p class="text-[10px] tracking-[0.16em] uppercase text-[#555550] mb-2">Usuario</p>
							<div class="grid grid-cols-2 gap-x-3 gap-y-1">
								<RouterLink to="/account" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Perfil</RouterLink>
								<RouterLink to="/orders" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Pedidos</RouterLink>
								<RouterLink to="/reviews" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Reviews</RouterLink>
								<RouterLink to="/wishlist" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Wishlist</RouterLink>
								<RouterLink to="/giftcards" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Giftcards</RouterLink>
							</div>
						</div>

						<div v-if="canViewVendor" class="px-4 py-3 border-b border-[#1b1b1b]">
							<p class="text-[10px] tracking-[0.16em] uppercase text-[#555550] mb-2">Vendedor</p>
							<div class="grid grid-cols-2 gap-x-3 gap-y-1">
								<RouterLink to="/vendor/dashboard" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Dashboard</RouterLink>
								<RouterLink to="/vendor" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Mi tienda</RouterLink>
								<RouterLink to="/vendor/products" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Productos</RouterLink>
								<RouterLink to="/vendor/auctions" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Subastas</RouterLink>
								<RouterLink to="/vendor/orders" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Órdenes</RouterLink>
								<RouterLink to="/vendor/payments" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Pagos QR</RouterLink>
							</div>
						</div>

						<div v-if="isAdmin" class="px-4 py-3 border-b border-[#1b1b1b]">
							<p class="text-[10px] tracking-[0.16em] uppercase text-[#555550] mb-2">Admin</p>
							<div class="grid grid-cols-2 gap-x-3 gap-y-1">
								<RouterLink to="/admin" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Panel</RouterLink>
								<RouterLink to="/admin/users" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Usuarios</RouterLink>
								<RouterLink to="/admin/stores" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Tiendas</RouterLink>
								<RouterLink to="/admin/transactions" class="text-xs text-[#d8d5cf] hover:text-[#c9a96e] transition-colors py-1" @click="showMenu = false">Transacciones</RouterLink>
							</div>
						</div>

						<button
							type="button"
							class="w-full text-left px-4 py-3 text-xs tracking-[0.14em] uppercase text-[#f0ede8] hover:bg-[#151515] hover:text-[#c9a96e] transition-colors"
							@click="handleLogout"
						>
							Cerrar sesión
						</button>
					</div>
				</div>
			</template>
			<template v-else>
				<RouterLink to="/login" class="btn-outline py-2! px-4!">
					Ingresar
				</RouterLink>
			</template>
		</div>
	</nav>
</template>
