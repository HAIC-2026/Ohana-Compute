import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { OperationsLayout } from '../components/OperationsLayout'
import { backendGet } from '../lib/backend-api'
import type { PlanningAreaSnapshot } from '../lib/planning-areas'
import {
  clearOfflineData,
  listOfflinePackets,
  openOfflinePacket,
  readPublicPlanningView,
  storePublicPlanningView,
} from '../lib/offline'
import type { PublicPlanningView, SavedPacket } from '../lib/offline'

export const Route = createFileRoute('/offline')({ component: OfflinePlanning })

function OfflinePlanning() {
  const [view, setView] = useState<PublicPlanningView | null>(null)
  const [packets, setPackets] = useState<SavedPacket[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [shellReady, setShellReady] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([readPublicPlanningView(), listOfflinePackets()])
      .then(([snapshot, saved]) => {
        if (active) {
          setView(snapshot)
          setPackets(saved)
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            'Device storage is unavailable. Use downloaded field files.',
          )
      })
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then(() => {
        if (active) setShellReady(true)
      })
    }
    return () => {
      active = false
    }
  }, [])

  const retrieve = async () => {
    setBusy(true)
    setMessage('')
    try {
      const snapshot = await backendGet<PlanningAreaSnapshot>(
        '/api/v1/planning-areas',
      )
      if (snapshot.jurisdictions.length === 0)
        throw new Error('No public planning views were returned.')
      const saved: PublicPlanningView = {
        retrievedAt: new Date().toISOString(),
        areas: snapshot.jurisdictions.flatMap((county) =>
          county.areas.map(({ name, island, summary }) => ({
            name,
            island,
            summary,
          })),
        ),
        unsupported: snapshot.unsupported_areas,
      }
      await storePublicPlanningView(saved)
      setView(saved)
      setMessage('Public planning views saved on this device.')
    } catch (error) {
      setMessage(
        `Could not refresh the offline view. ${error instanceof Error ? error.message : 'Try again when connected.'} Previously saved content has not been replaced.`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <OperationsLayout title="Plan for the connection you have">
      <p className="operations-lead">
        Keep public planning context and generated field packets on this device
        before Wi-Fi, power or road access becomes unreliable.
      </p>
      <div className="operations-warning">
        <strong>Saved material is never live.</strong> Check the retrieval time
        before use. Verify all protective actions with the County. Maps,
        routing, live feeds and shared-plan writes require a connection.
      </div>
      <section aria-labelledby="offline-ready">
        <h2 id="offline-ready">Prepare this device</h2>
        <p role="status">
          {shellReady
            ? 'Offline app shell ready on this device.'
            : 'Offline shell not yet ready. Production HTTPS or localhost is required; keep downloaded field files as a fallback.'}
        </p>
        <p>
          After the shell is ready, use your browser’s Install app or Add to
          Home Screen command. Reopen this page once before leaving
          connectivity. Only public catalog summaries and the five most recent
          generated field packets are saved. No resident searches, typed notes,
          identity tokens, collaboration records, map tiles or personal data are
          cached.
        </p>
        <div className="operations-actions">
          <button type="button" disabled={busy} onClick={() => void retrieve()}>
            {busy
              ? 'Retrieving public views…'
              : 'Save latest public planning views'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void clearOfflineData()
                .then(() => {
                  setView(null)
                  setPackets([])
                  setMessage('Saved planning views and packets removed.')
                })
                .catch(() =>
                  setMessage(
                    'Could not clear storage. Use browser site-data settings.',
                  ),
                )
            }}
          >
            Clear saved planning data
          </button>
        </div>
        {message && <p role="status">{message}</p>}
      </section>
      <section aria-labelledby="saved-views">
        <h2 id="saved-views">Last retrieved planning views</h2>
        {view ? (
          <>
            <p className="operations-stamp">
              SAVED SNAPSHOT · Not live · Last retrieved at{' '}
              {new Date(view.retrievedAt).toLocaleString()}
            </p>
            <p>
              Representative practice context, not hazard forecasts or open
              shelters.
            </p>
            <ul className="operations-records">
              {view.areas.map((area) => (
                <li key={`${area.island}-${area.name}`}>
                  <h3>
                    {area.name} · {area.island}
                  </h3>
                  <p>{area.summary}</p>
                </li>
              ))}
            </ul>
            <p>
              Known coverage gaps:{' '}
              {view.unsupported.join('; ') ||
                'See County source coverage; representative areas are not complete island coverage.'}
            </p>
          </>
        ) : (
          <p>No planning views saved yet. Retrieve them while connected.</p>
        )}
      </section>
      <section aria-labelledby="saved-packets">
        <h2 id="saved-packets">Downloaded field packets</h2>
        <p>
          Download a field briefing from the planner’s response workspace to
          keep its MAP → MODEL → MATCH view here too. Files are self-contained
          and printable; browser storage may be evicted, so retain the
          downloaded file.
        </p>
        {packets.length ? (
          <ul className="operations-records">
            {packets.map((packet) => (
              <li key={packet.url}>
                <h3>{packet.filename}</h3>
                <p>
                  Not live · Last saved at{' '}
                  {new Date(packet.retrievedAt).toLocaleString()}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void openOfflinePacket(packet.url).catch((error: unknown) =>
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : 'Could not open saved packet.',
                      ),
                    )
                  }}
                >
                  Download saved packet
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No saved packets on this device yet.</p>
        )}
      </section>
    </OperationsLayout>
  )
}
