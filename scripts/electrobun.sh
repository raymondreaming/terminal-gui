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
		exec bunx concurrently \
			"bun --watch scripts/build-renderer.ts" \
			"TERMINAL_GUI_APP_ROOT=$ROOT $ELECTROBUN dev"
		;;
	*)
		exec "$ELECTROBUN" "$@"
		;;
esac
