const express = require('express')
const cors = require('cors')

const app = express()
const PORT = Number(process.env.PORT || 9004)

app.use(cors())
app.use(express.json())

const auctions = [
  { id: 'a1', title: 'Lote streetwear premium', current_price: 65000, discount_percent: 5, discount_amount: 3000 },
  { id: 'a2', title: 'Coleccion denim limitada', current_price: 82000, discount_percent: 8, discount_amount: 6560 },
]

app.get('/health', (_req, res) => {
  res.json({ service: 'auction-service', ok: true, port: PORT })
})

app.get('/', (_req, res) => {
  res.json({ items: auctions })
})

app.get('/active', (_req, res) => {
  res.json({ items: auctions })
})

app.listen(PORT, () => {
  console.log(`auction-service running on port ${PORT}`)
})
