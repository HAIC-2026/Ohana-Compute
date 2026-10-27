# Browser and backend observability

The browser sends privacy-safe aggregate telemetry to
`POST /api/v1/telemetry/browser`. The backend exposes Prometheus metrics at
`GET /metrics`.

## Privacy and cardinality contract

Telemetry never includes addresses, coordinates, form or input values, visible
text, user identifiers, full URLs, query strings, or arbitrary DOM attributes.
The ingest endpoint rejects unknown fields and label values rather than turning
them into Prometheus labels.

Browser events use only these bounded labels:

- `kind`: `page_load`, `interaction`, or `interaction_timing`
- `action`: `navigation`, `dom_content_loaded`, `load`, `hydration`,
  `map_ready`, `hazard_select`, `severity_change`, `area_select`,
  `layer_toggle`, `planning_brief_generate`, `planning_brief_update`,
  `field_packet_download`, `map_interact`, `activate`, `change`, `submit`, or
  `keyboard`
- `category`: a fixed element category such as `button`, `select`, `map`,
  `planning`, or `page`
- `route`: `home` or `other`; raw paths and query strings are never sent
- `viewport`: `small`, `medium`, or `large`
- `outcome`: `success`, `error`, or `unknown`

Page lifecycle timings cover navigation response, DOM content loaded, browser
load, React hydration, and map ready. Semantic interactions are captured at the
document boundary, while the Event Timing API supplies additional end-to-end
interaction duration where supported.
Because capture listeners are installed once at the document boundary, every
trusted button or link activation, form submission, selection or change,
keyboard interaction, and map pointer interaction is covered without requiring
each component to add its own telemetry call. Pointer events that would
duplicate a subsequent click are intentionally counted once rather than twice.

The browser batches up to 40 events, flushes every five seconds, and keeps at
most 200 events in memory. Hidden-page and navigation flushes use
`navigator.sendBeacon` when available and a `fetch(..., {keepalive: true})`
fallback. Telemetry delivery errors are ignored by the resident workflow.

The backend accepts at most 50 events and 64 KiB per batch. It performs strict
JSON decoding, validates every enum and duration, and applies a per-remote
address batch rate limit. The default is 1,200 batches per minute and can be
changed with `TELEMETRY_RATE_LIMIT_PER_MINUTE` or the Helm value
`telemetry.rateLimitPerMinute`. Remote addresses are used only in memory for
rate limiting and are never exported as labels.

## Prometheus metrics

- `hawaii_resilience_http_requests_total`
- `hawaii_resilience_http_request_duration_seconds`
- `hawaii_resilience_http_in_flight_requests`
- `hawaii_resilience_browser_events_total`
- `hawaii_resilience_browser_event_duration_seconds`
- `hawaii_resilience_browser_telemetry_batches_total`
- `hawaii_resilience_browser_telemetry_rejected_total`
- `hawaii_resilience_afn_source_requests_total`
- `hawaii_resilience_afn_source_request_duration_seconds`
- `hawaii_resilience_afn_profile_responses_total`
- `hawaii_resilience_afn_source_retrieved_timestamp_seconds`
- `hawaii_resilience_afn_source_stale`
- `hawaii_resilience_afn_privacy_masked_observations_total`

HTTP metrics label requests by bounded method, registered route pattern, and
response status. The middleware wraps every registered endpoint, including
health, source catalog, event, risk, live shelter, County shelter-plan,
community, transportation, telemetry ingest, and metrics routes. It never uses
the request URL or query string. County-plan requests use the bounded route
label `/api/v1/shelter-plans`; browser interactions use only the controlled
actions `shelter_county_select`, `shelter_provenance_open`, and
`shelter_plan_retry`, never County names, document titles, or source URLs.

AFN source metrics use only four source labels: `acs-5-year`,
`cdc-svi-2022`, `hhs-empower`, and `fema-nri`. Outcomes are `success` or
`error`; profile completeness is `complete`, `partial`, or `unavailable`.
Retrieved-timestamp and stale gauges describe the latest aggregate source
response; dashboards calculate live data age as `time() - retrieved_timestamp`.
Privacy-mask counters identify only the fixed emPOWER field category and never
export the protected count, planning coordinate, ZIP code, or Census tract.

## Prometheus Operator and Grafana

The backend Helm chart can create a `ServiceMonitor` and a Grafana dashboard
ConfigMap without installing either monitoring system:

```bash
helm upgrade --install hawaii-resilience-backend deploy/backend \
  --set serviceMonitor.enabled=true \
  --set grafanaDashboard.enabled=true \
  # include the existing image and identity values
```

`ServiceMonitor` scrapes the named `http` service port at `/metrics` every 30
seconds by default. Set `serviceMonitor.additionalLabels` when the Prometheus
installation selects monitors by release or team label.

The dashboard ConfigMap uses `grafana_dashboard: "1"` by default for Grafana
sidecar discovery. Change `grafanaDashboard.labels` when the installed sidecar
uses a different selector. The source **Hawaiʻi Mass Care Planner** dashboard is
`deploy/backend/dashboards/hawaii-resilience-backend.json`.

Useful direct queries include:

```promql
sum by (route, status) (rate(hawaii_resilience_http_requests_total[5m]))
```

```promql
histogram_quantile(
  0.95,
  sum by (le, route) (
    rate(hawaii_resilience_http_request_duration_seconds_bucket[5m])
  )
)
```

```promql
histogram_quantile(
  0.95,
  sum by (le, kind, action) (
    rate(hawaii_resilience_browser_event_duration_seconds_bucket[5m])
  )
)
```

```promql
sum by (completeness) (
  rate(hawaii_resilience_afn_profile_responses_total[5m])
)
```

```promql
sum by (source, outcome) (
  rate(hawaii_resilience_afn_source_requests_total[5m])
)
```

```promql
histogram_quantile(
  0.95,
  sum by (le, source) (
    rate(hawaii_resilience_afn_source_request_duration_seconds_bucket[5m])
  )
)
```
