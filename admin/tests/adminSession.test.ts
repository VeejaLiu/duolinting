import assert from 'node:assert/strict'
import test from 'node:test'
import { createAdminSessionVerifier } from '../src/lib/adminSession.ts'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const setup = (loadUser: (token: string) => Promise<{ id: number }>) => {
  const state = {
    token: 'cached-token', user: { id: 1 }, checking: false,
    unavailable: '' as '' | 'network' | 'server', expirations: 0,
  }
  const verifier = createAdminSessionVerifier({
    readToken: () => state.token,
    loadUser,
    onChecking: () => { state.checking = true; state.unavailable = '' },
    onVerified: (user) => { state.user = user; state.checking = false },
    onUnavailable: (kind) => { state.unavailable = kind; state.checking = false },
    onExpired: () => { state.token = ''; state.expirations += 1; state.checking = false },
  })
  return { state, verifier }
}

test('network failure keeps the cached session and exposes a recoverable connection failure', async () => {
  const { state, verifier } = setup(async () => { throw new TypeError('Failed to fetch') })
  await verifier.check('cached-token')
  assert.equal(state.token, 'cached-token')
  assert.deepEqual(state.user, { id: 1 })
  assert.equal(state.expirations, 0)
  assert.equal(state.unavailable, 'network')
})

test('server failure keeps the session and can be retried successfully', async () => {
  let unavailable = true
  const { state, verifier } = setup(async () => {
    if (unavailable) throw Object.assign(new Error('Unavailable'), { status: 503 })
    return { id: 2 }
  })
  await verifier.check('cached-token')
  assert.equal(state.token, 'cached-token')
  assert.equal(state.unavailable, 'server')
  unavailable = false
  await verifier.check('cached-token')
  assert.deepEqual(state.user, { id: 2 })
  assert.equal(state.unavailable, '')
  assert.equal(state.checking, false)
})

test('a current-session 401 expires it once, including concurrent unauthorized reports', async () => {
  const { state, verifier } = setup(async () => { throw Object.assign(new Error('Expired'), { status: 401 }) })
  await verifier.check('cached-token')
  verifier.expire('cached-token')
  assert.equal(state.token, '')
  assert.equal(state.expirations, 1)
  assert.equal(state.unavailable, '')
})

test('a late success cannot restore a previous session after a new login', async () => {
  const previous = deferred<{ id: number }>()
  const { state, verifier } = setup(() => previous.promise)
  const pending = verifier.check('cached-token')
  state.token = 'new-token'
  state.user = { id: 9 }
  previous.resolve({ id: 2 })
  await pending
  assert.equal(state.token, 'new-token')
  assert.deepEqual(state.user, { id: 9 })
})

test('a late 401 from an old token cannot expire the new login', async () => {
  const previous = deferred<{ id: number }>()
  const { state, verifier } = setup(() => previous.promise)
  const pending = verifier.check('cached-token')
  state.token = 'new-token'
  state.user = { id: 9 }
  verifier.expire('cached-token')
  previous.reject(Object.assign(new Error('Expired'), { status: 401 }))
  await pending
  assert.equal(state.token, 'new-token')
  assert.deepEqual(state.user, { id: 9 })
  assert.equal(state.expirations, 0)
})

test('a late result from a cancelled or superseded verification cannot change the user', async () => {
  const previous = deferred<{ id: number }>()
  let calls = 0
  const { state, verifier } = setup(() => ++calls === 1 ? previous.promise : Promise.resolve({ id: 3 }))
  const pending = verifier.check('cached-token')
  verifier.cancel()
  await verifier.check('cached-token')
  previous.resolve({ id: 2 })
  await pending
  assert.deepEqual(state.user, { id: 3 })
  assert.equal(state.unavailable, '')
})
