from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

from .models import Course


class OpenContentApiError(RuntimeError):
    """A readable error from the open-content API or its local cache."""


DownloadProgress = Callable[[int, int | None], None]


class OpenContentClient:
    """Small dependency-free client for the Admin open-content API."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.api_key = api_key.strip()
        self.timeout = timeout
        if not self.base_url.startswith(("http://", "https://")):
            raise OpenContentApiError("DUOLINTING_API_BASE must start with http:// or https://")
        if not self.api_key:
            raise OpenContentApiError(
                "Missing API key. Set DUOLINTING_OPEN_CONTENT_API_KEY in the local environment."
            )

    def _headers_for(self, url: str, accept: str) -> dict[str, str]:
        headers = {
            "Accept": accept,
            "User-Agent": "duolinting-video-generator/0.1",
        }
        # Never forward the DuolinTing secret to an external source URL. CDN media
        # is public by design; same-origin API media is the only place that needs it.
        base = urlsplit(self.base_url)
        target = urlsplit(url)
        if target.scheme == base.scheme and target.netloc == base.netloc:
            headers["X-DuolinTing-API-Key"] = self.api_key
        return headers

    def get_json(self, path: str) -> dict[str, Any]:
        url = urljoin(self.base_url, path.lstrip("/"))
        request = Request(
            url,
            headers=self._headers_for(url, "application/json"),
            method="GET",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                body = response.read()
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace").strip()
            raise OpenContentApiError(
                f"Open-content API returned HTTP {error.code} for {path}: {detail or error.reason}"
            ) from error
        except URLError as error:
            raise OpenContentApiError(f"Unable to reach open-content API {url}: {error.reason}") from error

        try:
            parsed = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise OpenContentApiError(f"Open-content API returned invalid JSON for {path}") from error
        if not isinstance(parsed, dict):
            raise OpenContentApiError(f"Open-content API returned an unexpected response for {path}")
        return parsed

    def download_media(
        self,
        media_url: str,
        destination: Path,
        on_progress: DownloadProgress | None = None,
    ) -> Path:
        """Stream one published source media file to disk without buffering it in Python memory."""

        url = urljoin(self.base_url, media_url)
        request = Request(
            url,
            headers=self._headers_for(url, "audio/*,video/*;q=0.9,*/*;q=0.1"),
            method="GET",
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary_path: Path | None = None
        try:
            with urlopen(request, timeout=self.timeout) as response:
                content_length = response.headers.get("Content-Length")
                total = int(content_length) if content_length and content_length.isdigit() else None
                with tempfile.NamedTemporaryFile(
                    "wb", dir=destination.parent, prefix=f".{destination.name}.", delete=False
                ) as temporary:
                    temporary_path = Path(temporary.name)
                    received = 0
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        temporary.write(chunk)
                        received += len(chunk)
                        if on_progress:
                            on_progress(received, total)
            if temporary_path is None:
                raise OpenContentApiError("Media download did not create a temporary file")
            os.replace(temporary_path, destination)
            temporary_path = None
            return destination
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace").strip()
            raise OpenContentApiError(
                f"Media download returned HTTP {error.code}: {detail or error.reason}"
            ) from error
        except URLError as error:
            raise OpenContentApiError(f"Unable to download media from {url}: {error.reason}") from error
        finally:
            if temporary_path is not None:
                try:
                    temporary_path.unlink()
                except OSError:
                    pass

    def fetch_catalog(self) -> dict[str, Any]:
        catalog = self.get_json("/api/v1/open-content/catalog")
        if not isinstance(catalog.get("courses"), list):
            raise OpenContentApiError("Catalog response is missing courses")
        return catalog

    def fetch_course_dltjson(self, course: Course) -> dict[str, Any]:
        payload = self.get_json(course.dltjson_url)
        if not isinstance(payload.get("lines"), list):
            raise OpenContentApiError(f"Course {course.id} dltjson is missing lines")
        return payload


def atomic_write_json(path: Path, payload: Any) -> None:
    """Write cache files atomically so an interrupted sync cannot corrupt the next run."""

    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
    ) as temporary:
        json.dump(payload, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, path)


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as file:
            value = json.load(file)
    except FileNotFoundError as error:
        raise OpenContentApiError(f"Cache file does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise OpenContentApiError(f"Cache file is not valid JSON: {path}") from error
    if not isinstance(value, dict):
        raise OpenContentApiError(f"Cache file must contain a JSON object: {path}")
    return value
