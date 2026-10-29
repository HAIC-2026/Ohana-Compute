import { useEffect, useState } from 'react'

export function ConnectivityStatus() {
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    const storageError = () =>
      setError('Offline copy could not be saved. Keep the downloaded file.')
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('offline-save-error', storageError)
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        setError('Offline app shell is unavailable. Download a field packet.')
      })
    }
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('offline-save-error', storageError)
    }
  }, [])
  if (!offline && !error) return null
  return (
    <aside className="connectivity-notice" role="status">
      {offline
        ? 'Offline — current conditions cannot be verified. Cached material is not live.'
        : error}{' '}
      <a href="/offline">Open saved planning views</a>
      {error && (
        <button type="button" onClick={() => setError('')}>
          Dismiss
        </button>
      )}
    </aside>
  )
}
