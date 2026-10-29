#!/bin/sh

set -eu

if [ "${1:-}" != "--yes" ]; then
	echo "This creates billable Azure resources, including an AKS cluster."
	echo "Run $0 --yes after reviewing infra/main.bicep."
	exit 2
fi

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
resource_group="${AZURE_RESOURCE_GROUP:-hawaii-resilience-dev}"
deployment_name="${AZURE_DEPLOYMENT_NAME:-hawaii-resilience-dev}"
location="${AZURE_LOCATION:-westus3}"
github_repository="${GITHUB_REPOSITORY:-HAIC-2026/Ohana-Compute}"
github_environment="${GITHUB_ENVIRONMENT:-development}"

command -v az >/dev/null 2>&1 || {
	echo "Azure CLI is required." >&2
	exit 1
}

bootstrap_principal_id=$(az ad signed-in-user show --query id --output tsv)

az group create \
	--name "$resource_group" \
	--location "$location" \
	--output none

az deployment group create \
	--name "$deployment_name" \
	--resource-group "$resource_group" \
	--template-file "$repo_root/infra/main.bicep" \
	--parameters \
	location="$location" \
	githubRepository="$github_repository" \
	githubEnvironment="$github_environment" \
	bootstrapPrincipalId="$bootstrap_principal_id" \
	--output none

deployment_client_id=$(az deployment group show \
	--name "$deployment_name" \
	--resource-group "$resource_group" \
	--query properties.outputs.deploymentIdentityClientId.value \
	--output tsv)
tenant_id=$(az account show --query tenantId --output tsv)
subscription_id=$(az account show --query id --output tsv)

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
	gh api \
		--method PUT \
		"repos/$github_repository/environments/$github_environment" \
		--silent
	gh variable set AZURE_CLIENT_ID \
		--env "$github_environment" \
		--repo "$github_repository" \
		--body "$deployment_client_id"
	gh variable set AZURE_TENANT_ID \
		--env "$github_environment" \
		--repo "$github_repository" \
		--body "$tenant_id"
	gh variable set AZURE_SUBSCRIPTION_ID \
		--env "$github_environment" \
		--repo "$github_repository" \
		--body "$subscription_id"
	gh variable set AZURE_RESOURCE_GROUP \
		--env "$github_environment" \
		--repo "$github_repository" \
		--body "$resource_group"
	gh variable set AZURE_DEPLOYMENT_NAME \
		--env "$github_environment" \
		--repo "$github_repository" \
		--body "$deployment_name"
fi

echo "Provisioned $resource_group in $location."
echo "Next: ./infra/scripts/sync-census-key.sh"
