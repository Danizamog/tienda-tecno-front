import { ref } from 'vue'
import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '/api').replace(/\/$/, '')

// Singleton: mapa storeId → followId (null = no sigue)
const followMap  = ref({})  // { [storeId]: followId | null }
const loading    = ref({})  // { [storeId]: boolean }
const initialized = ref({}) // { [storeId]: boolean }

export function useStoreFollowers() {
  const { session, isAuthenticated } = useAuthSession()

  function authHeaders() {
    const userId = session.value?.userId
    if (!userId) return {}
    return { 'x-user-id': userId }
  }

  function isFollowing(storeId) {
    return initialized.value[storeId] ? followMap.value[storeId] != null : false
  }

  function getFollowId(storeId) {
    return followMap.value[storeId] ?? null
  }

  async function loadStatus(storeId) {
    if (!isAuthenticated.value || !session.value?.userId) return
    if (loading.value[storeId]) return

    loading.value[storeId] = true
    try {
      const res = await fetch(`${API}/followers/status/${encodeURIComponent(storeId)}`, {
        headers: authHeaders(),
      })
      if (!res.ok) return
      const data = await res.json()
      followMap.value[storeId]    = data.following ? data.id : null
      initialized.value[storeId] = true
    } catch (err) {
      console.error('[followers] loadStatus error:', err.message)
    } finally {
      loading.value[storeId] = false
    }
  }

  async function followStore(storeId) {
    if (!isAuthenticated.value) return { ok: false, error: 'not_authenticated' }
    if (isFollowing(storeId))   return { ok: false, error: 'already_following' }

    // Optimistic
    followMap.value[storeId] = 'pending'

    try {
      const res = await fetch(`${API}/followers`, {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ storeId }),
      })

      if (res.status === 409) {
        await loadStatus(storeId)
        return { ok: false, error: 'already_following' }
      }

      if (!res.ok) {
        followMap.value[storeId] = null
        const data = await res.json().catch(() => ({}))
        return { ok: false, error: data.error || 'unknown' }
      }

      const data = await res.json()
      followMap.value[storeId]    = data.id
      initialized.value[storeId] = true
      return { ok: true, id: data.id }
    } catch (err) {
      followMap.value[storeId] = null
      return { ok: false, error: err.message }
    }
  }

  async function unfollowStore(storeId) {
    if (!isAuthenticated.value) return { ok: false, error: 'not_authenticated' }
    if (!isFollowing(storeId))  return { ok: false, error: 'not_following' }

    // Optimistic
    const prev = followMap.value[storeId]
    followMap.value[storeId] = null

    try {
      const res = await fetch(`${API}/followers/by-store/${encodeURIComponent(storeId)}`, {
        method:  'DELETE',
        headers: authHeaders(),
      })

      if (!res.ok && res.status !== 404) {
        followMap.value[storeId] = prev
        return { ok: false, error: 'delete_failed' }
      }

      return { ok: true }
    } catch (err) {
      followMap.value[storeId] = prev
      return { ok: false, error: err.message }
    }
  }

  async function toggleFollow(storeId) {
    if (!isAuthenticated.value) return { ok: false, error: 'not_authenticated' }
    return isFollowing(storeId) ? unfollowStore(storeId) : followStore(storeId)
  }

  function clearFollowers() {
    followMap.value    = {}
    initialized.value  = {}
    loading.value      = {}
  }

  return {
    followMap,
    loading,
    initialized,
    isFollowing,
    getFollowId,
    loadStatus,
    followStore,
    unfollowStore,
    toggleFollow,
    clearFollowers,
  }
}
