/**
 * Estado global de la tienda seleccionada en el panel de vendedor.
 * Se persiste en sessionStorage para sobrevivir recargas dentro de la sesión.
 */
import { ref, computed } from 'vue'

const STORAGE_KEY = 'tv_vendor_store'

function readFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const _selectedStore = ref(readFromStorage())

export function useVendorStore() {
  const selectedStore = computed(() => _selectedStore.value)
  const selectedStoreId = computed(() => _selectedStore.value?.id || null)
  const hasStore = computed(() => Boolean(_selectedStore.value?.id))

  function setStore(store) {
    _selectedStore.value = store
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } catch { /* ignore */ }
  }

  function clearStore() {
    _selectedStore.value = null
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  return { selectedStore, selectedStoreId, hasStore, setStore, clearStore }
}
