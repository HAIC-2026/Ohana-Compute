# Development AKS environment

The development environment uses:

- AKS in West US 3
- Azure Container Registry
- Azure Key Vault
- AKS Workload Identity
- Secrets Store CSI Driver with secret rotation
- GitHub Actions OIDC for deployments

The Census API key is never stored in GitHub. Local development reads it from
macOS Keychain. AKS reads the same value from Key Vault through workload
identity.

Application identity is separate from Azure workload identity. The backend
chart defaults `identity.mode` to `disabled`, so the public planner remains
anonymous and local-only. Future OIDC values are public issuer/audience/client
metadata, not secrets; no user token, client secret, signing key, or Microsoft
Graph token belongs in Key Vault or the chart for this foundation slice. The
provider verifier and approved tenant/application setup remain blocked
external. See [`docs/identity-foundation.md`](../docs/identity-foundation.md).

Collaborative plan persistence is also disabled by default. To enable the
single-replica SQLite deployment, set
`collaboration.persistence=sqlite`; the chart creates a `ReadWriteOnce` PVC,
mounts the configured database directory, and rejects `replicaCount != 1`.
SQLite is durable for this deployment shape but is not multi-replica HA. Use
the cluster volume-snapshot/backup service and plan an external database driver
before scaling the backend horizontally. See
[`docs/collaborative-plans.md`](../docs/collaborative-plans.md).

Grounded planning assist is independently disabled by default. It can be
enabled only with configured application identity, SQLite collaboration
persistence, exact endpoint/model allowlists, bounded timeout/output settings,
and an externally provisioned API key mounted from Key Vault. No provider
credential, private endpoint, tenant identifier, or deployed model identifier
belongs in GitHub variables, chart defaults, logs, metrics, screenshots, or
pull request text. See
[`docs/grounded-planning.md`](../docs/grounded-planning.md).

## Prerequisites

- Azure CLI signed in to the intended subscription
- Permission to create resource groups, role assignments, AKS, ACR, identities,
  and Key Vault
- GitHub CLI signed in as an administrator of
  `HAIC-2026/Ohana-Compute`
- Helm and kubectl for local inspection

## 1. Store the local key

```bash
./backend/scripts/census-keychain.sh store
```

## 2. Provision development infrastructure

Review `infra/main.bicep`, then run:

```bash
./infra/scripts/provision-dev.sh --yes
```

This creates billable Azure resources. The script also creates the GitHub
`development` environment and configures its non-secret Azure OIDC variables.

## 3. Copy the key from Keychain to Key Vault

```bash
./infra/scripts/sync-census-key.sh
```

The value moves through a pipe and is not placed in a command argument,
repository file, GitHub secret, or Kubernetes manifest.

## 4. Deploy the backend

```bash
gh workflow run deploy-dev-backend.yml \
  --repo HAIC-2026/Ohana-Compute
```

The workflow builds the backend image, pushes it to ACR, deploys the Helm
release, and reports the development load-balancer address.

### Repository migration

The canonical repository is `HAIC-2026/Ohana-Compute`. Moving Git history does
not move an existing cloud identity trust or deployment configuration.
Before running deployments from the new repository, an authorized operator
must review/update the deployment identity's federated subject to
`repo:HAIC-2026/Ohana-Compute:environment:development`, configure the new
repository's `development` environment and approved variables, and verify its
protection rules. Apply changes through the existing infrastructure ownership
process; do not recreate infrastructure or substitute credentials to bypass
identity setup. The migration itself does not provision or deploy anything.

## 5. Enable Prometheus and Grafana discovery

The backend exposes Prometheus metrics at `/metrics`. After a Prometheus
Operator and Grafana dashboard sidecar are available in the cluster, enable the
optional chart resources:

```bash
helm upgrade --install hawaii-resilience-backend deploy/backend \
  --reuse-values \
  --set serviceMonitor.enabled=true \
  --set grafanaDashboard.enabled=true \
  --wait
```

If Prometheus selects `ServiceMonitor` resources by label, also set the required
`serviceMonitor.additionalLabels`. If the Grafana sidecar uses a different
dashboard discovery label, override `grafanaDashboard.labels`.

Verify the resources and scrape endpoint:

```bash
kubectl get servicemonitor hawaii-resilience-backend
kubectl get configmap hawaii-resilience-backend-dashboard
kubectl port-forward service/hawaii-resilience-backend 8080:80
curl --fail http://127.0.0.1:8080/metrics
```

Open the **Hawaiʻi Mass Care Planner** dashboard in Grafana after the sidecar has
loaded the ConfigMap and select the cluster Prometheus data source. See
[`docs/observability.md`](../docs/observability.md) for metric names, bounded
labels, privacy guarantees, and direct PromQL queries.

## Secret flow

```text
Local development:
macOS Keychain -> CENSUS_API_KEY process environment -> Go backend

AKS development:
Azure Key Vault -> AKS Workload Identity -> Secrets Store CSI Driver
-> read-only mounted file -> CENSUS_API_KEY_FILE -> Go backend

Planner application identity:
disabled by default -> anonymous local-only planner
future approved OIDC metadata + cryptographic verifier -> guarded server writes

Collaborative plan storage:
disabled by default -> local checklist/export only
explicit SQLite + PVC + one replica -> durable versions and audit history

Grounded planning provider:
disabled by default -> shared planning works without AI
external Key Vault secret + exact public config allowlists -> review-only drafts
```
