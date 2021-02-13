#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${0}")/../.."
APP_ROOT=$(pwd)

# build vscode source and vscode builtin extensions
function main() {
	cd ${APP_ROOT}
	rsync -a ${pwd}/gulp-githubsurf.js packages/vscode
	cd packages/vscode

	yarn gulp compile-build
	yarn gulp optimize --gulpfile ./gulp-githubsurf.js
	yarn gulp minify --gulpfile ./gulp-githubsurf.js

	echo "build vscode done!"
}

main "$@"
