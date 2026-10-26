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
  `layer_toggle`, `map_interact`, `activate`, `change`, `submit`, or `keyboard`
- `category`: a fixed element category such as `button`, `select`, `map`, or
  `page`
- `route`: `home` or `other`; raw paths and query strings are never sent
- `viewport`: `small`, `medium`, or `large`
- `outcome`: `success`, `error`, or `unknown`

Page lifecycle timings cover navigation response, DOM content loaded, browser
load, React hydration, and map ready. Semantic interactions are captured at the
document boundary, while the Event Timing API supplies additional end-to-end
interaction duration where supported.

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

HTTP metrics label requests by bounded method, registered route pattern, and
response status. They never use the request URL or query string.

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
uses a different selector. The source dashboard is
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
