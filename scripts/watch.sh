#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${0}")/.."
APP_ROOT=$(pwd)

function watch_vscode() {
	cd ${APP_ROOT}/packages/vscode
	yarn watch 2>&1 > /dev/null &
	echo "watching vscode"
}

function watch_surf() {
	cd ${APP_ROOT}/scripts/watch
	node watch-customize.js 2>&1 > /dev/null &
	echo "watching surf"
}

function watch_extensions() {
	cd ${APP_ROOT}/extensions/githubsurf
	yarn dev 2>&1 > /dev/null &
	echo "watching extensions"
}

function watch_dist() {
	cd ${APP_ROOT}/scripts/watch
	node watch-dist.js
	echo "auto sync to dist"
}

# execute all necessary tasks
function main() {
	rm -rf "${APP_ROOT}/dist"
	cd "${APP_ROOT}/scripts"
	./package/copy-web.sh
	./package/copy-node_modules.sh
	./package/copy-extensions.sh
	node ./package/generate-config.js
	watch_vscode
	watch_surf
	watch_extensions

	echo 'please wait...'
	while [ ! -e "${APP_ROOT}/packages/vscode/out" ]
	do
		echo "waiting for vscode build..."
		sleep 3
	done
	watch_dist
}

main "$@"
