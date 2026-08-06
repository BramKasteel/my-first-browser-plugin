set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

solve:
	#!/usr/bin/env bash
	cd /home/bram/repos/my-first-browser-plugin/optimizer-api
	source .venv/bin/activate
	uv run python -m app.solver

playwright mode='headed':
	#!/usr/bin/env bash
	set -eu -o pipefail
	if [[ "{{mode}}" == "headless" ]]; then
	  PW_HEADLESS=1 npx playwright test
	else
	  PW_HEADLESS=0 npx playwright test --headed
	fi


playwright-capture mode='headed' log='' extra='':
	#!/usr/bin/env bash
	set -euo pipefail

	mkdir -p test-results/playwright
	if [[ -n "{{log}}" ]]; then
	  log_path="{{log}}"
	else
	  log_path="test-results/playwright/$(date +%Y%m%d-%H%M%S)-{{mode}}.log"
	fi

	echo "Capturing Playwright output to $log_path"
	if [[ "{{mode}}" == "headless" ]]; then
	  stdbuf -oL -eL env PW_HEADLESS=1 npx playwright test {{extra}} 2>&1 | tee "$log_path"
	else
	  stdbuf -oL -eL env PW_HEADLESS=0 npx playwright test --headed {{extra}} 2>&1 | tee "$log_path"
	fi

	exit "${PIPESTATUS[0]}"


playwright-report:
    npx playwright show-report


open-cardmarket url='https://www.cardmarket.com/en/Magic/Wants':
	#!/usr/bin/env bash
	set -eu -o pipefail

	repo_root="$PWD"
	profile_dir="$(mktemp -d)"
	trap 'rm -rf "$profile_dir"' EXIT

	echo "Launching Chromium with extension from $repo_root"
	OPEN_CARDMARKET_URL="{{url}}" REPO_ROOT="$repo_root" PROFILE_DIR="$profile_dir" node scripts/open-cardmarket.js


release-zip version:
	#!/usr/bin/env bash
	set -eu -o pipefail

	archive="release/cardmarket-optimizer-{{version}}.zip"
	mkdir -p release

	if [[ -e "$archive" ]]; then
	  echo "Release archive already exists: $archive" >&2
	  exit 1
	fi

	zip -r "$archive" \
	  manifest.json \
	  background.js \
	  config.js \
	  seller-filter-utils.js \
	  popup.html \
	  popup*.js \
	  icons/icon-16.png \
	  icons/icon-32.png \
	  icons/icon-48.png \
	  icons/icon-128.png \
	  icons/icon-512.png \
	  icons/bank-transfer-qr.svg

	echo "Created $archive"


release version:
	#!/usr/bin/env bash
	set -eu -o pipefail

	archive="release/cardmarket-optimizer-{{version}}.zip"
	if [[ -e "$archive" ]]; then
	  echo "Release archive already exists: $archive" >&2
	  exit 1
	fi

	sed -E -i 's/"version": "[^"]+"/"version": "{{version}}"/' manifest.json
	sed -E -i 's/(<p class="eyebrow">Version )[0-9A-Za-z._-]+(<\/p>)/\1{{version}}\2/' popup.html

	just release-zip {{version}}