from __future__ import annotations

import json
import math
import os
import platform
import re
import subprocess
import sys
import tempfile
import unicodedata
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Callable

from .models import Course, RenderLine, TranscriptLine
from .theme import VideoTheme

ProgressCallback = Callable[[float], None]


class RenderError(RuntimeError):
    """A user-facing local rendering error."""


@dataclass(frozen=True)
class RenderOptions:
    """Stable output settings shared by every locally generated course video."""

    theme: VideoTheme = field(default_factory=VideoTheme)
    fps: int = 30
    gap_seconds: float = 0.3
    locale: str = "zh-CN"
    font_name: str = "PingFang SC"
    # One-based valid sentence index; None renders the complete course.
    preview_line: int | None = None
    # Static illustrated frame; real media and all lesson text remain separate.
    frame_image: Path | None = None

    def __post_init__(self) -> None:
        if not 0 <= self.gap_seconds < 60:
            raise RenderError("句间隔必须在 0 到 60 秒之间")
        if self.fps < 1:
            raise RenderError("帧率必须为正数")
        if not self.font_name.strip() or any(c in self.font_name for c in ",\r\n"):
            raise RenderError("字体名称不能为空或包含逗号/换行")


@dataclass(frozen=True)
class ProbedMedia:
    has_video: bool
    has_audio: bool


def _ffmpeg_binary() -> str:
    configured = os.environ.get("DUOLINTING_FFMPEG_BIN", "").strip()
    if configured:
        return configured
    bundled = Path(__file__).resolve().parents[2] / "tools" / "ffmpeg"
    return str(bundled) if bundled.is_file() else "ffmpeg"


def _ffprobe_binary() -> str:
    configured = os.environ.get("DUOLINTING_FFPROBE_BIN", "").strip()
    if configured:
        return configured
    bundled = Path(__file__).resolve().parents[2] / "tools" / "ffprobe"
    return str(bundled) if bundled.is_file() else "ffprobe"


def _ffmpeg_install_hint() -> str:
    if sys.platform == "darwin":
        if platform.machine().lower() in {"x86_64", "i386"}:
            return (
                "Intel macOS 请先安装 MacPorts，再执行 sudo port selfupdate && sudo port install ffmpeg；"
                "如果命令找不到，可设置 DUOLINTING_FFMPEG_BIN=/opt/local/bin/ffmpeg 和 "
                "DUOLINTING_FFPROBE_BIN=/opt/local/bin/ffprobe。"
            )
        return "Apple Silicon macOS 可执行 brew install ffmpeg-full，或设置 DUOLINTING_FFMPEG_BIN/DUOLINTING_FFPROBE_BIN。"
    return "请安装包含 libass 的 FFmpeg，或设置 DUOLINTING_FFMPEG_BIN/DUOLINTING_FFPROBE_BIN。"


def _run_checked(command: list[str], *, label: str) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as error:
        raise RenderError(
            f"找不到可执行文件 {command[0]}（{label}）。请先安装 FFmpeg，"
            f"{_ffmpeg_install_hint()}"
        ) from error
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip().splitlines()
        raise RenderError(f"{label} 失败：{detail[-1] if detail else '未知错误'}")
    return result


def probe_media(path: Path) -> ProbedMedia:
    """Inspect streams without decoding the media; this keeps audio-only courses supported."""

    result = _run_checked(
        [
            _ffprobe_binary(),
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "json",
            str(path),
        ],
        label=f"读取媒体信息 {path}",
    )
    try:
        streams = json.loads(result.stdout).get("streams", [])
    except json.JSONDecodeError as error:
        raise RenderError(f"ffprobe 返回了无效结果：{path}") from error
    stream_types = {
        stream.get("codec_type")
        for stream in streams
        if isinstance(stream, dict)
    }
    probed = ProbedMedia(has_video="video" in stream_types, has_audio="audio" in stream_types)
    if not probed.has_video and not probed.has_audio:
        raise RenderError(f"媒体文件没有可用的视频或音频流：{path}")
    return probed


def ensure_subtitle_filter() -> None:
    """Fail early when the local FFmpeg build cannot burn captions into a video."""

    result = _run_checked([_ffmpeg_binary(), "-hide_banner", "-filters"], label="检查 FFmpeg 字幕能力")
    if not re.search(r"\bsubtitles\b", result.stdout):
        raise RenderError(
            "当前 FFmpeg 没有 subtitles/libass 滤镜，无法把字幕写入成片。"
            f" {_ffmpeg_install_hint()} 安装后重新运行本地生成命令。"
        )


def _safe_float(value: Any, field: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise RenderError(f"字幕字段 {field} 不是有效数字：{value!r}") from error
    if not result == result or result in (float("inf"), float("-inf")):
        raise RenderError(f"字幕字段 {field} 不是有限数字：{value!r}")
    return result


def load_renderable_lines(dltjson: dict[str, Any]) -> list[TranscriptLine]:
    raw_lines = dltjson.get("lines")
    if not isinstance(raw_lines, list):
        raise RenderError("dltjson 缺少 lines 数组")

    lines: list[TranscriptLine] = []
    for raw_line in raw_lines:
        if not isinstance(raw_line, dict):
            continue
        line = TranscriptLine.from_json(raw_line)
        # 无效行不能交给 trim/atrim；跳过它们比让 FFmpeg 生成空片段更容易定位问题。
        if not line.text or line.end <= line.start:
            continue
        lines.append(
            TranscriptLine(
                start=_safe_float(line.start, "start"),
                end=_safe_float(line.end, "end"),
                text=line.text,
                translation=line.translation,
                translations=line.translations or {},
            )
        )
    if not lines:
        raise RenderError("dltjson 中没有有效的字幕时间轴")
    return lines


def _ass_time(seconds: float) -> str:
    centiseconds = max(0, round(seconds * 100))
    hours, remainder = divmod(centiseconds, 360000)
    minutes, remainder = divmod(remainder, 6000)
    whole_seconds, fraction = divmod(remainder, 100)
    return f"{hours}:{minutes:02d}:{whole_seconds:02d}.{fraction:02d}"


def _ass_escape(value: str) -> str:
    # ASS uses braces for override tags and \N for explicit line breaks.
    return (
        value.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "\\N")
    )


def _text_width(value: str, size: int) -> float:
    # Approximate proportional Latin glyph widths instead of treating all letters
    # as wide capitals. CJK remains one em and combining marks add no width.
    # This is deliberately font-independent; preview remains the final check.
    def advance(char: str) -> float:
        if unicodedata.category(char).startswith("M"):
            return 0
        if unicodedata.east_asian_width(char) in {"W", "F"}:
            return 1.05
        if char.isspace():
            return 0.32
        if char in "ilI.,!':;|":
            return 0.3
        if char in "MW@%mw":
            return 0.9
        if char.isascii():
            return 0.7 if char.isupper() else 0.58
        return 0.7
    return sum(advance(char) for char in value) * size


def _wrap_text(value: str, size: int, width: int) -> list[str]:
    rows: list[str] = []
    for paragraph in value.splitlines() or [""]:
        current = ""
        # Preserve English words where possible; split oversized words/CJK at
        # Unicode characters, keeping combining marks attached to their base.
        for token in re.findall(r"\s+|[^\s]+", paragraph):
            if current and _text_width(current + token, size) > width:
                rows.append(current.rstrip())
                current = ""
            for char in token.lstrip() if not current else token:
                if current and _text_width(current + char, size) > width:
                    rows.append(current.rstrip())
                    current = ""
                current += char
        rows.append(current.rstrip())
    return rows


def _wrap_english(value: str, size: int, width: int) -> list[str]:
    rows: list[str] = []
    for paragraph in value.splitlines() or [""]:
        words = paragraph.split()
        greedy = _wrap_text(paragraph, size, width)
        # Keep explicit paragraphs and oversized tokens intact through the normal
        # wrapper. Bound optimization work for exceptionally long imported text.
        if len(words) > 80 or len(greedy) < 2 or any(_text_width(word, size) > width for word in words):
            rows.extend(greedy)
            continue
        count = len(words)
        costs = [float("inf")] * (count + 1)
        breaks = [count] * (count + 1)
        costs[count] = 0
        # Minimize uneven line lengths across the whole sentence. Penalize a
        # one-word final line and dangling articles/prepositions at line endings.
        for start in range(count - 1, -1, -1):
            for end in range(start + 1, count + 1):
                line_width = _text_width(" ".join(words[start:end]), size)
                if line_width > width:
                    break
                penalty = (width - line_width) ** 2
                if end == count and end - start == 1:
                    penalty += width ** 2 * 4
                if end < count and words[end - 1].lower() in {"a", "an", "the", "to", "into", "of", "with"}:
                    penalty += width ** 2 * .2
                score = penalty + costs[end]
                if score < costs[start]:
                    costs[start], breaks[start] = score, end
        start = 0
        while start < count:
            end = breaks[start]
            rows.append(" ".join(words[start:end]))
            start = end
    return rows


def _fit_single(value: str, size: int, width: int, minimum: int) -> tuple[str, int]:
    value = " ".join(value.split())
    while size > minimum and _text_width(value, size) > width:
        size -= 1
    if _text_width(value, size) > width:
        while value and _text_width(value + "…", size) > width:
            value = value[:-1]
        value += "…"
    return _ass_escape(value), size


def _caption_layout(english: str, translation: str, theme: VideoTheme) -> tuple[list[str], int, list[str], int]:
    en_size, tr_size = theme.english_size, theme.translation_size
    available = theme.caption_bottom - theme.caption_top
    while True:
        en_rows = _wrap_english(english, en_size, theme.caption_width)
        tr_rows = _wrap_text(translation, tr_size, theme.caption_width) if translation else []
        used = (len(en_rows) * en_size + len(tr_rows) * tr_size) * theme.line_height
        used += theme.caption_gap if tr_rows else 0
        if used <= available:
            return en_rows, en_size, tr_rows, tr_size
        if en_size <= theme.min_caption_size and (not tr_rows or tr_size <= theme.min_caption_size):
            raise RenderError("字幕过长，最小字号仍放不下；请拆分该句或增加主题字幕区域")
        en_size = max(theme.min_caption_size, en_size - 2)
        tr_size = max(theme.min_caption_size, tr_size - 2)


def _translation(line: TranscriptLine, locale: str) -> str:
    if locale == "en-US":
        return ""
    translations = line.translations or {}
    if locale == "zh-CN":
        return str(translations.get("zh-CN") or line.translation or "").strip()
    return str(translations.get(locale) or "").strip()


def _phase_text(locale: str, round_number: int) -> str:
    values = {
        "en-US": {1: "Listen without subtitles", 2: "Listen without subtitles", 3: "Listen with subtitles"},
        "zh-CN": {1: "盲听", 2: "盲听", 3: "英文字幕 + 翻译"},
        "th-TH": {1: "ฟังโดยไม่มีคำบรรยาย", 2: "ฟังโดยไม่มีคำบรรยาย", 3: "ฟังพร้อมคำบรรยาย"},
        "ja-JP": {1: "字幕なしで聞く", 2: "字幕なしで聞く", 3: "字幕を見ながら聞く"},
    }
    return values.get(locale, values["zh-CN"]).get(round_number, values["zh-CN"][1])


def _website_urls(locale: str) -> tuple[str, str]:
    labels = {"zh-CN": ("网页端", "移动端"), "en-US": ("Web", "Mobile"),
              "ja-JP": ("Web版", "モバイル版"), "th-TH": ("เว็บ", "มือถือ")}
    web_label, mobile_label = labels.get(locale, labels["zh-CN"])
    return (f"{web_label} · https://app.duolinting.cn",
            f"{mobile_label} · https://mobile.duolinting.cn")


def _website_events(locale: str, x: int, y: int, width: int, size: int,
                    height: int, duration: float, cycle_seconds: float) -> list[str]:
    urls = _website_urls(locale)
    result: list[str] = []
    # Match the recorder's six-second vertical ticker: hold web to 38%, slide
    # to mobile by 47%, hold to 88%, then slide back to web by 100%. Clip the
    # single-row viewport so moving text cannot cross into the tagline/title.
    segments = ((0, .38, ((0, 0, 0),)),
                (.38, .47, ((0, 0, -1), (1, 1, 0))),
                (.47, .88, ((1, 0, 0),)),
                (.88, 1, ((1, 0, -1), (0, 1, 0))))
    cycle_start = 0.0
    while cycle_start < duration:
        for begin, finish, entries in segments:
            start = cycle_start + begin * cycle_seconds
            end = min(duration, cycle_start + finish * cycle_seconds)
            if start >= end:
                continue
            # Keep the full segment's speed even if the video ends mid-scroll.
            milliseconds = round((finish - begin) * cycle_seconds * 1000)
            for index, offset_from, offset_to in entries:
                tags = (f"{{\\an7\\fs{size}\\clip({x},{y},{x + width},{y + height})"
                        f"\\move({x},{y + offset_from * height},{x},{y + offset_to * height},0,{milliseconds})}}")
                result.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Website,,0,0,0,,{tags}{_ass_escape(urls[index])}")
        cycle_start += cycle_seconds
    return result


def _watermark_events(theme: VideoTheme, duration: float) -> list[str]:
    """Continuous, staggered paths on the final timeline, including breathing gaps."""
    alpha = round((1 - theme.watermark_opacity) * 255)
    # Each mark owns a separate media band, so marks cannot collide or cover the
    # learning captions. Position bounds include estimated glyph width and height.
    size = min(theme.watermark_size, max(12, theme.media_height // (theme.watermark_count * 3)))
    text_width = math.ceil(_text_width("DuolinTing", size) * 1.2)
    x_min, x_max = 24, max(24, theme.width - text_width - 24)
    band = theme.media_height / theme.watermark_count
    result = []
    for mark in range(theme.watermark_count):
        period = theme.watermark_cycle_seconds + mark * 7

        def position(t: float) -> tuple[int, int]:
            phase = t * 2 * math.pi / period + mark * 2.1
            x = x_min + (x_max - x_min) * (0.5 + 0.5 * math.sin(phase))
            free = max(0, band - size * 1.5 - 16)
            y = theme.header_height + mark * band + 8 + free * (0.5 + 0.5 * math.sin(phase * 0.73))
            return round(x), round(y)

        # Half-second linear segments approximate smooth paths with shared exact
        # endpoints. No fades or per-sentence reset: coverage persists throughout.
        for index in range(math.ceil(duration * 2)):
            start, end = index / 2, min(duration, (index + 1) / 2)
            x1, y1 = position(start)
            x2, y2 = position(end)
            tags = (f"{{\\an7\\fs{size}\\alpha&H{alpha:02X}&\\bord0.7\\shad0"
                    f"\\move({x1},{y1},{x2},{y2})}}")
            result.append(f"Dialogue: 1,{_ass_time(start)},{_ass_time(end)},Watermark,wm{mark},0,0,0,,{tags}DuolinTing")
    return result


def _build_ass(
    *,
    course: Course,
    lines: list[TranscriptLine],
    render_lines: list[RenderLine],
    options: RenderOptions,
    path: Path,
) -> None:
    total_duration = render_lines[-1].timeline_end if render_lines else 0
    locale = options.locale
    if locale == "en-US":
        tagline = "Open-source, non-profit English learning"
    elif locale == "th-TH":
        tagline = "แอปเรียนอังกฤษโอเพนซอร์ส ไม่แสวงกำไร"
    elif locale == "ja-JP":
        tagline = "オープンソース・非営利の英語学習アプリ"
    else:
        tagline = "开源非盈利 · 英语学习应用"
    # Size the ticker to the longer URL so both addresses remain fully visible.
    website = max(_website_urls(locale), key=lambda text: _text_width(text, options.theme.website_size))

    theme = options.theme
    events: list[str] = []

    def rgb(value: str) -> str:
        return value[5:7] + value[3:5] + value[1:3]

    def panel(x: int, y: int, width: int, height: int, fill: str,
              start: float = 0, end: float = total_duration, radius: int = 0,
              animation: str = "") -> None:
        # ASS vector paths share the square-pixel canvas. Layer -1 puts decoration
        # behind text while keeping it above the composed source video.
        r = min(radius, width // 2, height // 2)
        w, h = width, height
        k = round(r * 0.5523)
        drawing = (f"m {r} 0 l {w-r} 0 b {w-r+k} 0 {w} {r-k} {w} {r} l {w} {h-r} "
                   f"b {w} {h-r+k} {w-r+k} {h} {w-r} {h} l {r} {h} "
                   f"b {r-k} {h} 0 {h-r+k} 0 {h-r} l 0 {r} b 0 {r-k} {r-k} 0 {r} 0")
        tags = f"{{\\an7\\pos({x},{y})\\bord0\\shad0\\1c&H{rgb(fill)}&{animation}\\p1}}"
        events.append(f"Dialogue: -1,{_ass_time(start)},{_ass_time(end)},Phase,,0,0,0,,{tags}{drawing}")

    def event(style: str, text: str, x: int, y: int, size: int,
              start: float = 0, end: float = total_duration, animate: bool = False, alignment: int = 8,
              extra: str = "") -> None:
        # Captions use top-center anchors; the brand block uses top-left anchors.
        # X/Y scaling always stays equal so letter shapes cannot be distorted.
        length_ms = max(0, int((end - start) * 1000))
        fade_in = min(theme.fade_in_ms, length_ms // 3)
        fade_out = min(theme.fade_out_ms, length_ms // 3)
        motion = (f"\\move({x},{y + theme.slide_distance},{x},{y},0,{min(theme.slide_ms, length_ms)})"
                  f"\\fscx{theme.entrance_scale}\\fscy{theme.entrance_scale}"
                  f"\\t(0,{min(theme.slide_ms, length_ms)},\\fscx100\\fscy100)" if animate and theme.slide_ms else f"\\pos({x},{y})")
        tags = f"{{\\an{alignment}\\fs{size}{motion}\\fad({fade_in},{fade_out}){extra}}}"
        events.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},{style},,0,0,0,,{tags}{text}")

    brand_left = theme.margin + theme.logo_size + theme.logo_gap
    brand_width = theme.width - theme.margin - brand_left - theme.title_width - theme.section_gap
    brand_rows = []
    for style, value, size in (
        ("Header", "DuolinTing", theme.brand_size),
        ("Tagline", tagline, theme.tagline_size),
        ("Website", website, theme.website_size),
    ):
        row_width = theme.width - theme.margin - brand_left if style == "Website" else brand_width
        text, size = _fit_single(value, size, row_width, 12)
        brand_rows.append((style, text, size))
    # Center the compact block as a whole alongside the logo, instead of spacing
    # three independently centered lines over the entire header.
    brand_height = sum(size * theme.brand_line_height for _, _, size in brand_rows) + 2 * theme.brand_row_gap
    brand_y = (theme.header_height - brand_height) / 2
    for style, text, size in brand_rows:
        if options.frame_image is not None:
            # The illustrated frame's blank areas use normalized 1080x1440
            # coordinates, so replacement text can also support scaled output.
            if style == "Website":
                events.extend(_website_events(locale, theme.margin, round(theme.height * 0.092),
                              theme.width - 2 * theme.margin, size, round(size * 1.1),
                              total_duration, theme.url_cycle_seconds))
            else:
                text, size = _fit_single("DuolinTing" if style == "Header" else tagline,
                                        size, round(theme.width * 0.31), 12)
                event(style, text, round(theme.width * 0.145),
                      round(theme.height * (0.034 if style == "Header" else 0.066)), size, alignment=7)
            continue
        if style == "Website":
            events.extend(_website_events(locale, brand_left, round(brand_y),
                                          theme.width - theme.margin - brand_left, size,
                                          round(size * theme.brand_line_height), total_duration,
                                          theme.url_cycle_seconds))
        else:
            event(style, text, brand_left, round(brand_y), size, alignment=7)
        brand_y += size * theme.brand_line_height + theme.brand_row_gap

    title, title_size = _fit_single(course.title, theme.title_size, theme.title_width, 16)
    # Reserve a separate right-hand header column so long titles never overlap
    # the brand. ASS an9 anchors the text to the top-right safe margin.
    if options.frame_image is None:
        panel(theme.width - theme.margin - theme.title_width - 14, theme.title_top - 8,
              theme.title_width + 28, round(title_size * 1.4) + 16, theme.highlight_color, radius=28)
    title_x = round(theme.width * 0.88) if options.frame_image else theme.width - theme.margin
    title_y = round(theme.height * 0.041) if options.frame_image else theme.title_top
    if options.frame_image:
        title, title_size = _fit_single(course.title, theme.title_size, round(theme.width * 0.25), 12)
    event("Course", title, title_x, title_y, title_size, alignment=9,
          extra="\\1c&HFFFFFF&")
    phase_y = round(theme.height * 0.585) if options.frame_image else theme.header_height + theme.media_height + theme.section_gap
    # In the illustrated frame, reserve symmetric interior padding rather than
    # centering against the lower edge of the entire canvas. The extra side inset
    # also keeps long lines away from the decorative star.
    caption_theme = replace(theme, section_gap=45, margin=theme.margin + 24) if options.frame_image else theme
    card_y = theme.caption_top - 12
    if options.frame_image is None:
        # Code-native decorations keep the generated mockup's cloud/grass palette
        # without baking any lesson text or media into a reusable bitmap.
        panel(0, theme.header_height + theme.media_height, theme.width, 94, theme.header_background)
        for cloud_x, cloud_y in ((theme.width - 190, 110), (theme.width // 2 + 20, 72)):
            panel(cloud_x, cloud_y, 82, 30, "#ffffff", radius=15)
            panel(cloud_x + 12, cloud_y - 15, 40, 40, "#ffffff", radius=20)
            panel(cloud_x + 42, cloud_y - 5, 30, 30, "#ffffff", radius=15)
        for side in (0, theme.width - 48):
            for leaf in range(3):
                panel(side + leaf * 12 - 12, theme.height - 94 + leaf * 12,
                      24, 74, "#319d62", radius=12)
            flower_x = 14 if side == 0 else theme.width - 28
            for dx, dy in ((0, -10), (-10, 0), (10, 0), (0, 10)):
                panel(flower_x + dx, theme.height - 42 + dy, 14, 14, "#ffffff", radius=7)
            panel(flower_x + 2, theme.height - 40, 10, 10, theme.trim_color, radius=5)
        panel(theme.margin // 2 - 5, card_y - 5, theme.width - theme.margin + 10,
              theme.caption_bottom - card_y + 34, theme.trim_color, radius=40)
        panel(theme.margin // 2, card_y, theme.width - theme.margin,
              theme.caption_bottom - card_y + 24, theme.panel_background, radius=36)
        # A tiny four-point sparkle stays in the padding, outside caption bounds.
        event("Phase", "✦", theme.width - 46, card_y + 4, 28,
              extra=f"\\1c&H{rgb(theme.trim_color)}&")
    # Burn the watermark into the media region, not just the removable header.
    # ASS alpha is transparency (0 opaque, 255 invisible), inverse of opacity.
    events.extend(_watermark_events(theme, total_duration))
    hint_texts = {
        "zh-CN": ("先听声音，试着抓住关键词", "再听一遍，把意思连起来"),
        "en-US": ("Listen for the key words", "Listen again and connect the meaning"),
        "th-TH": ("ลองฟังและจับคำสำคัญ", "ฟังอีกครั้งแล้วจับใจความ"),
        "ja-JP": ("キーワードを聞き取ろう", "もう一度聞いて意味をつかもう"),
    }
    footer_y = round(theme.height * 0.94) if options.frame_image else theme.height - theme.margin - 20
    track_y = footer_y + (14 if options.frame_image else 36)
    for pass_index, render_line in enumerate(render_lines):
        start = render_line.timeline_start
        end = start + render_line.line.duration
        labels = {"zh-CN": ("盲听", "再听", "看字幕"),
                  "en-US": ("Listen", "Repeat", "Subtitles"),
                  "th-TH": ("ฟัง", "ฟังซ้ำ", "ดูคำบรรยาย"),
                  "ja-JP": ("聞く", "もう一度", "字幕")}.get(locale, ("Listen", "Repeat", "Subtitles"))
        pill_gap = 20
        pill_width = (theme.width - 2 * theme.margin - 2 * pill_gap) // 3
        for step, label in enumerate(labels, start=1):
            active = step == render_line.round_number
            x = theme.margin + (step - 1) * (pill_width + pill_gap)
            if options.frame_image is None:
                panel(x, phase_y - 4, pill_width, 58, theme.highlight_color if active else theme.panel_background,
                      start, render_line.timeline_end, radius=29)
            text, size = _fit_single(f"{step}  {label}", theme.phase_size, pill_width - 24, 12)
            step_x = round(theme.width * (0.215, 0.50, 0.783)[step-1]) if options.frame_image else x + pill_width // 2
            event("Phase", text, step_x, phase_y + 7, size, start, render_line.timeline_end,
                  extra=f"\\1c&H{rgb((theme.highlight_color if options.frame_image else '#ffffff') if active else theme.foreground)}&")
        # A full-width track represents sentence completion. The active segment
        # grows linearly through each of the three passes, including its gap.
        count = max(1, len(render_lines))
        track_width = round(theme.width * 0.5) if options.frame_image else theme.width - 2 * theme.margin
        left = round(theme.width * 0.25) if options.frame_image else theme.margin
        panel(left, track_y, track_width, 4, theme.panel_background, start, render_line.timeline_end)
        initial = round(track_width * pass_index / count)
        final = round(track_width * (pass_index + 1) / count)
        duration_ms = round((render_line.timeline_end - start) * 1000)
        panel(left, track_y, track_width, 4, theme.accent, start, render_line.timeline_end,
              animation=f"\\clip({left},{track_y},{left+initial},{track_y+4})"
                        f"\\t(0,{duration_ms},\\clip({left},{track_y},{left+final},{track_y+4}))")
        event("Tagline", f"{pass_index // 3 + 1:02d} / {len(lines):02d}", round(theme.width * .13) if options.frame_image else left, footer_y, 22,
              start, render_line.timeline_end, alignment=7)
        event("Header", "DuolinTing", round(theme.width * .90) if options.frame_image else theme.width-left, footer_y, 24,
              start, render_line.timeline_end, alignment=9)
        if render_line.round_number != 3:
            center_y = (caption_theme.caption_top + caption_theme.caption_bottom) // 2
            # Decorative listening bars pulse gently; these are an activity cue,
            # not an audio-amplitude measurement. No transcript appears in blind passes.
            for bar in range(9):
                height = (20, 36, 58, 80, 96, 80, 58, 36, 20)[bar]
                panel(theme.width // 2 - 116 + bar * 28, center_y - 72 - height // 2,
                      8, height, theme.accent, start, end, radius=4,
                      animation="\\alpha&H40&\\fad(200,200)\\t(0,700,\\alpha&H00&)"
                                "\\t(700,1400,\\alpha&H70&)\\t(1400,2100,\\alpha&H00&)")
            hint = hint_texts.get(locale, hint_texts["zh-CN"])[render_line.round_number - 1]
            hint, hint_size = _fit_single(hint, 34, theme.caption_width, 18)
            event("Translation", hint, theme.width // 2, center_y + 18, hint_size, start, end)
            continue
        en_rows, en_size, tr_rows, tr_size = _caption_layout(render_line.line.text, _translation(render_line.line, locale), caption_theme)
        used = (len(en_rows) * en_size + len(tr_rows) * tr_size) * theme.line_height
        used += theme.caption_gap if tr_rows else 0
        y = caption_theme.caption_top + max(0, (caption_theme.caption_bottom - caption_theme.caption_top - used) / 2)
        for style, rows, size in (("English", en_rows, en_size), ("Translation", tr_rows, tr_size)):
            for row in rows:
                event(style, _ass_escape(row), theme.width // 2, round(y), size, start, end, True)
                y += size * theme.line_height
            y += theme.caption_gap

    def color(value: str) -> str:
        # ASS colors are AABBGGRR; theme files use familiar RGB notation.
        return "&H00" + value[5:7] + value[3:5] + value[1:3]

    styles = []
    for name, foreground in (("Header", theme.foreground), ("Tagline", theme.muted_color),
                             ("Website", theme.accent), ("Course", theme.foreground),
                             ("Phase", theme.accent), ("English", theme.foreground),
                             ("Translation", theme.translation_color), ("Watermark", "#ffffff")):
        # Brand text sits on a solid panel: removing caption outlines/shadows
        # keeps small lettering crisp. Only the brand name needs bold weight.
        is_brand = name in {"Header", "Tagline", "Website", "Course"}
        outline = 0 if is_brand else theme.outline
        shadow = 0 if is_brand else theme.shadow
        bold = 0 if name in {"Tagline", "Website"} else -1
        font = options.font_name
        if options.frame_image is not None:
            # Rounded display faces are limited to prominent text; small utility
            # labels retain the selected reading font for legibility.
            if name in {"English", "Header", "Course", "Watermark"}:
                font = "Arial Rounded MT Bold"
            elif name in {"Phase", "Translation"} and locale == "zh-CN":
                font = "ZCOOL KuaiLe"
                bold = 0  # Use its drawn weight, avoiding synthesized bold blobs.
        styles.append(f"Style: {name},{font},40,{color(foreground)},{color(foreground)},{color(theme.outline_color)},&H66000000,{bold},0,0,0,100,100,0,0,1,{outline},{shadow},8,0,0,0,1")
    content = "\n".join([
        "[Script Info]", "ScriptType: v4.00+",
        f"PlayResX: {theme.width}", f"PlayResY: {theme.height}",
        "WrapStyle: 2", "ScaledBorderAndShadow: yes", "", "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        *styles, "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        *events, "",
    ])
    path.write_text(content, encoding="utf-8")


def _decimal(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def _filter_value(value: str) -> str:
    """Escape a value embedded in an FFmpeg filter option quoted with single quotes."""

    return value.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")


def _build_filter_graph(
    *,
    media: ProbedMedia,
    lines: list[TranscriptLine],
    options: RenderOptions,
    ass_path: Path,
    has_logo: bool,
) -> tuple[str, list[RenderLine]]:
    theme = options.theme
    render_lines: list[RenderLine] = []
    cursor = 0.0
    for line in lines:
        for round_number in (1, 2, 3):
            duration = line.duration
            render_lines.append(
                RenderLine(
                    line=line,
                    round_number=round_number,
                    timeline_start=cursor,
                    timeline_end=cursor + duration + options.gap_seconds,
                )
            )
            cursor += duration + options.gap_seconds

    segment_count = len(render_lines)
    parts: list[str] = []
    video_labels: list[str] = []
    audio_labels: list[str] = []
    if media.has_video:
        source_labels = "".join(f"[vsrc{i}]" for i in range(segment_count))
        # Respect anamorphic source display aspect BEFORE discarding its SAR.
        # Otherwise all later overlays inherit stretched pixels from the source.
        parts.append(f"[0:v]scale=w='max(2,round(iw*if(gt(sar,0),sar,1)/2)*2)':h=ih,setsar=1,split={segment_count}{source_labels}")
    if media.has_audio:
        source_labels = "".join(f"[asrc{i}]" for i in range(segment_count))
        parts.append(f"[0:a]asplit={segment_count}{source_labels}")

    for index, render_line in enumerate(render_lines):
        start = _decimal(render_line.line.start)
        end = _decimal(render_line.line.end)
        segment_duration = _decimal(render_line.line.duration + options.gap_seconds)
        if media.has_video:
            parts.extend(
                [
                    f"[vsrc{index}]trim=start={start}:end={end},setpts=PTS-STARTPTS,fps={options.fps},split=2[vfg{index}][vbg{index}]",
                    f"[vbg{index}]scale={theme.width}:{theme.media_height}:force_original_aspect_ratio=increase,crop={theme.width}:{theme.media_height},setsar=1,boxblur={theme.blur_radius}:2[blur{index}]",
                    f"[vfg{index}]scale={theme.width}:{theme.media_height}:force_original_aspect_ratio=decrease,setsar=1[fit{index}]",
                    f"[blur{index}][fit{index}]overlay=(W-w)/2:(H-h)/2:shortest=1[media{index}]",
                    f"[media{index}]pad={theme.width}:{theme.height}:0:{theme.header_height}:color={theme.background},tpad=stop_mode=clone:stop_duration={_decimal(options.gap_seconds)}[v{index}]",
                ]
            )
        else:
            parts.append(
                f"color=c={theme.audio_background}:s={theme.width}x{theme.media_height}:r={options.fps}:d={_decimal(render_line.line.duration)},"
                f"pad={theme.width}:{theme.height}:0:{theme.header_height}:color={theme.background},tpad=stop_mode=clone:stop_duration={_decimal(options.gap_seconds)}[v{index}]"
            )
        video_labels.append(f"[v{index}]")

        if media.has_audio:
            parts.append(
                f"[asrc{index}]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,"
                f"apad=pad_dur={_decimal(options.gap_seconds)},atrim=duration={segment_duration}[a{index}]"
            )
        else:
            parts.append(f"anullsrc=r=48000:cl=stereo:d={segment_duration}[a{index}]")
        audio_labels.append(f"[a{index}]")

    concat_inputs = "".join(
        f"{video_label}{audio_label}"
        for video_label, audio_label in zip(video_labels, audio_labels)
    )
    parts.append(
        f"{concat_inputs}concat=n={segment_count}:v=1:a=1[concatv][concata]"
    )
    if options.frame_image is not None:
        # Input order is source, optional logo, optional frame. Replace only the
        # media rectangle: the template's illustrated border stays untouched.
        frame_index = 2 if has_logo else 1
        parts.append(f"[concatv]crop={theme.width}:{theme.media_height}:0:{theme.header_height}[framemedia]")
        parts.append(f"[{frame_index}:v]scale={theme.width}:{theme.height}:force_original_aspect_ratio=increase,"
                     f"crop={theme.width}:{theme.height},setsar=1[framebase]")
        parts.append(f"[framebase][framemedia]overlay=0:{theme.header_height}:shortest=1[headerpanel]")
    else:
        parts.append(f"[concatv]drawbox=x=0:y=0:w=iw:h={theme.header_height}:color={theme.header_background}:t=fill[headerpanel]")
    video_input = "[headerpanel]"
    if has_logo:
        size = theme.logo_size
        radius = theme.logo_radius
        x, y = theme.margin, (theme.header_height - size) // 2

        def rounded_card(label: str, fill: str, opacity: float) -> str:
            red, green, blue = (int(fill[i:i + 2], 16) for i in (1, 3, 5))
            # Clamp to the inner rectangle and measure distance to create rounded
            # corners. Alpha is an 8-bit opacity, independent of the RGB color.
            alpha = f"if(lte(hypot(X-clip(X,{radius},W-1-{radius}),Y-clip(Y,{radius},H-1-{radius})),{radius}),{round(opacity * 255)},0)"
            return (f"color=c={fill}:s={size}x{size}:r={options.fps},format=rgba,"
                    f"geq=r='{red}':g='{green}':b='{blue}':a='{alpha}'[{label}]")

        parts.append(rounded_card("logoshadow", theme.logo_shadow, theme.logo_shadow_opacity))
        parts.append(f"[headerpanel][logoshadow]overlay=x={x + theme.logo_shadow_offset}:y={y + theme.logo_shadow_offset}:shortest=1[shadowed]")
        parts.append(rounded_card("logobg", theme.logo_background, 1))
        parts.append(f"[shadowed][logobg]overlay=x={x}:y={y}:shortest=1[carded]")
        inner = size - 2 * theme.logo_padding
        parts.append(f"[1:v]scale=w='max(2,round(iw*if(gt(sar,0),sar,1)/2)*2)':h=ih,setsar=1,scale={inner}:{inner}:force_original_aspect_ratio=decrease,setsar=1[logo]")
        parts.append(f"[carded][logo]overlay=x='{x}+({size}-w)/2':y='{y}+({size}-h)/2':shortest=1[branded]")
        video_input = "[branded]"
    # ASS is applied after concat, so subtitle times follow the generated three-pass timeline.
    fonts_dir = Path(__file__).resolve().parents[2] / "assets" / "fonts"
    fonts_option = f":fontsdir='{_filter_value(fonts_dir.as_posix())}'" if options.frame_image else ""
    parts.append(f"{video_input}setsar=1,subtitles=filename='{_filter_value(ass_path.as_posix())}'{fonts_option},setsar=1[outv]")
    return ";".join(parts), render_lines


def _tail(path: Path, limit: int = 12) -> str:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    return "\n".join(lines[-limit:])


def _run_ffmpeg(
    command: list[str],
    *,
    duration: float,
    on_progress: ProgressCallback | None,
) -> None:
    with tempfile.NamedTemporaryFile(prefix="dlt-video-ffmpeg-", suffix=".log", delete=False) as log_file:
        log_path = Path(log_file.name)
    try:
        try:
            with log_path.open("w", encoding="utf-8") as stderr:
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=stderr,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )

                assert process.stdout is not None
                for raw_line in process.stdout:
                    key, separator, raw_value = raw_line.strip().partition("=")
                    if key != "out_time_ms" or not separator:
                        continue
                    try:
                        current_seconds = float(raw_value) / 1_000_000
                    except ValueError:
                        continue
                    if on_progress:
                        on_progress(min(99.9, max(0.0, current_seconds / max(duration, 0.001) * 100)))
                process.stdout.close()
                return_code = process.wait()
        except FileNotFoundError as error:
            raise RenderError(
                f"找不到 ffmpeg。{_ffmpeg_install_hint()}"
            ) from error
        if return_code != 0:
            detail = _tail(log_path)
            raise RenderError(
                "FFmpeg 生成失败。"
                + (f"\n{detail}" if detail else f" (exit code {return_code})")
            )
        if on_progress:
            on_progress(100.0)
    finally:
        try:
            log_path.unlink()
        except OSError:
            pass


def render_course(
    *,
    course: Course,
    dltjson: dict[str, Any],
    media_path: Path,
    output_path: Path,
    options: RenderOptions,
    logo_path: Path | None = None,
    on_progress: ProgressCallback | None = None,
) -> None:
    """Render one course locally; the server is only used earlier to fetch dltjson."""

    if not media_path.is_file():
        raise RenderError(f"本地媒体文件不存在：{media_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.resolve() == media_path.resolve():
        raise RenderError("输出文件不能覆盖源媒体文件")
    if logo_path is not None and not logo_path.is_file():
        raise RenderError(f"Logo 文件不存在：{logo_path}")
    if options.frame_image is not None and not options.frame_image.is_file():
        raise RenderError(f"背景模板不存在：{options.frame_image}")

    lines = load_renderable_lines(dltjson)
    if options.preview_line is not None:
        if not 1 <= options.preview_line <= len(lines):
            raise RenderError(f"预览句号必须在 1 到 {len(lines)} 之间")
        lines = [lines[options.preview_line - 1]]
    ensure_subtitle_filter()
    media = probe_media(media_path)
    total_duration = sum(line.duration + options.gap_seconds for line in lines) * 3

    with tempfile.TemporaryDirectory(prefix="dlt-video-render-") as temporary_directory:
        temporary = Path(temporary_directory)
        ass_path = temporary / "captions.ass"
        # Build the timeline once so ASS timestamps and FFmpeg concat timestamps cannot drift apart.
        filter_graph, render_lines = _build_filter_graph(
            media=media,
            lines=lines,
            options=options,
            ass_path=ass_path,
            has_logo=logo_path is not None,
        )
        _build_ass(
            course=course,
            lines=lines,
            render_lines=render_lines,
            options=options,
            path=ass_path,
        )
        filter_path = temporary / "filtergraph.txt"
        filter_path.write_text(filter_graph, encoding="utf-8")

        command = [
            _ffmpeg_binary(),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(media_path),
        ]
        if logo_path is not None:
            command.extend(["-loop", "1", "-i", str(logo_path)])
        if options.frame_image is not None:
            command.extend(["-loop", "1", "-i", str(options.frame_image)])
        command.extend(
            [
                # FFmpeg 9 removed the old -filter_complex_script option. Pass the
                # generated graph directly; it keeps this dependency-free CLI
                # compatible with current Homebrew and static FFmpeg builds.
                "-filter_complex",
                filter_graph,
                "-progress",
                "pipe:1",
                "-map",
                "[outv]",
                "-map",
                "[concata]",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-r",
                str(options.fps),
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
        _run_ffmpeg(command, duration=total_duration, on_progress=on_progress)
