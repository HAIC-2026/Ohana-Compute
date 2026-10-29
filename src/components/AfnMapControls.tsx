import { afnCounties, afnIndicators, useAfnMap } from '../lib/afn-map'

export function AfnMapControls() {
  const {
    enabled,
    domain,
    county,
    indicator,
    setEnabled,
    setDomain,
    setIndicator,
  } = useAfnMap()
  return (
    <details className="afn-map-controls">
      <summary>County AFN map · CMIST layers</summary>
      <p>
        Real public Census tract boundaries and aggregate estimates. Not
        individual locations or a count of people inside a hazard zone.
      </p>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Show aggregate AFN layer
      </label>
      <label>
        Aggregate map indicator
        <select
          value={indicator}
          onChange={(event) => {
            const key = Object.keys(afnIndicators).find(
              (candidate): candidate is keyof typeof afnIndicators =>
                candidate === event.target.value,
            )
            if (key) setIndicator(key)
          }}
        >
          {Object.entries(afnIndicators)
            .filter(([, item]) =>
              item.domains.some((itemDomain) => itemDomain === domain),
            )
            .map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
        </select>
      </label>
      <p>{afnIndicators[indicator].note}</p>
      <label>
        CMIST map domain
        <select
          value={domain}
          onChange={(event) => {
            const next = event.target.value
            if (
              next === 'Communication' ||
              next === 'Medical' ||
              next === 'Independence' ||
              next === 'Safety' ||
              next === 'Transportation'
            )
              setDomain(next)
          }}
        >
          {[
            'Communication',
            'Medical',
            'Independence',
            'Safety',
            'Transportation',
          ].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <p>
        County follows the selected community:{' '}
        {afnCounties.find((item) => item.id === county)?.name}. Return to the
        map after selecting a layer. Gray or missing geography means unknown,
        not low need.
      </p>
    </details>
  )
}
