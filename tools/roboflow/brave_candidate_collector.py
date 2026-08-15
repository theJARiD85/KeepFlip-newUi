#!/usr/bin/env python3
"""Search Brave Image Search and download its returned candidates locally.

The collect command downloads every result from its configured queries. The tool never
uploads to Roboflow or creates a training dataset manifest.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import mimetypes
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


API_URL = "https://api.search.brave.com/res/v1/images/search"
MAX_IMAGE_BYTES = 100 * 1024 * 1024
SEARCH_MAX_ATTEMPTS = 2
SEARCH_RETRY_DELAY_SECONDS = 2.0
CLASS_LABELS = {
    "tools",
    "electronics_camera",
    "shoes_footwear",
    "handbags_accessories",
    "jewelry",
    "collectibles_toys_media",
    "sports_outdoor",
    "unknown_other",
}
TRUE_VALUES = {"1", "true", "yes"}
REVIEW_COLUMNS = [
    "candidate_id",
    "query_id",
    "query",
    "class_label_suggestion",
    "unknown_other_subtype_suggestion",
    "title",
    "source_page_url",
    "source_host",
    "original_image_url",
    "thumbnail_url",
    "width",
    "height",
    "publisher",
    "license_status",
    "license_url",
    "rights_basis",
    "privacy_scrubbed",
    "framing",
    "reviewed_class_label",
    "review_status",
    "download_allowed",
    "notes",
]
DOWNLOAD_COLUMNS = [
    "candidate_id",
    "local_filename",
    "image_sha256",
    "bytes",
    "source_page_url",
    "original_image_url",
    "rights_basis",
    "license_url",
    "reviewed_class_label",
]


def is_true(value: str | None) -> bool:
    return (value or "").strip().lower() in TRUE_VALUES


def normalise_host(url: str) -> str:
    return urlparse(url).hostname.lower() if urlparse(url).hostname else ""


def matches_domain(host: str, domains: Iterable[str]) -> bool:
    normalised = [domain.strip().lower() for domain in domains if domain.strip()]
    if not normalised:
        return True
    return any(host == domain or host.endswith(f".{domain}") for domain in normalised)


def nested(mapping: dict[str, Any], *keys: str) -> Any:
    current: Any = mapping
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def first_url(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.startswith(("https://", "http://")):
            return value
        if isinstance(value, dict):
            for key in ("url", "src", "href"):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.startswith(("https://", "http://")):
                    return candidate
    return ""


def image_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    direct = payload.get("results")
    if isinstance(direct, list):
        return [result for result in direct if isinstance(result, dict)]
    nested_results = nested(payload, "images", "results")
    if isinstance(nested_results, list):
        return [result for result in nested_results if isinstance(result, dict)]
    return []


def result_to_candidate(result: dict[str, Any], query: dict[str, Any]) -> dict[str, str] | None:
    properties = result.get("properties") if isinstance(result.get("properties"), dict) else {}
    source_value = result.get("source")
    source_page_url = first_url(
        result.get("page_url"),
        nested(result, "source", "url"),
        source_value if isinstance(source_value, str) else None,
        result.get("url"),
    )
    original_image_url = first_url(properties.get("url"), result.get("image_url"))
    thumbnail_url = first_url(result.get("thumbnail"), nested(result, "thumbnail", "src"))
    if not original_image_url:
        return None

    source_host = normalise_host(source_page_url) or normalise_host(original_image_url)
    if not matches_domain(source_host, query.get("source_domains", [])):
        return None

    title = str(result.get("title") or result.get("description") or "").strip()
    candidate_id = hashlib.sha256(
        f"{query['id']}\n{original_image_url}".encode("utf-8")
    ).hexdigest()[:20]

    return {
        "candidate_id": candidate_id,
        "query_id": str(query["id"]),
        "query": str(query["query"]),
        "class_label_suggestion": str(query["class_label"]),
        "unknown_other_subtype_suggestion": str(query.get("unknown_other_subtype", "")),
        "title": title,
        "source_page_url": source_page_url,
        "source_host": source_host,
        "original_image_url": original_image_url,
        "thumbnail_url": thumbnail_url,
        "width": str(properties.get("width") or result.get("width") or ""),
        "height": str(properties.get("height") or result.get("height") or ""),
        "publisher": str(result.get("publisher") or result.get("source") or ""),
        "license_status": "unverified",
        "license_url": "",
        "rights_basis": "",
        "privacy_scrubbed": "",
        "framing": "",
        "reviewed_class_label": "",
        "review_status": "pending",
        "download_allowed": "false",
        "notes": "",
    }


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("Config must be a JSON object.")
    return value


def validate_queries(config: dict[str, Any]) -> list[dict[str, Any]]:
    queries = config.get("queries")
    if not isinstance(queries, list) or not queries:
        raise ValueError("Config must contain a non-empty queries array.")
    seen_ids: set[str] = set()
    validated: list[dict[str, Any]] = []
    for index, query in enumerate(queries, start=1):
        if not isinstance(query, dict):
            raise ValueError(f"Query {index} must be an object.")
        query_id = str(query.get("id", "")).strip()
        text = str(query.get("query", "")).strip()
        label = str(query.get("class_label", "")).strip()
        if not query_id or not text or label not in CLASS_LABELS:
            raise ValueError(f"Query {index} needs id, query, and a valid class_label.")
        if query_id in seen_ids:
            raise ValueError(f"Duplicate query id: {query_id}.")
        seen_ids.add(query_id)
        domains = query.get("source_domains", [])
        if not isinstance(domains, list) or not all(isinstance(domain, str) for domain in domains):
            raise ValueError(f"Query {query_id} source_domains must be an array of domains.")
        if label == "unknown_other" and not str(query.get("unknown_other_subtype", "")).strip():
            raise ValueError(f"Query {query_id} needs unknown_other_subtype.")
        validated.append({**query, "id": query_id, "query": text, "class_label": label})
    return validated


def brave_search(api_key: str, query: str, config: dict[str, Any]) -> dict[str, Any]:
    parameters = {
        "q": query,
        "count": int(config.get("count_per_query", 25)),
        "country": config.get("country", "US"),
        "search_lang": config.get("search_lang", "en"),
        "safesearch": config.get("safesearch", "strict"),
        "spellcheck": "true",
    }
    request = Request(
        f"{API_URL}?{urlencode(parameters)}",
        headers={
            "Accept": "application/json",
            "X-Subscription-Token": api_key,
            "User-Agent": "KeepFlip-Brave-Candidate-Collector/1.0",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Brave Image Search returned HTTP {error.code}: {body}") from error
    except URLError as error:
        raise RuntimeError(f"Could not reach Brave Image Search: {error.reason}") from error
    except OSError as error:
        raise RuntimeError(f"Brave Image Search request failed: {error}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError("Brave Image Search returned invalid JSON.") from error


def write_csv(path: Path, columns: list[str], rows: Iterable[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def collect_candidates(config_path: str) -> list[dict[str, str]]:
    api_key = os.environ.get("BRAVE_SEARCH_API_KEY")
    if not api_key:
        raise RuntimeError("BRAVE_SEARCH_API_KEY is not set.")

    config = read_json(Path(config_path))
    queries = validate_queries(config)
    collected: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    delay_seconds = float(config.get("delay_seconds", 0.5))

    for index, query in enumerate(queries, start=1):
        print(f"[{index}/{len(queries)}] Searching {query['id']}: {query['query']}")
        payload: dict[str, Any] | None = None
        for attempt in range(1, SEARCH_MAX_ATTEMPTS + 1):
            try:
                payload = brave_search(api_key, query["query"], config)
                break
            except RuntimeError as error:
                if attempt == SEARCH_MAX_ATTEMPTS:
                    print(f"Skipped search {query['id']}: {error}", file=sys.stderr)
                    break
                print(
                    f"Search {query['id']} failed ({error}); retrying once...",
                    file=sys.stderr,
                )
                time.sleep(SEARCH_RETRY_DELAY_SECONDS)

        if payload is None:
            if index < len(queries) and delay_seconds > 0:
                time.sleep(delay_seconds)
            continue

        for result in image_results(payload):
            candidate = result_to_candidate(result, query)
            if not candidate or candidate["original_image_url"] in seen_urls:
                continue
            seen_urls.add(candidate["original_image_url"])
            collected.append(candidate)
        if index < len(queries) and delay_seconds > 0:
            time.sleep(delay_seconds)
    return collected


def command_search(arguments: argparse.Namespace) -> int:
    collected = collect_candidates(arguments.config)
    output = Path(arguments.output)
    write_csv(output, REVIEW_COLUMNS, collected)
    print(f"Wrote {len(collected)} candidate(s) to {output}.")
    print("Review each row for rights, privacy, framing, and final category before using it for training.")
    return 0


def safe_extension(content_type: str | None, url: str) -> str:
    from_type = mimetypes.guess_extension((content_type or "").split(";", 1)[0].strip())
    if from_type in {".jpg", ".jpeg", ".png", ".webp", ".avif", ".bmp"}:
        return ".jpg" if from_type == ".jpe" else from_type
    from_url = Path(urlparse(url).path).suffix.lower()
    if from_url in {".jpg", ".jpeg", ".png", ".webp", ".avif", ".bmp"}:
        return from_url
    return ".img"


def clean_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", value).strip("._") or "image"


def download_image(url: str, output_path: Path) -> tuple[str, int]:
    request = Request(url, headers={"User-Agent": "KeepFlip-Approved-Image-Collector/1.0"})
    try:
        with urlopen(request, timeout=45) as response:
            content_type = response.headers.get("Content-Type", "")
            if not content_type.lower().startswith("image/"):
                raise RuntimeError(f"source returned non-image Content-Type: {content_type or 'missing'}")
            expected_length = response.headers.get("Content-Length")
            if expected_length and int(expected_length) > MAX_IMAGE_BYTES:
                raise RuntimeError("source image exceeds the 100 MB collection safety limit")
            data = response.read(MAX_IMAGE_BYTES + 1)
    except HTTPError as error:
        raise RuntimeError(f"HTTP {error.code}") from error
    except URLError as error:
        raise RuntimeError(str(error.reason)) from error
    except OSError as error:
        raise RuntimeError(f"network error: {error}") from error

    if len(data) > MAX_IMAGE_BYTES:
        raise RuntimeError("source image exceeds the 100 MB collection safety limit")
    extension = safe_extension(content_type, url)
    final_path = output_path.with_suffix(extension)
    try:
        final_path.write_bytes(data)
    except OSError as error:
        raise RuntimeError(f"could not save {final_path.name}: {error}") from error
    return hashlib.sha256(data).hexdigest(), len(data)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise RuntimeError(f"could not read existing download {path.name}: {error}") from error
    return digest.hexdigest()


def existing_collect_record(candidate: dict[str, str], downloads_dir: Path) -> dict[str, str] | None:
    candidate_id = clean_filename(candidate["candidate_id"])
    existing = sorted(path for path in downloads_dir.glob(f"{candidate_id}.*") if path.is_file())
    if not existing:
        return None

    local_file = existing[0]
    try:
        byte_count = local_file.stat().st_size
    except OSError as error:
        raise RuntimeError(f"could not inspect existing download {local_file.name}: {error}") from error

    return {
        "candidate_id": candidate["candidate_id"],
        "local_filename": local_file.name,
        "image_sha256": sha256_file(local_file),
        "bytes": str(byte_count),
        "source_page_url": candidate["source_page_url"],
        "original_image_url": candidate["original_image_url"],
        "rights_basis": "unreviewed",
        "license_url": "",
        "reviewed_class_label": candidate["class_label_suggestion"],
    }


def approved_for_download(row: dict[str, str]) -> tuple[bool, str]:
    if row.get("review_status", "").strip().lower() != "approved":
        return False, "review_status is not approved"
    if not is_true(row.get("download_allowed")):
        return False, "download_allowed is not true"
    if row.get("rights_basis", "").strip() not in {"explicitly_licensed", "keepflip_owned"}:
        return False, "rights_basis is not explicitly_licensed or keepflip_owned"
    if not row.get("license_url", "").startswith(("https://", "http://")):
        return False, "license_url is missing"
    if not is_true(row.get("privacy_scrubbed")):
        return False, "privacy_scrubbed is not true"
    if row.get("framing", "").strip() not in {"full_item", "near_full_item"}:
        return False, "framing is not full_item or near_full_item"
    if row.get("reviewed_class_label", "").strip() not in CLASS_LABELS:
        return False, "reviewed_class_label is invalid"
    if not row.get("original_image_url", "").startswith(("https://", "http://")):
        return False, "original_image_url is missing"
    return True, ""


def command_download(arguments: argparse.Namespace) -> int:
    input_path = Path(arguments.reviewed_candidates)
    output_dir = Path(arguments.output_dir)
    with input_path.open("r", newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    output_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[dict[str, str]] = []
    skipped = 0
    failures = 0
    for row in rows:
        allowed, reason = approved_for_download(row)
        if not allowed:
            skipped += 1
            continue
        candidate_id = clean_filename(row.get("candidate_id", "candidate"))
        target = output_dir / candidate_id
        try:
            image_hash, byte_count = download_image(row["original_image_url"], target)
            local_file = next(output_dir.glob(f"{candidate_id}.*"))
            downloaded.append(
                {
                    "candidate_id": row.get("candidate_id", ""),
                    "local_filename": local_file.name,
                    "image_sha256": image_hash,
                    "bytes": str(byte_count),
                    "source_page_url": row.get("source_page_url", ""),
                    "original_image_url": row.get("original_image_url", ""),
                    "rights_basis": row.get("rights_basis", ""),
                    "license_url": row.get("license_url", ""),
                    "reviewed_class_label": row.get("reviewed_class_label", ""),
                }
            )
            print(f"Downloaded {candidate_id}.")
        except RuntimeError as error:
            failures += 1
            print(f"Skipped {candidate_id}: {error}", file=sys.stderr)

    write_csv(output_dir / "download-manifest.csv", DOWNLOAD_COLUMNS, downloaded)
    print(f"Downloaded {len(downloaded)} approved image(s); skipped {skipped}; failures {failures}.")
    if failures:
        return 1
    return 0


def command_collect(arguments: argparse.Namespace) -> int:
    output_dir = Path(arguments.output_dir)
    downloads_dir = output_dir / "downloads"
    candidates = collect_candidates(arguments.config)
    write_csv(output_dir / "candidates.csv", REVIEW_COLUMNS, candidates)

    downloads_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[dict[str, str]] = []
    manifest_path = output_dir / "download-manifest.csv"
    write_csv(manifest_path, DOWNLOAD_COLUMNS, downloaded)
    failures = 0
    for candidate in candidates:
        candidate_id = clean_filename(candidate["candidate_id"])
        try:
            existing_record = existing_collect_record(candidate, downloads_dir)
            if existing_record:
                downloaded.append(existing_record)
                print(f"Already have {candidate_id}.")
            else:
                image_hash, byte_count = download_image(candidate["original_image_url"], downloads_dir / candidate_id)
                local_file = next(downloads_dir.glob(f"{candidate_id}.*"))
                downloaded.append(
                    {
                        "candidate_id": candidate["candidate_id"],
                        "local_filename": local_file.name,
                        "image_sha256": image_hash,
                        "bytes": str(byte_count),
                        "source_page_url": candidate["source_page_url"],
                        "original_image_url": candidate["original_image_url"],
                        "rights_basis": "unreviewed",
                        "license_url": "",
                        "reviewed_class_label": candidate["class_label_suggestion"],
                    }
                )
                print(f"Downloaded {candidate_id}.")
            write_csv(manifest_path, DOWNLOAD_COLUMNS, downloaded)
        except RuntimeError as error:
            failures += 1
            print(f"Skipped {candidate_id}: {error}", file=sys.stderr)

    write_csv(manifest_path, DOWNLOAD_COLUMNS, downloaded)
    print(
        f"Collected {len(downloaded)} image(s) into {downloads_dir}; "
        f"{failures} download(s) failed. Review candidates.csv before any training use."
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    search = commands.add_parser("search", help="Search Brave Image Search and write a review queue.")
    search.add_argument("--config", required=True, help="Path to query configuration JSON.")
    search.add_argument("--output", required=True, help="CSV path for candidate review rows.")
    search.set_defaults(handler=command_search)

    download = commands.add_parser("download", help="Download only manually approved review rows.")
    download.add_argument("--reviewed-candidates", required=True, help="Reviewed candidate CSV path.")
    download.add_argument("--output-dir", required=True, help="Quarantine output directory.")
    download.set_defaults(handler=command_download)

    collect = commands.add_parser("collect", help="Search Brave and download a candidate quarantine set.")
    collect.add_argument("--config", required=True, help="Path to query configuration JSON.")
    collect.add_argument("--output-dir", required=True, help="Quarantine output directory.")
    collect.set_defaults(handler=command_collect)
    return parser


def main() -> int:
    parser = build_parser()
    arguments = parser.parse_args()
    return arguments.handler(arguments)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
