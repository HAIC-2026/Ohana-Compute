import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolated loopback-only integration stack; the application still verifies real signed OIDC tokens.
const dir = await mkdtemp(join(tmpdir(), 'afn-operations-e2e-'))
const children = []
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve()
            return
          }
          child.once('exit', resolve)
          child.kill('SIGTERM')
        }),
    ),
  )
  await rm(dir, { recursive: true, force: true })
}
process.on('SIGTERM', () => void stop().then(() => process.exit(0)))
process.on('SIGINT', () => void stop().then(() => process.exit(0)))
const organizations = [
  {
    id: 'county-team',
    name: 'EXERCISE County coordination',
    role: 'county',
    counties: ['003'],
  },
  {
    id: 'state-team',
    name: 'EXERCISE State coordination',
    role: 'state',
    counties: ['001', '003', '007', '009'],
  },
  {
    id: 'transport-one',
    name: 'EXERCISE Transport Alpha',
    role: 'transport',
    counties: ['003'],
  },
  {
    id: 'transport-two',
    name: 'EXERCISE Transport Bravo',
    role: 'transport',
    counties: ['003'],
  },
  {
    id: 'receiving-team',
    name: 'EXERCISE Receiving site',
    role: 'receiving',
    counties: ['003'],
  },
  {
    id: 'other-county',
    name: 'EXERCISE Other County',
    role: 'county',
    counties: ['009'],
  },
]
const members = [
  ['county-staff', 'county-team'],
  ['state-staff', 'state-team'],
  ['transport-staff', 'transport-one'],
  ['backup-transport-staff', 'transport-two'],
  ['receiving-staff', 'receiving-team'],
  ['other-county-staff', 'other-county'],
].map(([subject, organization]) => ({ subject, organization }))
const directory = join(dir, 'directory.json')
await writeFile(directory, JSON.stringify({ organizations, members }), {
  mode: 0o600,
})
try {
  for (const [name, source] of [
    ['issuer', './cmd/staff-oidc-test-server'],
    ['backend', './cmd/server'],
  ]) {
    const result = spawnSync('go', ['build', '-o', join(dir, name), source], {
      cwd: 'backend',
      stdio: 'inherit',
    })
    if (result.status !== 0) throw new Error(`Could not build ${name}`)
  }
  const issuer = spawn(
    join(dir, 'issuer'),
    [
      '-listen',
      '127.0.0.1:9096',
      '-callback',
      'http://127.0.0.1:3196/api/v1/staff/callback',
    ],
    { stdio: 'inherit' },
  )
  children.push(issuer)
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(
        'http://127.0.0.1:9096/.well-known/openid-configuration',
      )
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!ready) throw new Error('Local signed OIDC fixture did not become ready')
  const backend = spawn(join(dir, 'backend'), [], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: '8196',
      LISTEN_ADDRESS: '127.0.0.1:8196',
      STAFF_AUTH_MODE: 'oidc',
      STAFF_OIDC_ISSUER: 'http://127.0.0.1:9096',
      STAFF_OIDC_CLIENT_ID: 'local-staff-client',
      STAFF_OIDC_CLIENT_SECRET: 'local-test-only-not-a-production-secret',
      STAFF_PUBLIC_URL: 'http://127.0.0.1:3196',
      STAFF_DIRECTORY_FILE: directory,
      STAFF_ALLOW_LOOPBACK_HTTP: 'true',
      COLLABORATION_PERSISTENCE: 'sqlite',
      COLLABORATION_SQLITE_PATH: join(dir, 'operations.db'),
      ALLOWED_ORIGINS: 'http://127.0.0.1:3196',
    },
  })
  children.push(backend)
  for (const child of children)
    child.once('exit', (code) => {
      if (!stopping) {
        console.error(`Integration helper exited unexpectedly (${code})`)
        void stop().then(() => process.exit(1))
      }
    })
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Integration startup failed',
  )
  await stop()
  process.exit(1)
}
