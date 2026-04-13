#!/usr/bin/env bash
set -euo pipefail

ELECTROBUN=""
if [ -x "./node_modules/electrobun/.cache/electrobun" ]; then
	ELECTROBUN="./node_modules/electrobun/.cache/electrobun"
else
	ELECTROBUN="./node_modules/.bin/electrobun"
fi

case "${1:-}" in
	dev)
		ROOT="$(pwd)"
		bun run build:renderer
		trap 'kill 0' EXIT INT TERM
		bunx concurrently --kill-others \
			"bun --watch scripts/build-renderer.ts" \
			"bun run scripts/watch-server.ts" &
		wait
		;;
	*)
		exec "$ELECTROBUN" "$@"
		;;
esac
