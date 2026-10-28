# Grounded planning assist

Planning assist is a server-side, disabled-by-default drafting boundary inside
the authenticated collaborative-plan workflow. It is not a chatbot, decision
maker, approval system, alerting channel, partner activation mechanism, or
source of legal orders.

The [Waiʻanae fictional assistance case](waianae-assistance-case.md) is a
separate deterministic workflow. Its fictional persona, map snapshot and
editable timing assumptions are not in this server-owned evidence contract
and are not sent to a provider. The case does not demonstrate live AI
inference; existing test-provider evaluations must not be presented as that.
The case's local structured planning claims and evidence-to-question comparisons
are also deterministic and excluded from provider requests. They are browser-only,
unverified exercise contributions, not authorized shared-plan records or new
server-owned citations. Reusing these controls in a provider request requires a
separate bounded contract and citation/policy evaluations; no generic prompt
field or provider is enabled by this feature.

## Data boundary

The browser sends only the plan reference in the route plus the expected
revision and controlled `operation` and `style` enums. The backend loads the
stored plan and builds a bounded provider context from:

- the controlled hazard token;
- controlled jurisdiction and selected planning-area reference tokens;
- catalog-backed source IDs, authority, data class, integration state,
  freshness state, and up to three published limitations;
- controlled Map/Model/Match output stage, reference, and
  available/partial/unavailable state; and
- aggregate demand line IDs with modeled/unavailable and modeled-gap states;
- partner capability IDs with matched/unmatched/stale state while operational
  status, capacity, and activation remain explicitly unvalidated; and
- explicit unavailable or unverified operational gaps.

The provider context excludes plan titles, plan summaries, checklist text,
comments, assignments, approvals, resident addresses, coordinates, names,
identifiers, person-level medical data, raw source payloads, arbitrary prompts,
tokens, and provider credentials. Source material is serialized as untrusted
data and the provider instruction explicitly rejects instructions embedded in
evidence.

## Research decision

The smallest defensible boundary is a vendor-neutral Go provider interface
behind a server-owned service that builds context, validates citations and
policy, and requires a separate human apply action. The production adapter is
more precisely an **OpenAI Responses-compatible** HTTPS adapter: the interface
is portable, but the wire format is not universally supported by products
described as "OpenAI-compatible."

This decision was reviewed on 2026-10-27 against official documentation and
source repositories:

- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses/create)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [OpenAI API OpenAPI description](https://github.com/openai/openai-openapi/blob/master/openapi.yaml)
- [OWASP LLM01: Prompt Injection](https://github.com/GenAI-Security-Project/GenAI-LLM-Top10/blob/2026/final/LLM01_PromptInjection.md)
- [OWASP LLM03: Excessive Agency](https://github.com/GenAI-Security-Project/GenAI-LLM-Top10/blob/2026/final/LLM03_ExcessiveAgency.md)
- [OWASP LLM10: Improper Output Handling](https://github.com/GenAI-Security-Project/GenAI-LLM-Top10/blob/2026/final/LLM10_ImproperOutputHandling.md)
- [NIST AI RMF Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)

The rendered OpenAI, OWASP, and NIST documentation hosts did not resolve in the
review environment, and independent search retries timed out. Their official
GitHub source repositories were reachable. OpenAI's API description confirms
HTTP token authentication and notes that strict mode supports only a subset of
JSON Schema. OWASP guidance separately requires deterministic mediation,
approval before state-changing actions, bounded consumption, and untrusted
output handling. Strict schema output is therefore only a syntax and shape
control; it does not establish factual support, neutralize instructions inside
evidence, or replace server-side citation and policy validation.

Counter-evidence and residual limitations:

- Responses-style compatibility is narrower than the more commonly emulated
  Chat Completions surface.
- Authentication, endpoint versioning, and model/deployment semantics differ
  across vendors. For example, the
  [Azure OpenAI client](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/openai/Azure.AI.OpenAI/src/Custom/AzureOpenAIClient.cs)
  supports an `api-key` header and its
  [request builder](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/openai/Azure.AI.OpenAI/src/Utility/AzureOpenAIPipelineMessageBuilder.cs)
  adds an `api-version` query parameter; both differ from this adapter's fixed
  authorization header and query-free endpoint contract.
- The endpoint is operator-controlled rather than request-controlled, but DNS
  resolution is not IP-pinned.
- Lexical policy checks are auditable and fail closed, but may over-block or
  miss paraphrased claims; human review remains mandatory.
- The draft cache and subject limiter are process-local and support only the
  documented single-replica deployment.

## Provider contract

The Go service depends on an injectable provider interface. Deterministic tests
use an in-process fake. The production adapter implements a constrained
OpenAI Responses-compatible HTTPS contract with:

- exact endpoint and model allowlists;
- HTTPS-only URLs with no user info, query, or fragment;
- redirects disabled;
- a required external API-key environment variable or mounted secret file;
- a required timeout no greater than 30 seconds;
- 32 KiB request, 64 KiB response, 4,096-token, and 12 KiB structured-output
  ceilings; and
- generic error messages that do not return provider bodies, keys, endpoints,
  model identifiers, or upstream diagnostics.

Configuration is fail closed. `GROUNDED_AI_MODE` defaults to `disabled`.
Selecting `openai-compatible` requires all of:

- `GROUNDED_AI_ENDPOINT`
- `GROUNDED_AI_ALLOWED_ENDPOINTS`
- `GROUNDED_AI_MODEL`
- `GROUNDED_AI_ALLOWED_MODELS`
- `GROUNDED_AI_API_KEY` or `GROUNDED_AI_API_KEY_FILE`
- `GROUNDED_AI_TIMEOUT`
- `GROUNDED_AI_MAX_OUTPUT_TOKENS`

Partial settings fail startup. Do not place credential values, private
endpoints, tenant identifiers, or selected model identifiers in source
control, browser configuration, screenshots, logs, metrics, fixtures, or pull
request text.

The production HTTP server and browser generation request allow a 35-second
response window, preserving margin around the maximum 30-second provider
deadline. Other browser API requests retain the shorter default timeout.

## Citation and policy enforcement

Provider output must match the strict structured schema. Every claim and action
requires at least one source ID from the exact server-built allowlist. The
backend enriches accepted source IDs with catalog authority and URL; the
provider cannot supply a URL. Unknown or missing citations, duplicate or
invalid output IDs, unsupported URLs, oversized fields, trailing JSON, and
unknown JSON fields fail closed.

The hard policy validator blocks drafts that imply:

- legal evacuation orders, mandatory evacuation, or an all-clear;
- partner activation, assignment, confirmed capacity, or availability;
- shelter opening, route passability, or road opening;
- official agency approval;
- person-specific medical advice;
- invented quantitative values; or
- unavailable data represented as zero, normal, no outage, or no unmet need.

Provider, network, timeout, parse, citation, and policy failures return explicit
unavailable or blocked states. They never return a success-shaped draft.

## Human review workflow

Generation changes nothing. A planner reviews individual sections and actions,
expands source citations, and either rejects the draft or explicitly applies
selected content. Application rechecks the plan revision and creates a normal
immutable collaborative version under the authenticated human role. The
version and audit event carry only:

- `provider_policy_version`; and
- the SHA-256 `input_context_hash`.

They do not retain credentials, tokens, subjects, prompts, provider request or
response bodies, model output labels, or a model identifier. A stale revision
returns `409`; expired and rejected drafts cannot be applied.

Anonymous and local-only workflows never expose planning assist. The local
checklist, field packet, and shared planning functions continue when the
provider is disabled or unavailable.

## Deployment and operations

The Helm chart defaults `groundedPlanning.mode` to `disabled`. Enabling it
requires OIDC identity and SQLite collaboration persistence, the public
configuration values above, and a mounted Key Vault secret selected by
`azure.groundedPlanningSecretName`. Credential provisioning is an external
operator step.

Drafts are held in a bounded 20-minute in-memory review cache. This is
appropriate for the current single-replica SQLite deployment. Horizontal
scaling requires a shared encrypted draft store before enabling multiple
replicas.

The service rate-limits generation per hashed authenticated subject. Prometheus
exports only bounded `operation`, `outcome`, and `provider_class` labels through
`hawaii_resilience_grounded_planning_operations_total`. Provider endpoints,
model identifiers, plan IDs, subjects, content, and credentials are never
labels.

## Limitations

- Provider credentials and approved endpoint/model selections are not
  provisioned by this repository.
- Provider synthesis cannot establish current operational truth.
- Catalog freshness may be `not_provided`; that state is not current.
- Planning assist does not create approvals, assignments, alerts, public
  guidance, or operational activations.
- The production adapter targets a Responses-style structured-output shape,
  but compatibility requires operator validation against the selected
  provider before enablement.
