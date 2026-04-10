const express = require('express')
const cors = require('cors')

const app = express()
const PORT = Number(process.env.PORT || 9002)

app.use(cors())
app.use(express.json())

const stores = [
  { id: 's1', name: 'Atelier Norte', slug: 'atelier-norte', location: 'Santiago' },
  { id: 's2', name: 'Luna Closet', slug: 'luna-closet', location: 'Valparaiso' },
]

app.get('/health', (_req, res) => {
  res.json({ service: 'store-service', ok: true, port: PORT })
})

app.get('/', (_req, res) => {
  res.json({ items: stores })
})

app.get('/featured', (_req, res) => {
  res.json({ items: stores })
})

app.listen(PORT, () => {
  console.log(`store-service running on port ${PORT}`)
})
