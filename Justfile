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

	find_browser() {
	  local candidate
	  for candidate in \
	    "${CHROMIUM_BIN:-}" \
	    chromium \
	    chromium-browser \
	    google-chrome \
	    google-chrome-stable
	  do
	    if [[ -n "$candidate" && -x "$candidate" ]]; then
	      printf '%s\n' "$candidate"
	      return 0
	    fi
	    if [[ -n "$candidate" ]] && command -v "$candidate" >/dev/null 2>&1; then
	      command -v "$candidate"
	      return 0
	    fi
	  done

	  node -e "const { chromium } = require('playwright'); console.log(chromium.executablePath())"
	}

	browser_bin="$(find_browser)"
	echo "Launching Chromium with extension from $repo_root"
	echo "Browser: $browser_bin"

	"$browser_bin" \
	  --user-data-dir="$profile_dir" \
	  --no-first-run \
	  --no-default-browser-check \
	  --disable-extensions-except="$repo_root" \
	  --load-extension="$repo_root" \
	  "{{url}}"