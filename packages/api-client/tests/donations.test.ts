import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiClient } from '../src/index.ts'

test('normalizes donation rows from an older API response', async () => {
  const client = createApiClient({
    apiBaseUrl: '',
    fetchImpl: async () => new Response(JSON.stringify({ items: [{
      id: 1, donorName: 'Supporter', isAnonymous: false,
      amount: '10.00', currency: 'CNY', donatedAt: '2026-09-25T00:00:00.000Z',
    }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  })

  const result = await client.getDonations()
  assert.deepEqual(result.items[0].socialLinks, [])
  assert.equal(result.items[0].publicEmail, null)
})
