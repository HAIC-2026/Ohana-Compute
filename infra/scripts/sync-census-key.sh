#!/bin/sh

set -eu

resource_group="${AZURE_RESOURCE_GROUP:-hawaii-resilience-dev}"
deployment_name="${AZURE_DEPLOYMENT_NAME:-hawaii-resilience-dev}"
service="hawaii-resilience-map-census-api"
account="${USER:?USER must be set}"

command -v az >/dev/null 2>&1 || {
	echo "Azure CLI is required." >&2
	exit 1
}
command -v security >/dev/null 2>&1 || {
	echo "macOS Keychain is required." >&2
	exit 1
}

key_vault_name=$(az deployment group show \
	--name "$deployment_name" \
	--resource-group "$resource_group" \
	--query properties.outputs.keyVaultName.value \
	--output tsv)

security find-generic-password \
	-a "$account" \
	-s "$service" \
	-w |
	az keyvault secret set \
		--vault-name "$key_vault_name" \
		--name census-api-key \
		--file /dev/stdin \
		--encoding utf-8 \
		--output none

echo "Updated census-api-key in Key Vault $key_vault_name."
