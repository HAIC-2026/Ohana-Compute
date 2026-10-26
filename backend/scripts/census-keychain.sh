#!/bin/sh

set -eu

service="hawaii-resilience-map-census-api"
account="${USER:?USER must be set}"
backend_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

case "${1:-run}" in
	store)
		echo "Enter the Census API key when prompted. Input will be hidden."
		security add-generic-password \
			-U \
			-a "$account" \
			-s "$service" \
			-l "Hawaiʻi Resilience Map Census API" \
			-T "" \
			-w
		;;
	run)
		CENSUS_API_KEY=$(security find-generic-password \
			-a "$account" \
			-s "$service" \
			-w)
		export CENSUS_API_KEY
		cd "$backend_dir"
		exec go run ./cmd/server
		;;
	delete)
		security delete-generic-password \
			-a "$account" \
			-s "$service"
		;;
	*)
		echo "Usage: $0 [store|run|delete]" >&2
		exit 2
		;;
esac
