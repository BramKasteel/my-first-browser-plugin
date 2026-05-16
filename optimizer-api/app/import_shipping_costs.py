from __future__ import annotations

import json
import logging
from argparse import ArgumentParser
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .shipping import SHIPPING_DATA_PATH, normalize_country_name

BASE_URL = "https://help.cardmarket.com"
DEFAULT_LOCALE = "en"
DEFAULT_DELAY_SECONDS = 1.0
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_RETRIES = 4
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
LOGGER = logging.getLogger(__name__)


def _configure_logging(*, verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )


def _request_json(url: str, *, locale: str, retries: int = DEFAULT_RETRIES) -> object:
    request = Request(
        url,
        headers={
            "accept": "application/json, text/plain, */*",
            "referer": f"{BASE_URL}/{locale}/ShippingCosts",
            "user-agent": USER_AGENT,
        },
    )
    for attempt in range(retries):
        try:
            LOGGER.debug("Requesting %s", url)
            with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError) as exc:
            if attempt + 1 >= retries:
                raise RuntimeError(f"Request failed for {url}: {exc}") from exc
            LOGGER.warning(
                "Request failed for %s on attempt %d/%d: %s. Retrying in %ds.",
                url,
                attempt + 1,
                retries,
                exc,
                2**attempt,
            )
            sleep(2**attempt)
    raise RuntimeError(f"Request failed for {url}")


def _fetch_countries(locale: str) -> list[dict[str, object]]:
    params = urlencode({"page": 0, "limit": 50, "locale": locale, "preview": "false"})
    payload = _request_json(f"{BASE_URL}/api/countries?{params}", locale=locale)
    items = payload.get("items", []) if isinstance(payload, dict) else []
    return [
        item
        for item in items
        if item.get("externalId") not in (None, 0) and item.get("name")
    ]


def _fetch_route_methods(
    *, locale: str, from_country_id: int, to_country_id: int
) -> list[dict[str, object]]:
    params = urlencode(
        {
            "locale": locale,
            "fromCountry": from_country_id,
            "toCountry": to_country_id,
            "preview": "false",
        }
    )
    payload = _request_json(f"{BASE_URL}/api/shippingCosts?{params}", locale=locale)
    if not isinstance(payload, list):
        raise RuntimeError(
            f"Unexpected shipping response for {from_country_id}->{to_country_id}: {payload!r}"
        )
    return payload


def _selected_countries(
    countries: Iterable[dict[str, object]],
    *,
    allowed_names: set[str],
) -> list[dict[str, object]]:
    if not allowed_names:
        return list(countries)
    return [
        country
        for country in countries
        if normalize_country_name(str(country["name"])) in allowed_names
    ]


def build_shipping_snapshot(
    *,
    locale: str,
    delay_seconds: float,
    from_country_filters: set[str],
    to_country_filters: set[str],
) -> dict[str, object]:
    LOGGER.info("Fetching country list for locale=%s", locale)
    countries = _fetch_countries(locale)
    from_countries = _selected_countries(countries, allowed_names=from_country_filters)
    to_countries = _selected_countries(countries, allowed_names=to_country_filters)
    total_routes = len(from_countries) * len(to_countries)
    LOGGER.info(
        "Import starting: %d sender countries x %d receiver countries = %d routes",
        len(from_countries),
        len(to_countries),
        total_routes,
    )

    routes = []
    route_index = 0
    for from_country in from_countries:
        for to_country in to_countries:
            route_index += 1
            LOGGER.info(
                "Route %d/%d: %s -> %s",
                route_index,
                total_routes,
                from_country["name"],
                to_country["name"],
            )
            methods = _fetch_route_methods(
                locale=locale,
                from_country_id=int(from_country["externalId"]),
                to_country_id=int(to_country["externalId"]),
            )
            routes.append(
                {
                    "from_country": from_country["name"],
                    "from_country_id": int(from_country["externalId"]),
                    "to_country": to_country["name"],
                    "to_country_id": int(to_country["externalId"]),
                    "methods": methods,
                }
            )
            LOGGER.info(
                "Route %d/%d done: %s -> %s (%d methods)",
                route_index,
                total_routes,
                from_country["name"],
                to_country["name"],
                len(methods),
            )
            sleep(delay_seconds)

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "source": f"{BASE_URL}/{locale}/ShippingCosts",
        "countries": countries,
        "routes": routes,
    }


def main(argv: list[str] | None = None) -> int:
    parser = ArgumentParser(
        description="Import Cardmarket shipping methods into local optimizer dataset."
    )
    parser.add_argument("--locale", default=DEFAULT_LOCALE)
    parser.add_argument("--delay-seconds", type=float, default=DEFAULT_DELAY_SECONDS)
    parser.add_argument("--output", type=Path, default=SHIPPING_DATA_PATH)
    parser.add_argument("--from-country", action="append", default=[])
    parser.add_argument("--to-country", action="append", default=[])
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)
    _configure_logging(verbose=args.verbose)

    try:
        snapshot = build_shipping_snapshot(
            locale=args.locale,
            delay_seconds=args.delay_seconds,
            from_country_filters={
                normalize_country_name(country) for country in args.from_country
            },
            to_country_filters={
                normalize_country_name(country) for country in args.to_country
            },
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
        LOGGER.info(
            "Saved %d routes for %d countries to %s",
            len(snapshot["routes"]),
            len(snapshot["countries"]),
            args.output,
        )
        return 0
    except KeyboardInterrupt:
        LOGGER.warning("Import interrupted by user")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
