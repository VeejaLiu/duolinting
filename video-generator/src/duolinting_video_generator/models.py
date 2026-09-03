from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TranscriptLine:
    """A dltjson sentence. Times are seconds on the original course timeline."""

    start: float
    end: float
    text: str
    translation: str = ""
    translations: dict[str, str] | None = None

    @classmethod
    def from_json(cls, value: dict[str, Any]) -> "TranscriptLine":
        start = float(value.get("start", 0))
        end = float(value.get("end", 0))
        text = str(value.get("text", "")).strip()
        legacy_translation = str(value.get("translation", "") or "").strip()
        raw_translations = value.get("translations")
        translations = (
            {
                str(key): str(item or "").strip()
                for key, item in raw_translations.items()
                if item is not None
            }
            if isinstance(raw_translations, dict)
            else {}
        )
        if legacy_translation and "zh-CN" not in translations:
            translations["zh-CN"] = legacy_translation
        return cls(
            start=max(0.0, start),
            end=max(0.0, end),
            text=text,
            translation=legacy_translation,
            translations=translations,
        )

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass(frozen=True)
class Course:
    id: int
    category_id: int
    title: str
    duration_label: str
    line_count: int
    dltjson_url: str
    sort_order: int = 0
    media_type: str = "audio"
    media_url: str = ""

    @classmethod
    def from_catalog(cls, value: dict[str, Any]) -> "Course":
        return cls(
            id=int(value["id"]),
            category_id=int(value["categoryId"]),
            title=str(value.get("title", "Untitled course")),
            duration_label=str(value.get("durationLabel", "")),
            line_count=int(value.get("lineCount", 0)),
            dltjson_url=str(value["dltjsonUrl"]),
            sort_order=int(value.get("sortOrder", 0)),
            media_type=str(value.get("mediaType") or "audio"),
            media_url=str(value.get("mediaUrl") or value.get("audioUrl") or ""),
        )


@dataclass(frozen=True)
class RenderLine:
    """One generated pass, including the intentional 300ms breathing gap."""

    line: TranscriptLine
    round_number: int
    timeline_start: float
    timeline_end: float
