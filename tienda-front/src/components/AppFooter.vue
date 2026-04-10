<template>
  <footer class="bg-[#080808] border-t border-[#1a1a1a] mt-auto">
    <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-16">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">

        <!-- Brand -->
        <div class="md:col-span-1">
          <span class="font-display text-2xl font-light tracking-[0.2em] text-[#f0ede8] uppercase">
            Tu<span class="text-[#c9a96e]">Venta</span><span class="text-[#f0ede8]">Confiada</span>
          </span>
          <p class="mt-4 text-xs text-[#333330] leading-relaxed">
            El marketplace de ropa donde tiendas y compradores se conectan.
          </p>
        </div>

        <!-- Explorar -->
        <div>
          <p class="text-[9px] tracking-[0.25em] uppercase text-[#c9a96e] mb-5">Explorar</p>
          <ul class="space-y-3">
            <li><RouterLink to="/stores" class="text-xs text-[#444440] hover:text-[#f0ede8] transition-colors tracking-wide">Tiendas</RouterLink></li>
            <li><RouterLink to="/products" class="text-xs text-[#444440] hover:text-[#f0ede8] transition-colors tracking-wide">Productos</RouterLink></li>
            <li><RouterLink to="/auctions" class="text-xs text-[#444440] hover:text-[#f0ede8] transition-colors tracking-wide">Subastas</RouterLink></li>
          </ul>
        </div>

        <!-- Vendedores -->
        <div>
          <p class="text-[9px] tracking-[0.25em] uppercase text-[#c9a96e] mb-5">Vendedores</p>
          <ul class="space-y-3">
            <li><RouterLink to="/vendor" class="text-xs text-[#444440] hover:text-[#f0ede8] transition-colors tracking-wide">Abrir tienda</RouterLink></li>
            <li><RouterLink to="/vendor/products" class="text-xs text-[#444440] hover:text-[#f0ede8] transition-colors tracking-wide">Gestionar productos</RouterLink></li>
            <li><RouterLink to="/vendor/auctions" class="text-xs text-[#444440] hover:text-[#f0ede8] transition-colors tracking-wide">Crear subasta</RouterLink></li>
          </ul>
        </div>

        <!-- Cuenta -->
        <div>
          <p class="text-[9px] tracking-[0.25em] uppercase text-[#c9a96e] mb-5">Mi cuenta</p>
          <ul class="space-y-3">
            <li><RouterLink to="/login" class="text-xs text-[#444440] hover:text-[#f0ede8] transition-colors tracking-wide">Iniciar sesión</RouterLink></li>
            <li><RouterLink to="/account" class="text-xs text-[#444440] hover:text-[#f0ede8] transition-colors tracking-wide">Perfil</RouterLink></li>
            <li><RouterLink to="/orders" class="text-xs text-[#444440] hover:text-[#f0ede8] transition-colors tracking-wide">Pedidos</RouterLink></li>
          </ul>
        </div>

      </div>

      <!-- Bottom bar -->
      <div class="pt-8 border-t border-[#111111] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p class="text-[9px] tracking-[0.2em] uppercase text-[#222220]">
          &copy; {{ new Date().getFullYear() }} TuVentaConfiada. Todos los derechos reservados.
        </p>
        <div class="flex items-center gap-1">
          <div class="w-1.5 h-1.5 rounded-full bg-[#c9a96e] opacity-50" />
          <p class="text-[9px] tracking-[0.15em] uppercase text-[#222220]">Hecho con calidad</p>
        </div>
      </div>
    </div>
  </footer>
</template>
