<script setup>
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ lat: null, lng: null }),
  },
  heightClass: {
    type: String,
    default: 'h-44',
  },
})

const emit = defineEmits(['update:modelValue'])

const mapEl = ref(null)
const loadError = ref('')

let map = null
let marker = null

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function isValidLatLng(lat, lng) {
  return lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function normalizePoint(value) {
  if (!value) return { lat: null, lng: null }
  if (Array.isArray(value)) {
    return {
      lat: toNumberOrNull(value[0]),
      lng: toNumberOrNull(value[1]),
    }
  }
  return {
    lat: toNumberOrNull(value.lat ?? value.latitude),
    lng: toNumberOrNull(value.lng ?? value.lon ?? value.longitude),
  }
}

function setPoint(lat, lng, pan = true) {
  if (!marker || !map || !isValidLatLng(lat, lng)) return
  const point = { lat, lng }
  marker.setLatLng([lat, lng])
  if (pan) map.panTo(point)
  emit('update:modelValue', point)
}

async function initMap() {
  try {
    const initial = normalizePoint(props.modelValue)
    const hasInitial = isValidLatLng(initial.lat, initial.lng)

    map = L.map(mapEl.value, {
      center: hasInitial ? [initial.lat, initial.lng] : [-16.5, -68.15],
      zoom: hasInitial ? 15 : 6,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const markerIcon = L.divIcon({
      className: 'map-picker-marker',
      html: '<div class="map-picker-dot"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })

    marker = L.marker(hasInitial ? [initial.lat, initial.lng] : [-16.5, -68.15], {
      draggable: true,
      icon: markerIcon,
    }).addTo(map)

    if (!hasInitial) marker.setOpacity(0)

    map.on('click', (event) => {
      if (!event?.latlng) return
      marker.setOpacity(1)
      setPoint(event.latlng.lat, event.latlng.lng)
    })

    marker.on('dragstart', () => marker.setOpacity(1))
    marker.on('dragend', (event) => {
      if (!event?.target?.getLatLng) return
      const pos = event.target.getLatLng()
      setPoint(pos.lat, pos.lng, false)
    })
  } catch {
    loadError.value = 'No se pudo cargar el mapa.'
  }
}

watch(
  () => props.modelValue,
  (value) => {
    if (!map || !marker) return
    const point = normalizePoint(value)
    if (!isValidLatLng(point.lat, point.lng)) return
    marker.setLatLng([point.lat, point.lng])
    marker.setOpacity(1)
  },
  { deep: true }
)

onMounted(initMap)

onBeforeUnmount(() => {
  if (map) {
    map.off()
    map.remove()
  }
  map = null
  marker = null
})
</script>

<template>
  <div>
    <div v-if="loadError" class="text-[11px] text-red-400 border border-red-900/40 bg-red-900/20 px-3 py-2">
      {{ loadError }}
    </div>
    <div v-else ref="mapEl" :class="['w-full border border-[#222]', heightClass]" />
    <p class="mt-2 text-[11px] text-[#8f8a82]">Haz click en el mapa para seleccionar el punto exacto de entrega.</p>
  </div>
</template>

<style scoped>
:deep(.map-picker-marker) {
  background: transparent;
  border: 0;
}

:deep(.map-picker-dot) {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #d97706;
  border: 2px solid #111827;
  box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.25);
}
</style>
