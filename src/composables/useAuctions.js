import { ref } from 'vue'
import { pb, pbFileUrl } from '@/services/pocketbase'
import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')

export function useAuctions() {
  const { session } = useAuthSession()

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-User-Id':   session.value?.userId || '',
      'X-User-Role': session.value?.role   || '',
    }
  }

  async function handleResponse(res) {
    if (res.status === 204) return null
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const err = new Error(data?.error || data?.message || `Error ${res.status}`)
      err.status  = res.status
      err.details = data
      throw err
    }
    return data
  }

  async function listActive({ page = 1, perPage = 12, sort = 'end_date', search = '' } = {}) {
    const params = new URLSearchParams({ status: 'active', page, perPage, sort })
    if (search) params.set('search', search)
    const res = await fetch(`${API}/auctions?${params}`)
    return handleResponse(res)
  }

  async function getAuction(id) {
    const res = await fetch(`${API}/auctions/${id}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function listBids(auctionId, { page = 1, perPage = 50 } = {}) {
    const params = new URLSearchParams({ page, perPage })
    const res = await fetch(`${API}/auctions/${auctionId}/bids?${params}`)
    return handleResponse(res)
  }

  async function placeBid(auctionId, { amount, isAutoBid = false, autoBidMax = 0 } = {}) {
    if (!session.value?.userId) throw new Error('Debes iniciar sesión para pujar')
    const res = await fetch(`${API}/auctions/${auctionId}/bids`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({
        amount,
        is_auto_bid:  isAutoBid,
        auto_bid_max: autoBidMax,
      }),
    })
    return handleResponse(res)
  }

  async function buyNow(auctionId) {
    if (!session.value?.userId) throw new Error('Debes iniciar sesión para comprar')
    const res = await fetch(`${API}/auctions/${auctionId}/buy-now`, {
      method:  'POST',
      headers: authHeaders(),
    })
    return handleResponse(res)
  }

  function auctionImageUrl(auction, thumb = '600x400') {
    const imgs = Array.isArray(auction?.images) ? auction.images : (auction?.images ? [auction.images] : [])
    const img  = imgs[0]
    if (!img || !auction?.id) return null
    return pbFileUrl('auctions', auction.id, img, { thumb })
  }

  function allAuctionImages(auction) {
    const imgs = Array.isArray(auction?.images) ? auction.images : (auction?.images ? [auction.images] : [])
    return imgs.map((img) => pbFileUrl('auctions', auction.id, img))
  }

  function storeLogoUrl(store) {
    if (!store?.logo) return null
    return pbFileUrl('stores', store.id, store.logo)
  }

  function minIncrement(currentPrice) {
    const price = Number(currentPrice || 0)
    if (price < 100)    return 1
    if (price < 1000)   return 10
    if (price < 10000)  return 50
    return 100
  }

  // ── Realtime ────────────────────────────────────────────────────────────────

  function subscribeToAuction(auctionId, callback) {
    const topic = auctionId || '*'
    pb.collection('auctions').subscribe(topic, callback).catch(() => {})
    return () => {
      pb.collection('auctions').unsubscribe(topic).catch(() => {})
    }
  }

  function subscribeToBids(auctionId, callback) {
    const opts = auctionId ? { filter: `auction="${auctionId}"` } : {}
    pb.collection('auction_bids').subscribe('*', callback, opts).catch(() => {})
    return () => {
      pb.collection('auction_bids').unsubscribe('*').catch(() => {})
    }
  }

  return {
    listActive,
    getAuction,
    listBids,
    placeBid,
    buyNow,
    auctionImageUrl,
    allAuctionImages,
    storeLogoUrl,
    minIncrement,
    subscribeToAuction,
    subscribeToBids,
  }
}

const auctionRealtimeState = ref({ auctions: new Map() })
export { auctionRealtimeState }
