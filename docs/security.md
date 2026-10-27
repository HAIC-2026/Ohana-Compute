# Security boundaries

The planner uses public aggregate data and must not collect or transmit
person-level emergency-management data. Identity, collaboration persistence,
and grounded planning are disabled by default and fail closed when partially
configured.

## Grounded planning

Planning assist is available only behind authenticated collaboration read/write
capabilities. The browser cannot send an arbitrary prompt. Provider context is
constructed on the server from controlled plan fields and catalog evidence;
titles, summaries, comments, resident input, addresses, coordinates, names,
identifiers, medical details, raw payloads, and tokens are excluded.

The production adapter requires exact HTTPS endpoint and model allowlists,
refuses redirects, bounds time and body size, uses an externally supplied
secret, and returns secret-safe errors. Provider responses are untrusted until
strict JSON, citation allowlist, URL, size, and hard policy validation succeed.
Schema conformance is not the security boundary and must never bypass the
server-side citation or policy checks. Rejected or failed output cannot be
applied.

Generation is non-mutating. Application requires a separate authenticated
human action, rechecks optimistic concurrency, and records only the policy
version and input-context hash as assistance provenance. No credential,
provider body, arbitrary prompt, model output, plan content, subject, or token
is logged or exported as telemetry.

See [`grounded-planning.md`](./grounded-planning.md) for the complete contract,
configuration, policy list, operational limitations, and deployment shape.
