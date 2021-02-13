#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${0}")/../.."
APP_ROOT=$(pwd)

# sync customize/* to vscode
function main() {
	cd ${APP_ROOT}
	rsync -a customize/ packages/vscode/src
}

main "$@"
