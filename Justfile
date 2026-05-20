set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

playwright mode='headed':
	#!/usr/bin/env bash
	set -eu -o pipefail

	if [[ "{{mode}}" == "headless" ]]; then
	  PW_HEADLESS=1 npx playwright test
	else
	  PW_HEADLESS=0 npx playwright test --headed
	fi