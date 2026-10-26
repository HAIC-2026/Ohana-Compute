import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const useProcessGroups = process.platform !== 'win32'
const children = [
  spawn('go', ['run', './cmd/server'], {
    cwd: path.join(root, 'backend'),
    env: { ...process.env, PORT: process.env.BACKEND_PORT ?? '8080' },
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
