import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { OperationsLayout } from '../components/OperationsLayout'
import { backendGet } from '../lib/backend-api'

export const Route = createFileRoute('/source-health')({
  component: SourceHealth,
})

type SourceHealthSnapshot = {
  generated_at: string
  scope: string
  sources: Array<{
    id: string
    name: string
    authority: string
    url: string
    status: string
    integration: string
    data_class: string
    update_cadence: string
    last_successful_retrieval?: string
    fresh_until?: string
    observed_at?: string
    coverage: string
    enables: string[]
    limitations: string[]
    missing_artifact?: string
    owning_authority?: string
  }>
}

function timestamp(value?: string) {
  return !value || value.startsWith('0001-')
    ? 'Unknown — no successful retrieval observed'
    : new Date(value).toLocaleString()
}

function SourceHealth() {
  const [snapshot, setSnapshot] = useState<SourceHealthSnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const retrieve = async () => {
    setBusy(true)
    setError('')
    try {
      setSnapshot(
        await backendGet<SourceHealthSnapshot>('/api/v1/sources/health'),
      )
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Source-health request failed',
      )
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void retrieve()
  }, [])
  return (
    <OperationsLayout title="Data-source health">
      <p className="operations-lead">
        Know which evidence the backend has actually retrieved, which is stale,
        and where an authoritative connection is still missing.
      </p>
      <div className="operations-warning">
        Unknown does not mean zero need, no hazard or no open shelter. A
        successful source request is not a County validation or a statewide
        coverage guarantee.
      </div>
      <div className="operations-actions">
        <button type="button" disabled={busy} onClick={() => void retrieve()}>
          {busy ? 'Retrieving health…' : 'Refresh health'}
        </button>
      </div>
      {error && (
        <p role="alert">
          Health unavailable: {error}. Any previous snapshot below is not
          current. Reconnect and refresh.
        </p>
      )}
      {snapshot && (
        <>
          <p className="operations-stamp">
            Health snapshot retrieved at {timestamp(snapshot.generated_at)} ·
            Status ages at this timestamp; refresh before use.
          </p>
          <p>{snapshot.scope}</p>
          <ul className="operations-records">
            {snapshot.sources.map((source) => (
              <li key={source.id}>
                <details>
                  <summary>
                    <span>{source.name}</span>
                    <strong
                      className={`source-state source-state-${source.status}`}
                    >
                      {source.status.replaceAll('_', ' ')}
                    </strong>
                  </summary>
                  <p>
                    {source.authority} · {source.data_class}
                  </p>
                  <dl className="operations-facts">
                    <div>
                      <dt>Last successful retrieval</dt>
                      <dd>{timestamp(source.last_successful_retrieval)}</dd>
                    </div>
                    <div>
                      <dt>Fresh until</dt>
                      <dd>{timestamp(source.fresh_until)}</dd>
                    </div>
                    <div>
                      <dt>Publication / refresh window</dt>
                      <dd>{source.update_cadence}</dd>
                    </div>
                    <div>
                      <dt>Integration</dt>
                      <dd>{source.integration}</dd>
                    </div>
                    <div>
                      <dt>Coverage</dt>
                      <dd>
                        {source.coverage} {source.enables.join('; ')}
                      </dd>
                    </div>
                  </dl>
                  <h3>Known gaps</h3>
                  <ul>
                    {source.limitations.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                  {source.missing_artifact && (
                    <p>
                      Missing: {source.missing_artifact}. Owner:{' '}
                      {source.owning_authority}.
                    </p>
                  )}
                  <a href={source.url} target="_blank" rel="noreferrer">
                    Open authoritative source
                  </a>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </OperationsLayout>
  )
}
