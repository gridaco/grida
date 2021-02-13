#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${0}")/../.."
APP_ROOT=$(pwd)

function main() {
	cd ${APP_ROOT}
	mkdir -p dist
	if [ "${IS_BUILD-}" ];
	then
		cp web/index.html dist/index.html
	else
		cp web/index-dev.html dist/index.html
	fi
	cp web/favicon.png dist
	cp web/manifest.json dist

	echo "copy web done!"
}

main "$@"
