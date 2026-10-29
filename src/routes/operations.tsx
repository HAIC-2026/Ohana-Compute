import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countyNames,
  label,
  handoffDecision,
  readinessEvidence,
  readinessGaps,
  readinessOverdue,
  requestOverdue,
  staffApi,
  StaffApiError,
} from '../lib/staff-operations'
import type {
  AssistanceRequest,
  OperationsBoard,
  Organization,
  ReadinessTask,
  StaffMember,
  StaffSession,
} from '../lib/staff-operations'
import '../staff-operations.css'

export const Route = createFileRoute('/operations')({ component: Operations })

export function Operations({
  embedded = false,
  county,
  hazard,
}: {
  embedded?: boolean
  county?: string
  hazard?: string
}) {
  const [session, setSession] = useState<StaffSession | null>(null)
  const [board, setBoard] = useState<OperationsBoard | null>(null)
  const [error, setError] = useState('')
  const [writeError, setWriteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [synced, setSynced] = useState('')
  const [selected, setSelected] = useState('')
  const [tab, setTab] = useState('response')
  const [mode, setMode] = useState('exercise')
  const [showCreate, setShowCreate] = useState(false)
  const [showFinding, setShowFinding] = useState(false)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [clock, setClock] = useState(0)
  const [notice, setNotice] = useState('')
  const loading = useRef<Promise<boolean> | null>(null)
  const receivedAt = useRef(0)
  const sessionEpoch = useRef(0)
  const refresh = useCallback((): Promise<boolean> => {
    if (loading.current) return loading.current
    const run = async () => {
      const epoch = sessionEpoch.current
      try {
        const current = await staffApi<StaffSession>('staff/session')
        if (epoch !== sessionEpoch.current) return false
        if (current.authenticated) {
          const next = await staffApi<OperationsBoard>('operations/board')
          if (epoch !== sessionEpoch.current) return false
          setBoard(next)
          receivedAt.current = performance.now()
          setClock(receivedAt.current)
          setSynced(next.server_time)
        } else {
          setBoard(null)
        }
        setSession(current)
        setStale(false)
        setError('')
        return true
      } catch (failure) {
        if (epoch !== sessionEpoch.current) return false
        setStale(true)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Shared state unavailable.',
        )
        if (failure instanceof StaffApiError && failure.status === 401) {
          setSession({ enabled: true, authenticated: false })
          setBoard(null)
        }
        return false
      }
    }
    loading.current = run().finally(() => {
      loading.current = null
    })
    return loading.current
  }, [])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      setClock(performance.now())
      void refresh()
    }, 5000)
    window.addEventListener('focus', refresh)
    return () => {
      sessionEpoch.current++
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])
  useEffect(() => {
    setShowCreate(false)
    setShowFinding(false)
    setSelected('')
  }, [county, hazard])
  async function mutate(path: string, input: object) {
    setBusy(true)
    setWriteError('')
    setNotice('')
    try {
      await staffApi(path, { ...input, key: crypto.randomUUID() })
      await loading.current
      if (!(await refresh())) {
        setWriteError(
          'Write accepted by the server, but the refreshed workspace is unavailable. Reconnect and inspect shared state before acting again.',
        )
        return false
      }
      setNotice('Saved to the shared workspace.')
      return true
    } catch (failure) {
      setWriteError(
        failure instanceof Error
          ? failure.message
          : 'Save not confirmed. Refresh before retrying.',
      )
      if (failure instanceof StaffApiError && failure.status === 409)
        await refresh()
      if (!(failure instanceof StaffApiError)) {
        setStale(true)
        setError(
          'Save outcome is unknown. Reconnect and inspect shared state before retrying.',
        )
      }
      return false
    } finally {
      setBusy(false)
    }
  }
  const member = session?.member
  const serverNow = board
    ? Date.parse(board.server_time) + Math.max(0, clock - receivedAt.current)
    : Date.now()
  const requests =
    board?.requests
      .filter(
        (request) =>
          request.mode === mode && (!county || request.county === county),
      )
      .sort((a, b) => {
        return (
          handoffDecision(a, serverNow).priority -
            handoffDecision(b, serverNow).priority ||
          Date.parse(a.due_at) - Date.parse(b.due_at)
        )
      }) ?? []
  const tasks =
    board?.tasks
      .filter(
        (task) => task.mode === mode && (!county || task.county === county),
      )
      .sort(
        (a, b) =>
          Number(a.status === 'closed') - Number(b.status === 'closed') ||
          Number(readinessOverdue(b, serverNow)) -
            Number(readinessOverdue(a, serverNow)) ||
          Date.parse(a.due_at) - Date.parse(b.due_at),
      ) ?? []
  const request = requests.find((entry) => entry.id === selected)
  const orgName = (id: string) =>
    board?.organizations.find((org) => org.id === id)?.name ?? id

  return (
    <section
      className="staff-ops"
      data-hydrated={session !== null}
      aria-label="Staff response coordination"
    >
      <header className="ops-masthead">
        {!embedded && <Link to="/">Planning map</Link>}
        <Link to="/coordination">Evidence &amp; plan annex</Link>
        {member && (
          <span>
            {orgName(member.organization)} · {label(member.role)}
          </span>
        )}
        {session?.authenticated && (
          <button
            type="button"
            onClick={async () => {
              try {
                await staffApi('staff/logout', {})
                sessionEpoch.current++
                setBoard(null)
                setSession({ enabled: true, authenticated: false })
              } catch {
                setWriteError(
                  'Sign-out could not be confirmed. Retry; do not leave this device unattended.',
                )
              }
            }}
          >
            Sign out
          </button>
        )}
      </header>
      <div className="ops-heading">
        {embedded ? (
          <h2>Response coordination</h2>
        ) : (
          <h1>Response coordination</h1>
        )}
        <p>One request. Named owners. Acknowledged handoffs.</p>
      </div>
      {embedded && (
        <p className="ops-boundary">
          Map scope:{' '}
          {county
            ? (countyNames[county] ?? 'Kalawao') + ' County'
            : 'All islands'}
          . Requests and preparedness tasks below follow this County scope.
          Requests have County geography only—not pickup locations. Map
          indicators are aggregate planning evidence, never individual
          assistance requests.
        </p>
      )}
      <p className="ops-boundary">
        Staff pilot · No dispatch or paging connection. Follow official
        emergency instructions; do not wait for this app in immediate danger.
      </p>
      {error && (
        <div role="alert" className="ops-error">
          {error}{' '}
          <button type="button" onClick={() => void refresh()}>
            Reconnect
          </button>
        </div>
      )}
      {writeError && (
        <p role="alert" className="ops-error">
          {writeError}
        </p>
      )}
      <p className="ops-status" role="status">
        {notice}
      </p>
      {!session && !error && <p role="status">Checking staff access…</p>}
      {session && !session.authenticated && (
        <section className="ops-access">
          <h2>
            {session.enabled
              ? 'Sign in to your team’s workspace'
              : 'Staff workspace not configured'}
          </h2>
          <p>
            County coordinators, transport providers and receiving partners
            share verified requests here. Public planning data never creates an
            individual assistance request.
          </p>
          {session.enabled ? (
            <a className="ops-primary" href="/api/v1/staff/login">
              Sign in with your organization
            </a>
          ) : (
            <p>
              An operator must configure organizational OIDC, staff membership
              and durable storage. There is no guest or simulated staff access.
            </p>
          )}
        </section>
      )}
      {member && board && (
        <>
          <div className="ops-toolbar">
            <nav aria-label="Workspace">
              <button
                type="button"
                aria-pressed={tab === 'response'}
                onClick={() => setTab('response')}
              >
                Emergency response
              </button>
              <button
                type="button"
                aria-pressed={tab === 'preparedness'}
                onClick={() => setTab('preparedness')}
              >
                Preparedness
              </button>
            </nav>
            <label>
              Record context
              <select
                aria-label="Record context"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value)
                  setSelected('')
                  setShowCreate(false)
                  setShowFinding(false)
                }}
              >
                <option value="exercise">EXERCISE — not a live incident</option>
                <option value="operational">Operational staff requests</option>
              </select>
            </label>
            <span className={stale ? 'ops-error' : ''}>
              {stale
                ? 'Disconnected — actions disabled'
                : `Synced ${new Date(synced).toLocaleTimeString()}`}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Refresh
            </button>
          </div>
          {mode === 'exercise' && (
            <p className="ops-exercise">
              EXERCISE records are separate from operational requests. All
              confirmations are staff-reported.
            </p>
          )}
          {county && !member.counties.includes(county) && (
            <p className="ops-boundary">
              The selected County is outside your configured staff jurisdiction.
              No operational records or creation actions are available for it.
              The public map remains planning evidence, not an operational
              coverage commitment.
            </p>
          )}
          {tab === 'response' ? (
            <>
              <section
                className="ops-decision-summary"
                aria-label="Response decision priorities"
              >
                <h2>What needs a decision now</h2>
                <p>
                  Authorized {mode} requests only—not modeled population demand
                  or available capacity.
                  {stale ? ' Last known state; reconnect to verify.' : ''}
                </p>
                <dl className="ops-priority-counts">
                  <div>
                    <dt>Overdue handoffs</dt>
                    <dd>
                      {
                        requests.filter((entry) =>
                          requestOverdue(entry, serverNow),
                        ).length
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Blocked requests</dt>
                    <dd>
                      {
                        requests.filter(
                          (entry) =>
                            entry.blocker &&
                            !['closed', 'cancelled', 'arrived'].includes(
                              entry.status,
                            ),
                        ).length
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Due within one hour</dt>
                    <dd>
                      {
                        requests.filter(
                          (entry) => handoffDecision(entry, serverNow).dueSoon,
                        ).length
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>ETA beyond deadline</dt>
                    <dd>
                      {
                        requests.filter(
                          (entry) =>
                            handoffDecision(entry, serverNow).deadlineRisk,
                        ).length
                      }
                    </dd>
                  </div>
                </dl>
                <p>
                  Conditions can overlap; these counts must not be added
                  together.
                </p>
                <button
                  type="button"
                  aria-pressed={attentionOnly}
                  onClick={() => {
                    setAttentionOnly((value) => !value)
                    setSelected('')
                  }}
                >
                  {attentionOnly
                    ? 'Show all handoffs'
                    : 'Show time-critical or blocked handoffs'}
                </button>
                {member.role === 'state' && (
                  <p>
                    Only County-escalated requests appear here. A missing County
                    is not evidence that it needs no support.
                  </p>
                )}
              </section>
              <div className="ops-section-heading">
                <h2>
                  {member.role === 'state'
                    ? 'County requests for State support'
                    : member.role === 'county'
                      ? 'Requests needing coordination'
                      : 'Your organization’s handoffs'}
                </h2>
                {member.role === 'county' && (
                  <button
                    className="ops-primary"
                    type="button"
                    disabled={
                      busy ||
                      stale ||
                      (!!county && !member.counties.includes(county))
                    }
                    onClick={() => setShowCreate(!showCreate)}
                  >
                    New assistance request
                  </button>
                )}
              </div>
              {showCreate && (
                <CreateRequest
                  member={member}
                  county={county}
                  hazard={hazard}
                  disabled={busy || stale}
                  mode={mode}
                  save={async (input) => {
                    if (await mutate('operations/requests', input))
                      setShowCreate(false)
                  }}
                />
              )}
              <div className="ops-workspace">
                <section
                  aria-label="Shared requests"
                  className="ops-request-list"
                >
                  {requests.length === 0 && (
                    <p className="ops-empty">
                      No {mode} requests in your authorized scope.{' '}
                      {member.role === 'state'
                        ? 'County staff must explicitly escalate a request before it appears here.'
                        : 'Unassigned work is never presented as accepted.'}
                    </p>
                  )}
                  {attentionOnly &&
                    !requests.some(
                      (entry) => handoffDecision(entry, serverNow).priority < 4,
                    ) && (
                      <p>
                        No time-critical or blocked handoffs in this authorized
                        snapshot. Other work may still need acknowledgment.
                      </p>
                    )}
                  {requests
                    .filter(
                      (entry) =>
                        !attentionOnly ||
                        handoffDecision(entry, serverNow).priority < 4,
                    )
                    .map((entry) => (
                      <button
                        className={`ops-request ${entry.id === selected ? 'is-selected' : ''}`}
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setSelected(entry.id)
                          setWriteError('')
                        }}
                        aria-pressed={entry.id === selected}
                      >
                        <span className="ops-request-title">
                          {entry.intake_ref}
                          <span>
                            {entry.people}{' '}
                            {entry.people === 1 ? 'person' : 'people'}
                          </span>
                        </span>
                        <span>
                          {entry.incident_ref} · {countyNames[entry.county]} ·{' '}
                          {label(entry.assistance)}
                        </span>
                        <strong>
                          {handoffDecision(entry, serverNow).action}
                        </strong>
                        <span>
                          Next owner:{' '}
                          {orgName(handoffDecision(entry, serverNow).owner)} ·{' '}
                          {label(handoffDecision(entry, serverNow).urgency)}
                        </span>
                        <span
                          className={
                            requestOverdue(entry, serverNow) ? 'ops-late' : ''
                          }
                        >
                          {requestOverdue(entry, serverNow) ? 'OVERDUE · ' : ''}
                          Next check{' '}
                          {new Date(
                            handoffDecision(entry, serverNow).deadline,
                          ).toLocaleString()}
                          {entry.escalated ? ' · State support requested' : ''}
                        </span>
                      </button>
                    ))}
                </section>
                <section className="ops-detail" aria-label="Request handoff">
                  {request ? (
                    <RequestDetail
                      key={request.id}
                      request={request}
                      member={member}
                      organizations={board.organizations}
                      disabled={busy || stale}
                      orgName={orgName}
                      command={(input) =>
                        mutate(`operations/requests/${request.id}/commands`, {
                          ...input,
                          expected_revision: request.revision,
                        })
                      }
                      createTask={(input) =>
                        mutate(`operations/requests/${request.id}/readiness`, {
                          ...input,
                          expected_revision: request.revision,
                        })
                      }
                    />
                  ) : (
                    <div className="ops-empty">
                      <h3>Select a request to act</h3>
                      <p>
                        Confirm the next handoff, resolve a blocker or escalate
                        an unmet need. This board records coordination—not
                        vehicle dispatch.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : (
            <section aria-label="Preparedness tasks">
              <h2>Close the gaps before the next emergency</h2>
              <p>
                Tasks come from public evidence, an agency assessment, a request
                or exercise finding. A submitted evidence reference is not
                completion; the County must review it.
              </p>
              <p>
                {tasks.filter((task) => task.status !== 'closed').length} open
                or awaiting review ·{' '}
                {
                  tasks.filter((task) => readinessOverdue(task, serverNow))
                    .length
                }{' '}
                overdue ·{' '}
                {tasks.filter((task) => task.status === 'in_review').length}{' '}
                awaiting County review. Closure verifies the recorded evidence,
                not County-wide readiness.
              </p>
              {member.role === 'county' && (
                <button
                  type="button"
                  className="ops-primary"
                  disabled={
                    busy ||
                    stale ||
                    (!!county && !member.counties.includes(county))
                  }
                  onClick={() => setShowFinding((value) => !value)}
                >
                  Record preparedness finding
                </button>
              )}
              {showFinding && member.role === 'county' && (
                <CreateFinding
                  key={`${county ?? 'all'}-${hazard ?? 'all'}-${mode}`}
                  member={member}
                  organizations={board.organizations}
                  county={county}
                  hazard={hazard}
                  mode={mode}
                  disabled={busy || stale}
                  save={async (input) => {
                    if (await mutate('operations/readiness', input))
                      setShowFinding(false)
                  }}
                />
              )}
              {tasks.length === 0 && (
                <p className="ops-empty">
                  No readiness tasks in your scope. County staff can record a
                  preparedness finding without creating an incident or an
                  individual assistance request.
                </p>
              )}
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  member={member}
                  orgName={orgName}
                  disabled={busy || stale}
                  now={serverNow}
                  command={(input) =>
                    mutate(`operations/readiness/${task.id}/commands`, {
                      ...input,
                      expected_revision: task.revision,
                    })
                  }
                />
              ))}
            </section>
          )}
        </>
      )}
    </section>
  )
}

function CreateRequest({
  member,
  county,
  hazard,
  disabled,
  mode,
  save,
}: {
  member: StaffMember
  county?: string
  hazard?: string
  disabled: boolean
  mode: string
  save: (input: object) => Promise<void>
}) {
  return (
    <form
      className="ops-form"
      aria-label="New assistance request"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        void save({
          mode,
          county: data.get('county'),
          hazard: data.get('hazard'),
          incident_ref: data.get('incident'),
          intake_ref: data.get('reference'),
          people: Number(data.get('people')),
          assistance: data.get('assistance'),
          due_at: new Date(String(data.get('due'))).toISOString(),
        })
      }}
    >
      <h3>Record an authorized intake request</h3>
      <p>
        Use a restricted reference only. Names, addresses and medical details
        stay in the authorized intake system. Staff must resolve the reference
        through their approved channel before movement.
      </p>
      <fieldset disabled={disabled}>
        <label>
          Incident / exercise reference
          <input
            name="incident"
            required
            pattern={'[A-Za-z0-9][A-Za-z0-9_\\-]{2,63}'}
            maxLength={64}
            placeholder="DRILL-001"
          />
        </label>
        <label>
          Intake reference
          <input
            name="reference"
            required
            pattern={'[A-Za-z0-9][A-Za-z0-9_\\-]{2,63}'}
            maxLength={64}
            placeholder="EXERCISE-001"
          />
        </label>
        <label>
          County
          <select name="county" defaultValue={county} required>
            {member.counties
              .filter((code) => !county || code === county)
              .map((code) => (
                <option key={code} value={code}>
                  {countyNames[code]}
                </option>
              ))}
          </select>
        </label>
        <label>
          Hazard
          <select name="hazard" defaultValue={hazard ?? 'hurricane'}>
            {['hurricane', 'flood', 'wildfire', 'tsunami'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          People needing assistance
          <input
            type="number"
            name="people"
            min={1}
            max={50}
            required
            defaultValue={1}
          />
        </label>
        <label>
          Assistance required
          <select name="assistance">
            <option value="accessible_vehicle">Accessible vehicle</option>
            <option value="mobility_assistance">Mobility assistance</option>
            <option value="caregiver_accompaniment">
              Caregiver accompaniment
            </option>
          </select>
        </label>
        <label>
          County-requested completion deadline
          <input name="due" type="datetime-local" required />
        </label>
        <button className="ops-primary" type="submit">
          Create shared request
        </button>
      </fieldset>
    </form>
  )
}

function CreateFinding({
  member,
  organizations,
  county,
  hazard,
  mode,
  disabled,
  save,
}: {
  member: StaffMember
  organizations: Array<Organization>
  county?: string
  hazard?: string
  mode: string
  disabled: boolean
  save: (input: object) => Promise<void>
}) {
  const [selectedCounty, setSelectedCounty] = useState(
    county ?? member.counties[0],
  )
  const [gap, setGap] = useState('transport_agreement')
  const options = organizations.filter((org) =>
    org.counties.includes(selectedCounty),
  )
  return (
    <form
      className="ops-form"
      aria-label="Preparedness finding"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        void save({
          mode,
          county: selectedCounty,
          hazard: data.get('hazard'),
          source_kind: data.get('source_kind'),
          source_ref: data.get('source_ref'),
          organization: data.get('organization'),
          gap,
          due_at: new Date(String(data.get('due'))).toISOString(),
        })
      }}
    >
      <h3>Assign prevention work from evidence</h3>
      <p>
        No emergency or resident request is required. Record an opaque reference
        to the assessment in your approved records system—not a name, address,
        URL or unreviewed population count.
      </p>
      <fieldset disabled={disabled}>
        <label>
          Finding County
          <select
            required
            value={selectedCounty}
            onChange={(event) => setSelectedCounty(event.target.value)}
          >
            {member.counties
              .filter((code) => !county || code === county)
              .map((code) => (
                <option value={code} key={code}>
                  {countyNames[code]}
                </option>
              ))}
          </select>
        </label>
        <label>
          Finding hazard
          <select name="hazard" defaultValue={hazard ?? 'hurricane'}>
            {['hurricane', 'flood', 'wildfire', 'tsunami'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Evidence basis
          <select
            name="source_kind"
            defaultValue={
              mode === 'exercise' ? 'exercise_finding' : 'agency_assessment'
            }
          >
            {mode === 'exercise' && (
              <option value="exercise_finding">Exercise finding</option>
            )}
            <option value="agency_assessment">Agency assessment</option>
            <option value="public_evidence">
              Public evidence requiring local verification
            </option>
          </select>
        </label>
        <label>
          Assessment reference
          <input
            name="source_ref"
            required
            maxLength={64}
            pattern={'[A-Za-z0-9][A-Za-z0-9_\\-]{2,63}'}
            placeholder="ASSESSMENT-001"
          />
        </label>
        <label>
          Gap to address
          <select value={gap} onChange={(event) => setGap(event.target.value)}>
            {Object.entries(readinessGaps).map(([key, value]) => (
              <option key={key} value={key}>
                {value.domain} · {label(key)}
              </option>
            ))}
          </select>
        </label>
        <p>
          <strong>Evidence required for County review:</strong>{' '}
          {readinessEvidence(gap)?.evidence}
        </p>
        <label>
          Finding owner
          <select
            key={selectedCounty}
            name="organization"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Choose an accountable organization
            </option>
            {options.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Finding review deadline
          <input name="due" type="datetime-local" required />
        </label>
        <button type="submit" disabled={!options.length}>
          Assign preparedness finding
        </button>
      </fieldset>
    </form>
  )
}

function RequestDetail({
  request: r,
  member,
  organizations,
  disabled,
  orgName,
  command,
  createTask,
}: {
  request: AssistanceRequest
  member: StaffMember
  organizations: Array<Organization>
  disabled: boolean
  orgName: (id: string) => string
  command: (input: object) => Promise<boolean>
  createTask: (input: object) => Promise<boolean>
}) {
  const [transport, setTransport] = useState('')
  const [receiving, setReceiving] = useState('')
  const [eta, setEta] = useState('')
  const [reason, setReason] = useState('no_vehicle')
  const [taskOpen, setTaskOpen] = useState(false)
  const [checks, setChecks] = useState(false)
  useEffect(() => setChecks(false), [r.revision])
  const coordinator =
    (member.role === 'county' && member.organization === r.coordinator) ||
    (member.role === 'state' && r.escalated)
  const countyCoordinator =
    member.role === 'county' && member.organization === r.coordinator
  const driver =
    member.role === 'transport' && member.organization === r.transport
  const receiver =
    member.role === 'receiving' && member.organization === r.receiving
  const terminal = ['closed', 'cancelled'].includes(r.status)
  const options = (role: string) =>
    organizations.filter(
      (org) => org.role === role && org.counties.includes(r.county),
    )
  const action = (name: string, text: string, extra?: object) => (
    <button
      key={name}
      type="button"
      disabled={disabled}
      onClick={() => void command({ action: name, ...extra })}
    >
      {text}
    </button>
  )
  return (
    <>
      <div className="ops-section-heading">
        <h3>{r.intake_ref}</h3>
        <span>
          {label(r.status)} · revision {r.revision}
        </span>
      </div>
      <dl className="ops-facts">
        <div>
          <dt>Accountable coordinator</dt>
          <dd>{orgName(r.coordinator)}</dd>
        </div>
        <div>
          <dt>Need</dt>
          <dd>
            {r.people} · {label(r.assistance)}
          </dd>
        </div>
        <div>
          <dt>Transport</dt>
          <dd>
            {r.transport ? orgName(r.transport) : 'Not offered'} ·{' '}
            {r.status === 'offered' ? 'awaiting acceptance' : label(r.status)}
          </dd>
        </div>
        <div>
          <dt>Receiving partner</dt>
          <dd>
            {r.receiving ? orgName(r.receiving) : 'Not selected'} ·{' '}
            {r.receiving_ready ? 'readiness acknowledged' : 'NOT confirmed'}
          </dd>
        </div>
        <div>
          <dt>Completion deadline</dt>
          <dd>{new Date(r.due_at).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Provider pickup ETA</dt>
          <dd>{r.eta ? new Date(r.eta).toLocaleString() : 'Not supplied'}</dd>
        </div>
      </dl>
      {r.blocker && (
        <p className="ops-error">
          Blocked: {label(r.blocker)}. Coordinator follow-up required.
        </p>
      )}
      {!terminal && (
        <fieldset className="ops-actions" disabled={disabled}>
          <legend>Next accountable action</legend>
          {countyCoordinator &&
            !r.verified &&
            action('verify', 'Verify intake & assistance')}
          {countyCoordinator &&
            r.verified &&
            !r.receiving_ready &&
            r.status !== 'arrived' && (
              <>
                <label>
                  Receiving organization
                  <select
                    value={receiving}
                    onChange={(event) => setReceiving(event.target.value)}
                  >
                    <option value="">Choose verified partner</option>
                    {options('receiving').map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!receiving || disabled}
                  onClick={() =>
                    void command({
                      action: 'set_receiving',
                      organization: receiving,
                    })
                  }
                >
                  Request receiving confirmation
                </button>
              </>
            )}
          {receiver &&
            !r.receiving_ready &&
            r.status !== 'arrived' &&
            action(
              'receiving_ready',
              'Confirm destination can meet stated needs',
            )}
          {receiver &&
            r.status !== 'arrived' &&
            action(
              'receiving_unavailable',
              'Report receiving site unavailable',
            )}
          {coordinator &&
            r.verified &&
            ['requested', 'declined', 'offered', 'accepted'].includes(
              r.status,
            ) && (
              <>
                <label>
                  Transport organization
                  <select
                    value={transport}
                    onChange={(event) => setTransport(event.target.value)}
                  >
                    <option value="">Choose provider to ask</option>
                    {options('transport').map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!transport || disabled}
                  onClick={() =>
                    void command({ action: 'offer', organization: transport })
                  }
                >
                  Offer transport assignment
                </button>
              </>
            )}
          {driver && r.status === 'offered' && (
            <>
              <label>
                Provider pickup ETA
                <input
                  aria-label="Provider pickup ETA"
                  type="datetime-local"
                  value={eta}
                  onChange={(event) => setEta(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={!eta || disabled}
                onClick={() =>
                  void command({
                    action: 'accept',
                    eta: new Date(eta).toISOString(),
                  })
                }
              >
                Accept & commit ETA
              </button>
            </>
          )}
          {driver && ['offered', 'accepted'].includes(r.status) && (
            <>
              <label>
                Decline reason
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                >
                  {['no_vehicle', 'staffing', 'equipment', 'unsafe_route'].map(
                    (value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              {action('decline', 'Decline / withdraw assignment', { reason })}
            </>
          )}
          {countyCoordinator &&
            !r.escalated &&
            action('escalate', 'Request State support')}
          {countyCoordinator &&
            ['accepted', 'picked_up'].includes(r.status) &&
            r.receiving_ready &&
            !r.released &&
            !r.blocker && (
              <>
                <label className="ops-check">
                  <input
                    type="checkbox"
                    checked={checks}
                    onChange={(event) => setChecks(event.target.checked)}
                  />
                  I verified the intake reference, agency movement authority,
                  current route/access checks and destination arrangements
                  through approved channels.
                </label>
                <button
                  type="button"
                  disabled={!checks || disabled}
                  onClick={() => void command({ action: 'release' })}
                >
                  Record movement prerequisites confirmed
                </button>
              </>
            )}
          {countyCoordinator &&
            r.blocker &&
            r.receiving_ready &&
            r.status !== 'declined' &&
            action(
              'resolve_blocker',
              'Record blocker resolved through approved channels',
            )}
          {driver &&
            r.status === 'picked_up' &&
            action('report_blocker', 'Report unsafe route / pause handoff', {
              reason: 'unsafe_route',
            })}
          {driver &&
            r.status === 'accepted' &&
            r.released &&
            action('pickup', 'Confirm pickup completed')}
          {receiver &&
            r.status === 'picked_up' &&
            r.released &&
            !r.blocker &&
            action('arrive', 'Confirm arrival received')}
          {countyCoordinator &&
            r.status === 'arrived' &&
            action('close', 'Close confirmed handoff')}
          {countyCoordinator &&
            ['requested', 'offered', 'declined', 'accepted'].includes(
              r.status,
            ) &&
            action('cancel', 'Cancel request')}
        </fieldset>
      )}
      <details className="ops-history">
        <summary>Handoff history · {r.events.length} acknowledgments</summary>
        <ol>
          {r.events.map((event, index) => (
            <li key={index}>
              <strong>{label(event.action)}</strong>
              {event.target && <span>To {orgName(event.target)}</span>}
              {event.reason && <span>Reason: {label(event.reason)}</span>}
              <span>
                {orgName(event.organization)} ·{' '}
                {new Date(event.at).toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </details>
      {coordinator && (
        <section>
          <button type="button" onClick={() => setTaskOpen(!taskOpen)}>
            Create preparedness task
          </button>
          {taskOpen && (
            <form
              className="ops-form"
              onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                void createTask({
                  organization: data.get('organization'),
                  gap: data.get('gap'),
                  due_at: new Date(String(data.get('due'))).toISOString(),
                }).then((ok) => {
                  if (ok) setTaskOpen(false)
                })
              }}
            >
              <h4>Prevent this gap next time</h4>
              <fieldset disabled={disabled}>
                <label>
                  Responsible organization
                  <select name="organization" required>
                    {organizations
                      .filter((org) => org.counties.includes(r.county))
                      .map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Gap to close
                  <select name="gap">
                    {Object.keys(readinessGaps).map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Review deadline
                  <input name="due" type="datetime-local" required />
                </label>
                <button type="submit">Assign readiness task</button>
              </fieldset>
            </form>
          )}
        </section>
      )}
    </>
  )
}

function TaskRow({
  task,
  member,
  orgName,
  disabled,
  command,
  now,
}: {
  task: ReadinessTask
  member: StaffMember
  orgName: (id: string) => string
  disabled: boolean
  command: (input: object) => Promise<boolean>
  now: number
}) {
  const [evidence, setEvidence] = useState('')
  const owner = member.organization === task.organization
  const reviewer =
    member.role === 'county' && member.organization === task.coordinator
  return (
    <article className="ops-task">
      <div>
        <h3>{label(task.gap)}</h3>
        <p>
          {task.request_id
            ? `From ${task.incident_ref} / ${task.source_ref}`
            : `From ${label(task.source_kind ?? 'agency_assessment')} · ${task.source_ref}`}
        </p>
        <p>
          {task.hazard ? `${label(task.hazard)} · ` : ''}
          {readinessEvidence(task.gap)?.domain} · Evidence required:{' '}
          {readinessEvidence(task.gap)?.evidence}
        </p>
        <p>
          {orgName(task.organization)} · {countyNames[task.county]} · due{' '}
          {new Date(task.due_at).toLocaleString()}
        </p>
      </div>
      <strong>{label(task.status)}</strong>
      {readinessOverdue(task, now) && (
        <strong className="ops-late">
          OVERDUE ·{' '}
          {task.status === 'in_review'
            ? 'County evidence review required'
            : 'Assigned organization follow-up required'}
        </strong>
      )}
      {task.evidence_ref && (
        <p>
          Evidence reference: {task.evidence_ref} · verify in the authorized
          records system
        </p>
      )}
      {owner && ['open', 'changes_needed'].includes(task.status) && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void command({ action: 'submit', evidence_ref: evidence })
          }}
        >
          <label>
            Evidence reference
            <input
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              required
              pattern={'[A-Za-z0-9][A-Za-z0-9_\\-]{2,63}'}
              maxLength={64}
            />
          </label>
          <button type="submit" disabled={disabled}>
            Submit evidence for County review
          </button>
        </form>
      )}
      {reviewer && task.status === 'in_review' && (
        <div className="ops-task-review">
          <button
            type="button"
            disabled={disabled}
            onClick={() => void command({ action: 'approve' })}
          >
            Confirm reviewed evidence & close
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void command({ action: 'return' })}
          >
            Return for changes
          </button>
        </div>
      )}
      <details>
        <summary>Task history</summary>
        <ol>
          {task.events.map((event, index) => (
            <li key={index}>
              {label(event.action)} · {orgName(event.organization)} ·{' '}
              {new Date(event.at).toLocaleString()}
            </li>
          ))}
        </ol>
      </details>
    </article>
  )
}
