import PocketBase from 'pocketbase'

const PB_URL = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

export const pb = new PocketBase(PB_URL)

pb.autoCancellation(false)

export function pbFileUrl(collection, recordId, filename, options = {}) {
  if (!filename || !recordId) return ''
  const query = options.thumb ? `?thumb=${encodeURIComponent(options.thumb)}` : ''
  return `${PB_URL}/api/files/${collection}/${recordId}/${filename}${query}`
}
