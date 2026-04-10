const express = require('express')
const cors = require('cors')

const app = express()
const PORT = Number(process.env.PORT || 9006)

app.use(cors())
app.use(express.json())

const giftcards = [
  {
    id: 'g1',
    code: 'LOOK-2026-10',
    balance: 15000,
    currency: 'CLP',
    status: 'active',
    expires_at: '2026-12-31T23:59:59.000Z',
  },
  {
    id: 'g2',
    code: 'DENIM-25',
    balance: 0,
    currency: 'CLP',
    status: 'redeemed',
    expires_at: '2026-08-31T23:59:59.000Z',
  },
]

const transactions = [
  {
    id: 't1',
    type: 'order_payment',
    status: 'completed',
    amount: 79980,
    currency: 'CLP',
    notes: 'Pago pedido o1',
  },
  {
    id: 't2',
    type: 'giftcard_redeem',
    status: 'completed',
    amount: 15000,
    currency: 'CLP',
    notes: 'Canje giftcard LOOK-2026-10',
  },
  {
    id: 't3',
    type: 'auction_payment',
    status: 'pending',
    amount: 65000,
    currency: 'CLP',
    notes: 'Subasta a1 pendiente',
  },
]

app.get('/health', (_req, res) => {
  res.json({ service: 'finance-service', ok: true, port: PORT })
})

app.get('/giftcards', (_req, res) => {
  res.json({ items: giftcards })
})

app.get('/transactions', (_req, res) => {
  res.json({ items: transactions })
})

app.get('/dashboard/summary', (_req, res) => {
  const completedTransactions = transactions.filter((tx) => tx.status === 'completed')
  const grossTransactions = completedTransactions.reduce((acc, tx) => acc + tx.amount, 0)
  const discountFromGiftcards = completedTransactions
    .filter((tx) => tx.type === 'giftcard_redeem')
    .reduce((acc, tx) => acc + tx.amount, 0)

  const activeGiftcards = giftcards.filter((g) => g.status === 'active').length
  const giftcardOutstanding = giftcards
    .filter((g) => g.status === 'active')
    .reduce((acc, g) => acc + g.balance, 0)

  res.json({
    summary: {
      transactions_count: transactions.length,
      completed_transactions: completedTransactions.length,
      gross_transactions: grossTransactions,
      discounts_total: discountFromGiftcards,
      net_revenue_estimate: grossTransactions - discountFromGiftcards,
      active_giftcards: activeGiftcards,
      giftcards_outstanding_balance: giftcardOutstanding,
    },
  })
})

app.listen(PORT, () => {
  console.log(`finance-service running on port ${PORT}`)
})
