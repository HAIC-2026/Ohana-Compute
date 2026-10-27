import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  Accessibility,
  AlertTriangle,
  BatteryCharging,
  BusFront,
  CarFront,
  Languages,
  LocateFixed,
  MapPin,
  Navigation,
  PackageOpen,
  Route as RouteIcon,
  ShieldCheck,
  Speaker,
  Utensils,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import {
  activeEvents,
  findResidentRoutePlan,
  getNearestResidentRoutePlan,
  residentRoutePlans,
} from '../lib/mock-data'
import type { ResidentResourceKind } from '../lib/mock-data'
import {
  fetchOfficialEvacuationZone,
  fetchOfficialFloodRisk,
  fetchOfficialOpenShelters,
  fetchOfficialWildfireRisk,
  findNearestOfficialOpenShelter,
} from '../lib/official-emergency-data'
import type {
  OfficialEvacuationZone,
  OfficialFloodRisk,
  OfficialOpenShelter,
  OfficialWildfireRisk,
} from '../lib/official-emergency-data'
import { usePlanningStore } from '../store/planning-store'
import { useRovingTabs } from './RovingTabs'

const resourceLabels: Record<ResidentResourceKind, string> = {
  shelter: 'Safe shelter',
  'food-water': 'Food & water',
  'medical-power': 'Medical power',
  'accessible-transport': 'No-car pickup',
}

const resourceIcons: Record<ResidentResourceKind, typeof ShieldCheck> = {
  shelter: ShieldCheck,
  'food-water': Utensils,
  'medical-power': BatteryCharging,
  'accessible-transport': BusFront,
}

const supportedLanguages = [
  'English',
  'Hawaiian',
  'Tagalog',
  'Ilocano',
  'Japanese',
  'Korean',
  'Chinese',
  'Marshallese',
  'Samoan',
  'Spanish',
]

type LocationFeedback = {
  kind: 'status' | 'error'
  text: string
}

export function ResidentRoutePanel({ compact = false }: { compact?: boolean }) {
  const {
    selectedAreaId,
    selectedResidentPlanId,
    selectedResidentResourceId,
    hazard,
    selectedEventId,
    residentNoCar,
    residentMobilityHelp,
    residentMedicalPower,
    preferredLanguage,
    selectResidentPlan,
    selectResidentResource,
    setResidentNoCar,
    setResidentMobilityHelp,
    setResidentMedicalPower,
    setPreferredLanguage,
  } = usePlanningStore(
    useShallow((state) => ({
      selectedAreaId: state.selectedAreaId,
      selectedResidentPlanId: state.selectedResidentPlanId,
      selectedResidentResourceId: state.selectedResidentResourceId,
      hazard: state.hazard,
      selectedEventId: state.selectedEventId,
      residentNoCar: state.residentNoCar,
      residentMobilityHelp: state.residentMobilityHelp,
      residentMedicalPower: state.residentMedicalPower,
      preferredLanguage: state.preferredLanguage,
      selectResidentPlan: state.selectResidentPlan,
      selectResidentResource: state.selectResidentResource,
      setResidentNoCar: state.setResidentNoCar,
      setResidentMobilityHelp: state.setResidentMobilityHelp,
      setResidentMedicalPower: state.setResidentMedicalPower,
      setPreferredLanguage: state.setPreferredLanguage,
    })),
  )
  const selectedPlan = residentRoutePlans.find(
    (item) => item.id === selectedResidentPlanId,
  )
  const plan = selectedPlan ?? residentRoutePlans[0]
  const showPlan = selectedPlan?.areaId === selectedAreaId
  const selectedResource =
    plan.resources.find(
      (resource) => resource.id === selectedResidentResourceId,
    ) ?? plan.resources[0]
  const travel = residentNoCar ? selectedResource.noCar : selectedResource.drive
  const currentHazard =
    activeEvents.find((item) => item.id === selectedEventId)?.hazard ?? hazard
  const [address, setAddress] = useState(plan.startLabel)
  const [locationFeedback, setLocationFeedback] =
    useState<LocationFeedback | null>(null)
  const [locationPending, setLocationPending] = useState(false)
  const locationRequestRef = useRef(0)
  const [officialZone, setOfficialZone] =
    useState<OfficialEvacuationZone | null>(null)
  const [zoneLookupFailed, setZoneLookupFailed] = useState(false)
  const [officialFloodRisk, setOfficialFloodRisk] =
    useState<OfficialFloodRisk | null>(null)
  const [floodLookupFailed, setFloodLookupFailed] = useState(false)
  const [officialWildfireRisk, setOfficialWildfireRisk] =
    useState<OfficialWildfireRisk | null>(null)
  const [wildfireLookupFailed, setWildfireLookupFailed] = useState(false)
  const [openShelters, setOpenShelters] = useState<
    OfficialOpenShelter[] | null
  >(null)
  const [shelterLookupFailed, setShelterLookupFailed] = useState(false)

  useEffect(() => {
    setAddress(plan.startLabel)
  }, [plan.startLabel])

  useEffect(
    () => () => {
      locationRequestRef.current += 1
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    setOfficialZone(null)
    setZoneLookupFailed(false)
    setOfficialFloodRisk(null)
    setFloodLookupFailed(false)
    setOfficialWildfireRisk(null)
    setWildfireLookupFailed(false)
    setOpenShelters(null)
    setShelterLookupFailed(false)

    if (!showPlan) {
      return () => {
        cancelled = true
      }
    }

    if (currentHazard === 'tsunami') {
      void fetchOfficialEvacuationZone(plan.startCoordinates)
        .then((result) => {
          if (!cancelled) setOfficialZone(result)
        })
        .catch(() => {
          if (!cancelled) setZoneLookupFailed(true)
        })
    }

    void fetchOfficialOpenShelters(plan.startCoordinates)
      .then((result) => {
        if (!cancelled) setOpenShelters(result)
      })
      .catch(() => {
        if (!cancelled) setShelterLookupFailed(true)
      })

    if (currentHazard === 'hurricane' || currentHazard === 'flood') {
      void fetchOfficialFloodRisk(plan.startCoordinates)
        .then((result) => {
          if (!cancelled) setOfficialFloodRisk(result)
        })
        .catch(() => {
          if (!cancelled) setFloodLookupFailed(true)
        })
    }

    if (currentHazard === 'wildfire') {
      void fetchOfficialWildfireRisk(plan.startCoordinates)
        .then((result) => {
          if (!cancelled) setOfficialWildfireRisk(result)
        })
        .catch(() => {
          if (!cancelled) setWildfireLookupFailed(true)
        })
    }

    return () => {
      cancelled = true
    }
  }, [currentHazard, plan.id, plan.startCoordinates, showPlan])

  const nearestOfficialShelter =
    openShelters &&
    findNearestOfficialOpenShelter(openShelters, plan.startCoordinates)
  const practiceShelter = plan.resources.find(
    (resource) => resource.kind === 'shelter',
  )
  const floodEventContext =
    currentHazard === 'hurricane'
      ? 'Hurricane rain, drainage failure, and storm surge can flood beyond mapped FEMA boundaries.'
      : 'Heavy rain and drainage flooding can occur outside mapped FEMA boundaries.'
  const destinationTabs = useRovingTabs({
    label: 'Resident destination',
    values: plan.resources.map((resource) => resource.id),
    selectedValue: selectedResource.id,
    onSelect: selectResidentResource,
  })

  const useAddress = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    locationRequestRef.current += 1
    setLocationPending(false)
    const normalizedAddress = address.trim()
    if (!normalizedAddress) {
      setLocationFeedback({
        kind: 'error',
        text: 'Enter an address, intersection, landmark, or ZIP code before finding routes.',
      })
      return
    }
    const matchedPlan = findResidentRoutePlan(normalizedAddress)
    if (!matchedPlan) {
      setLocationFeedback({
        kind: 'error',
        text: 'No practice route found. Try Mānoa, Kakaʻako, Ala Moana, Kaimukī, Kāhala, Hawaiʻi Kai, 96816, or 96825.',
      })
      return
    }
    selectResidentPlan(matchedPlan.id)
    setLocationFeedback({
      kind: 'status',
      text: `Showing the nearest practice routes for ${matchedPlan.name}.`,
    })
  }

  const useCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationFeedback({
        kind: 'error',
        text: 'Current location is unavailable in this browser. Enter an address or landmark instead.',
      })
      return
    }
    const requestID = locationRequestRef.current + 1
    locationRequestRef.current = requestID
    setLocationPending(true)
    setLocationFeedback({
      kind: 'status',
      text: 'Finding your nearest practice route…',
    })
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (locationRequestRef.current !== requestID) return
        const matchedPlan = getNearestResidentRoutePlan([
          position.coords.longitude,
          position.coords.latitude,
        ])
        selectResidentPlan(matchedPlan.id)
        setLocationPending(false)
        setLocationFeedback({
          kind: 'status',
          text: `Showing the nearest available practice routes for ${matchedPlan.name}.`,
        })
      },
      (error) => {
        if (locationRequestRef.current !== requestID) return
        setLocationPending(false)
        const text =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Enter an address or landmark instead.'
            : error.code === error.TIMEOUT
              ? 'Current location took too long to respond. Try again or enter an address.'
              : 'Current location could not be determined. Enter an address or landmark instead.'
        setLocationFeedback({ kind: 'error', text })
      },
      { enableHighAccuracy: false, timeout: 5000 },
    )
  }

  const readDirections = () => {
    if (!('speechSynthesis' in window)) {
      setLocationFeedback({
        kind: 'error',
        text: 'Read-aloud is unavailable in this browser. The written steps remain available below.',
      })
      return
    }
    window.speechSynthesis.cancel()
    const message = new SpeechSynthesisUtterance(
      `${selectedResource.name}. ${travel.label}. ${travel.eta}. ${travel.steps.join(' ')} Avoid: ${travel.avoid.join(' ')}`,
    )
    message.lang = 'en-US'
    window.speechSynthesis.speak(message)
    setLocationFeedback({
      kind: 'status',
      text: `Reading the written route aloud. ${preferredLanguage} help at the destination ${selectedResource.languages.includes(preferredLanguage) ? 'is listed' : 'must be confirmed'}.`,
    })
  }

  if (!showPlan) {
    return (
      <div className={`resident-route-content ${compact ? 'is-compact' : ''}`}>
        <section className="resident-location resident-route-unavailable">
          <div className="resident-section-heading">
            <div>
              <h2>Resident route preview unavailable</h2>
              <p>
                This County representative workflow does not yet include
                address-level resident routes.
              </p>
            </div>
            <span>Practice scope</span>
          </div>
          <div className="resident-truth-note">
            <AlertTriangle size={17} />
            <p>
              No Oʻahu route or resource was substituted. Use official County
              alerts and validated local instructions for resident movement.
            </p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className={`resident-route-content ${compact ? 'is-compact' : ''}`}>
      <section className="resident-location">
        <div className="resident-section-heading">
          <div>
            <h2>Start from home</h2>
            <p>Enter an address, intersection, landmark, or ZIP code.</p>
          </div>
          <span>Practice lookup</span>
        </div>
        <form onSubmit={useAddress} noValidate>
          <MapPin size={18} />
          <label className="sr-only" htmlFor="resident-route-location">
            Home address or landmark
          </label>
          <input
            id="resident-route-location"
            name="resident-route-location"
            autoComplete="street-address"
            enterKeyHint="search"
            aria-describedby="resident-location-help resident-location-feedback"
            aria-invalid={locationFeedback?.kind === 'error'}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <button type="submit">Find routes</button>
        </form>
        <button
          type="button"
          className="use-location"
          disabled={locationPending}
          aria-describedby="resident-location-privacy"
          onClick={useCurrentLocation}
        >
          <LocateFixed size={16} />
          {locationPending
            ? 'Finding current location…'
            : 'Use my current location'}
        </button>
        <p id="resident-location-help" className="resident-location-help">
          Practice matching happens in this browser. The entered location is not
          stored with the response plan.
        </p>
        <p id="resident-location-privacy" className="sr-only">
          Current coordinates are used only to choose the nearest practice route
          and are not displayed or stored.
        </p>
        {locationFeedback && (
          <p
            id="resident-location-feedback"
            className={`location-feedback is-${locationFeedback.kind}`}
            role={locationFeedback.kind === 'error' ? 'alert' : 'status'}
          >
            {locationFeedback.text}
          </p>
        )}
      </section>

      <section
        className="resident-official-status"
        aria-label="Official event risk and shelter status"
      >
        <div className="resident-section-heading">
          <div>
            <h2>Your official status</h2>
            <p>
              Live public data for this practice location. Official alerts
              always override this screen.
            </p>
          </div>
          <span>Live sources</span>
        </div>

        <div className="official-status-grid">
          {(currentHazard === 'hurricane' || currentHazard === 'flood') && (
            <article
              className={`official-status-card is-flood ${
                officialFloodRisk?.classification === 'high'
                  ? 'is-caution'
                  : officialFloodRisk?.classification === 'moderate' ||
                      officialFloodRisk?.classification === 'undetermined'
                    ? 'is-warning'
                    : officialFloodRisk?.classification === 'lower-mapped'
                      ? 'is-safe'
                      : ''
              }`}
            >
              <span className="official-status-label">
                Flood risk at this location
              </span>
              {floodLookupFailed ? (
                <>
                  <strong>Status unavailable</strong>
                  <p>
                    The official flood-hazard source could not be reached. Do
                    not interpret this as being outside a flood-risk area.
                  </p>
                </>
              ) : !officialFloodRisk ? (
                <>
                  <strong>Checking official flood map…</strong>
                  <p>
                    Looking up this point and nearby high-risk flood boundaries.
                  </p>
                </>
              ) : (
                <>
                  <strong>{officialFloodRisk.title}</strong>
                  <p>
                    {officialFloodRisk.description} {floodEventContext}
                  </p>
                  {officialFloodRisk.coastalPlanningExposure && (
                    <div className="official-planning-note">
                      <span>Long-range coastal planning exposure</span>
                      This point is also inside the State’s modeled
                      1%-annual-chance coastal flood area with 3.2 ft of
                      sea-level rise. This is a future planning scenario, not
                      today’s forecast.
                    </div>
                  )}
                </>
              )}
              {officialFloodRisk && <small>{officialFloodRisk.source}</small>}
            </article>
          )}

          {currentHazard === 'tsunami' && (
            <article
              className={`official-status-card is-tsunami ${
                officialZone?.zoneType === 'Tsunami Safe Zone'
                  ? 'is-safe'
                  : officialZone?.status === 'inside'
                    ? 'is-warning'
                    : ''
              }`}
            >
              <span className="official-status-label">
                Tsunami evacuation status
              </span>
              {zoneLookupFailed ? (
                <>
                  <strong>Status unavailable</strong>
                  <p>
                    The official Hawaiʻi GIS source could not be reached. Do not
                    interpret this as being outside an evacuation zone.
                  </p>
                </>
              ) : !officialZone ? (
                <>
                  <strong>Checking official map…</strong>
                  <p>
                    Looking up this point in the statewide evacuation layer.
                  </p>
                </>
              ) : officialZone.status === 'inside' ? (
                <>
                  <strong>
                    {officialZone.zoneType === 'Extreme Tsunami Evacuation Zone'
                      ? 'Outside the standard zone; inside the extreme zone'
                      : `Inside the ${officialZone.zoneType}`}
                  </strong>
                  <p>{officialZone.description}</p>
                </>
              ) : (
                <>
                  <strong>Outside mapped tsunami evacuation zones</strong>
                  <p>{officialZone.description}</p>
                </>
              )}
              {officialZone && <small>{officialZone.source}</small>}
            </article>
          )}

          {currentHazard === 'wildfire' && (
            <article
              className={`official-status-card is-wildfire ${
                officialWildfireRisk?.rating === 'High'
                  ? 'is-caution'
                  : officialWildfireRisk?.rating === 'Medium'
                    ? 'is-warning'
                    : officialWildfireRisk?.rating === 'Low'
                      ? 'is-safe'
                      : ''
              }`}
            >
              <span className="official-status-label">
                Wildfire risk at this location
              </span>
              {wildfireLookupFailed ? (
                <>
                  <strong>Status unavailable</strong>
                  <p>
                    The official wildfire-risk source could not be reached. Do
                    not interpret this as being outside the fire or smoke risk
                    area.
                  </p>
                </>
              ) : !officialWildfireRisk ? (
                <>
                  <strong>Checking official wildfire map…</strong>
                  <p>Looking up the community planning risk for this point.</p>
                </>
              ) : (
                <>
                  <strong>{officialWildfireRisk.title}</strong>
                  <p>{officialWildfireRisk.description}</p>
                </>
              )}
              {officialWildfireRisk && (
                <small>{officialWildfireRisk.source}</small>
              )}
            </article>
          )}

          <article
            className={`official-status-card ${
              openShelters?.length === 0 ? 'is-caution' : ''
            }`}
          >
            <span className="official-status-label">
              Nearest officially open shelter
            </span>
            {shelterLookupFailed ? (
              <>
                <strong>Status unavailable</strong>
                <p>
                  The FEMA/Red Cross open-shelter feed could not be reached.
                  Confirm a destination before leaving.
                </p>
              </>
            ) : !openShelters ? (
              <>
                <strong>Checking open shelters…</strong>
                <p>Searching the official live feed across Hawaiʻi.</p>
              </>
            ) : nearestOfficialShelter ? (
              <>
                <strong>{nearestOfficialShelter.name}</strong>
                <p>
                  {nearestOfficialShelter.address},{' '}
                  {nearestOfficialShelter.city}. Reported{' '}
                  {nearestOfficialShelter.status.toLowerCase()}.
                </p>
              </>
            ) : (
              <>
                <strong>No officially open shelter currently reported</strong>
                <p>
                  FEMA/Red Cross currently lists no open Hawaiʻi shelter. Wait
                  for county instructions before traveling to a practice site.
                </p>
              </>
            )}
            <small>
              FEMA National Shelter System · checked live when this panel opens
            </small>
          </article>
        </div>

        {practiceShelter && !nearestOfficialShelter && (
          <div className="practice-shelter-callout">
            <div>
              <span>Practice route only</span>
              <strong>{practiceShelter.name}</strong>
              <p>
                This site is not confirmed open. Use the route to understand the
                trip, not as authorization to travel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => selectResidentResource(practiceShelter.id)}
            >
              Show practice route
            </button>
          </div>
        )}
      </section>

      <section className="resident-needs">
        <div className="resident-section-heading">
          <div>
            <h2>What help do you need?</h2>
            <p>
              Your route changes when walking, power, or mobility is a concern.
            </p>
          </div>
        </div>
        <div className="resident-need-options">
          <label>
            <input
              type="checkbox"
              checked={residentNoCar}
              onChange={(event) => {
                setResidentNoCar(event.target.checked)
                if (event.target.checked && !selectedResource.noCar.transit) {
                  const transport = plan.resources.find(
                    (resource) => resource.kind === 'accessible-transport',
                  )
                  if (transport) selectResidentResource(transport.id)
                }
              }}
            />
            <CarFront size={17} />
            <span>
              <strong>I do not have a car</strong>
              <small>Show walking, transit, and pickup options</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={residentMobilityHelp}
              onChange={(event) => {
                setResidentMobilityHelp(event.target.checked)
                if (event.target.checked) {
                  const transport = plan.resources.find(
                    (resource) => resource.kind === 'accessible-transport',
                  )
                  if (transport) selectResidentResource(transport.id)
                }
              }}
            />
            <Accessibility size={17} />
            <span>
              <strong>I need mobility help</strong>
              <small>Prioritize accessible pickup and entrances</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={residentMedicalPower}
              onChange={(event) => {
                setResidentMedicalPower(event.target.checked)
                if (event.target.checked) {
                  const medical = plan.resources.find(
                    (resource) => resource.kind === 'medical-power',
                  )
                  if (medical) selectResidentResource(medical.id)
                }
              }}
            />
            <BatteryCharging size={17} />
            <span>
              <strong>I need medical power</strong>
              <small>Prioritize charging and medication refrigeration</small>
            </span>
          </label>
        </div>
        <label className="language-choice">
          <Languages size={17} />
          <span>
            <strong>Help language</strong>
            <small>Prioritize resources with listed language support</small>
          </span>
          <select
            aria-label="Help language"
            value={preferredLanguage}
            onChange={(event) => setPreferredLanguage(event.target.value)}
          >
            {supportedLanguages.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="resident-risk-summary">
        <div className="resident-section-heading">
          <div>
            <h2>What may happen near {plan.name}</h2>
            <p>{plan.stayOrGo}</p>
          </div>
        </div>
        <ul>
          {plan.whatMayHappen.map((item) => (
            <li key={item}>
              <AlertTriangle size={15} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="flood-warning">
          <RouteIcon size={17} />
          <div>
            <strong>Flood and road warning</strong>
            <p>{plan.floodWarning}</p>
          </div>
        </div>
      </section>

      <section className="resident-destinations">
        <div className="resident-section-heading">
          <div>
            <h2>Choose where you need to go</h2>
            <p>Each destination has a road-level practice route.</p>
          </div>
        </div>
        <div className="destination-tabs" {...destinationTabs.tabListProps}>
          {plan.resources.map((resource) => {
            const Icon = resourceIcons[resource.kind]
            return (
              <button
                key={resource.id}
                type="button"
                {...destinationTabs.getTabProps(resource.id)}
                className={
                  resource.id === selectedResource.id ? 'is-active' : ''
                }
                onClick={() => selectResidentResource(resource.id)}
              >
                <Icon size={17} />
                <span>{resourceLabels[resource.kind]}</span>
              </button>
            )
          })}
        </div>

        <div className="selected-destination" {...destinationTabs.panelProps}>
          <div className="destination-title">
            <div>
              <small>{resourceLabels[selectedResource.kind]}</small>
              <h3>{selectedResource.name}</h3>
              <p>{selectedResource.status}</p>
            </div>
            <span>
              {travel.eta}
              <small>{travel.distance}</small>
            </span>
          </div>

          <dl>
            <div>
              <dt>Available</dt>
              <dd>{selectedResource.available}</dd>
            </div>
            <div>
              <dt>Accessibility</dt>
              <dd>{selectedResource.accessibility}</dd>
            </div>
            <div>
              <dt>Language</dt>
              <dd>
                {selectedResource.languages.includes(preferredLanguage)
                  ? `${preferredLanguage} support listed`
                  : `${preferredLanguage} interpreter must be confirmed`}
              </dd>
            </div>
          </dl>

          <div className="route-instructions">
            <div>
              <Navigation size={17} />
              <span>
                <strong>{travel.label}</strong>
                <small>From {plan.startLabel}</small>
              </span>
            </div>
            <ol>
              {travel.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {travel.transit && (
              <div className="transit-route-detail">
                <BusFront size={17} />
                <span>
                  <strong>
                    {travel.transit.route} · {travel.transit.headsign}
                  </strong>
                  <small>Board: {travel.transit.boardStop}</small>
                  <small>
                    Exit: {travel.transit.exitStop} · {travel.transit.stops}{' '}
                    stops
                  </small>
                  <small>{travel.transit.scheduleBasis}</small>
                  <em>{travel.transit.realtimeStatus}</em>
                </span>
              </div>
            )}
            <div className="avoid-list">
              <AlertTriangle size={16} />
              <span>
                <strong>Avoid</strong>
                {travel.avoid.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="read-directions"
            onClick={readDirections}
          >
            <Speaker size={17} />
            Read route aloud
          </button>
        </div>
      </section>

      <div className="resident-practice-warning">
        <PackageOpen size={17} />
        <p>
          These are practice routes, not live navigation. Confirm road closures,
          shelter openings, pickup availability, and official evacuation orders
          before leaving.
        </p>
      </div>
    </div>
  )
}
