import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const useProcessGroups = process.platform !== 'win32'
const backendEnvironment = {
  ...process.env,
  PORT: process.env.BACKEND_PORT ?? '8080',
}

// Symptom: the full local stack always exposed a partial AFN profile.
// Root cause: it bypassed the secure Keychain path used by the standalone backend.
// Guard: load the stored key before spawning Go, or warn that ACS will be absent.
if (
  process.platform === 'darwin' &&
  !backendEnvironment.CENSUS_API_KEY?.trim() &&
  !backendEnvironment.CENSUS_API_KEY_FILE?.trim()
) {
  const account = backendEnvironment.USER?.trim()
  const keychainResult = account
    ? spawnSync(
        'security',
        [
          'find-generic-password',
          '-a',
          account,
          '-s',
          'hawaii-resilience-map-census-api',
          '-w',
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
    : null
  const censusAPIKey =
    keychainResult?.status === 0 ? keychainResult.stdout.trim() : ''
  if (censusAPIKey) {
    backendEnvironment.CENSUS_API_KEY = censusAPIKey
    console.log('Loaded the Census API key from macOS Keychain.')
  } else {
    console.warn(
      'Census ACS will be unavailable. Store a key with ./backend/scripts/census-keychain.sh store.',
    )
  }
}

const children = [
  spawn('go', ['run', './cmd/server'], {
    cwd: path.join(root, 'backend'),
    env: backendEnvironment,
    stdio: 'inherit',
    detached: useProcessGroups,
  }),
  spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    detached: useProcessGroups,
  }),
]

let stopping = false

function signalChild(child, signal) {
  if (!child.pid || child.exitCode !== null) return
  if (useProcessGroups) {
    process.kill(-child.pid, signal)
    return
  }
  child.kill(signal)
}

function stop(signal = 'SIGTERM') {
  if (stopping) return
  stopping = true
  for (const child of children) signalChild(child, signal)
  const forceStop = setTimeout(() => {
    for (const child of children) signalChild(child, 'SIGKILL')
  }, 3_000)
  forceStop.unref()
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stop(signal)
  })
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`Unable to start local server: ${error.message}`)
    process.exitCode = 1
    stop()
  })
  child.on('exit', (code, signal) => {
    if (stopping) return
    if (code !== 0) {
      console.error(
        `A local server stopped unexpectedly (${signal ?? `exit ${code}`}).`,
      )
    }
    process.exitCode = code ?? 1
    stop()
  })
}
