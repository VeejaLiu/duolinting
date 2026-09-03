from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from .models import Course

SUPPORTED_MEDIA_SUFFIXES = {
    ".aac",
    ".avi",
    ".flac",
    ".flv",
    ".m4a",
    ".m4v",
    ".mkv",
    ".mp3",
    ".mov",
    ".mp4",
    ".ogg",
    ".ts",
    ".wav",
    ".webm",
}


def normalized_name(value: str) -> str:
    """Normalize a title/stem for conservative cross-platform filename matching."""

    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[^\w]+", "", normalized, flags=re.UNICODE)


def load_media_manifest(path: Path) -> dict[str, Path]:
    try:
        with path.open("r", encoding="utf-8") as file:
            raw = json.load(file)
    except FileNotFoundError as error:
        raise ValueError(f"Media manifest does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Media manifest is not valid JSON: {path}") from error

    if not isinstance(raw, dict):
        raise ValueError("Media manifest must be a JSON object keyed by course ID")

    result: dict[str, Path] = {}
    for course_id, entry in raw.items():
        if isinstance(entry, str):
            raw_path = entry
        elif isinstance(entry, dict):
            raw_path = entry.get("path", "")
        else:
            raw_path = ""
        if not isinstance(raw_path, str) or not raw_path.strip():
            continue
        candidate = Path(raw_path).expanduser()
        if not candidate.is_absolute():
            candidate = path.parent / candidate
        result[str(course_id)] = candidate.resolve()
    return result


def downloaded_media_path(course: Course, media_dir: Path) -> Path:
    """Return a stable local cache name without copying the server's long object name."""

    suffix = ""
    if course.media_url:
        parsed = urlsplit(course.media_url)
        key_value = parse_qs(parsed.query).get("key", [""])[0]
        for candidate in (unquote(parsed.path), unquote(key_value)):
            candidate_suffix = Path(candidate).suffix.casefold()
            if candidate_suffix in SUPPORTED_MEDIA_SUFFIXES:
                suffix = candidate_suffix
                break
    if not suffix:
        suffix = ".mp4" if course.media_type == "video" else ".mp3"
    return media_dir.expanduser().resolve() / f"{course.id}.source{suffix}"


def _media_candidates(media_dir: Path) -> list[Path]:
    if not media_dir.exists():
        raise ValueError(f"Media directory does not exist: {media_dir}")
    return sorted(
        path for path in media_dir.rglob("*") if path.is_file() and path.suffix.casefold() in SUPPORTED_MEDIA_SUFFIXES
    )


def resolve_media_path(
    course: Course,
    *,
    manifest: dict[str, Path] | None = None,
    media_dir: Path | None = None,
) -> Path:
    """Resolve a local source; API keys intentionally never expose media URLs."""

    if manifest and str(course.id) in manifest:
        candidate = manifest[str(course.id)]
        if not candidate.is_file():
            raise ValueError(f"Media for course {course.id} is missing: {candidate}")
        return candidate

    if media_dir is None:
        raise ValueError(
            f"No local media mapping for course {course.id}. "
            "Add it to media-manifest.json or pass --media-dir."
        )

    target = normalized_name(course.title)
    candidates = _media_candidates(media_dir)
    exact = [candidate for candidate in candidates if normalized_name(candidate.stem) == target]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        joined = ", ".join(str(path) for path in exact)
        raise ValueError(f"Multiple media files match course {course.id} ({course.title}): {joined}")

    partial = [
        candidate
        for candidate in candidates
        if target and (target in normalized_name(candidate.stem) or normalized_name(candidate.stem) in target)
    ]
    if len(partial) == 1:
        return partial[0]
    if len(partial) > 1:
        joined = ", ".join(str(path) for path in partial)
        raise ValueError(f"Multiple media files partially match course {course.id} ({course.title}): {joined}")
    raise ValueError(
        f"No local media matched course {course.id} ({course.title}). "
        "Use media-manifest.json for an explicit mapping."
    )


def build_manifest_template(catalog: dict[str, Any]) -> dict[str, dict[str, str]]:
    courses = catalog.get("courses", [])
    if not isinstance(courses, list):
        return {}
    result: dict[str, dict[str, str]] = {}
    for value in courses:
        if not isinstance(value, dict) or "id" not in value:
            continue
        result[str(value["id"])] = {
            "title": str(value.get("title", "")),
            "path": "",
        }
    return result
