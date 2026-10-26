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

## Prerequisites

- Azure CLI signed in to the intended subscription
- Permission to create resource groups, role assignments, AKS, ACR, identities,
  and Key Vault
- GitHub CLI signed in as an administrator of
  `chokevin/hawaii-resilience-map`
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
  --repo chokevin/hawaii-resilience-map
```

The workflow builds the backend image, pushes it to ACR, deploys the Helm
release, and reports the development load-balancer address.

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
```
