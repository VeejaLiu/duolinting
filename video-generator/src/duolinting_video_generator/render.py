from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .models import Course, RenderLine, TranscriptLine

ProgressCallback = Callable[[float], None]


class RenderError(RuntimeError):
    """A user-facing local rendering error."""


@dataclass(frozen=True)
class RenderOptions:
    """Stable output settings shared by every locally generated course video."""

    width: int = 1080
    height: int = 1440
    media_height: int = 608
    header_height: int = 150
    fps: int = 30
    gap_seconds: float = 0.3
    locale: str = "zh-CN"
    font_name: str = "PingFang SC"


@dataclass(frozen=True)
class ProbedMedia:
    has_video: bool
    has_audio: bool


def _ffmpeg_binary() -> str:
    return os.environ.get("DUOLINTING_FFMPEG_BIN", "ffmpeg").strip() or "ffmpeg"


def _ffprobe_binary() -> str:
    return os.environ.get("DUOLINTING_FFPROBE_BIN", "ffprobe").strip() or "ffprobe"


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
            "或设置 DUOLINTING_FFMPEG_BIN/DUOLINTING_FFPROBE_BIN。"
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
            " macOS 可安装包含完整滤镜的版本：brew install ffmpeg-full；"
            "安装后重新运行本地生成命令。"
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


def _wrap_ass_text(value: str, width: int) -> str:
    # textwrap works for CJK too (it counts Unicode code points), while preserving
    # existing words for English sentences.
    chunks: list[str] = []
    for paragraph in value.splitlines() or [value]:
        chunks.extend(textwrap.wrap(paragraph, width=width, break_long_words=True, break_on_hyphens=False) or [""])
    return "\\N".join(chunks)


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
    title = _ass_escape(course.title)
    if locale == "en-US":
        tagline = "Open-source, non-profit English learning"
    elif locale == "th-TH":
        tagline = "แอปเรียนอังกฤษโอเพนซอร์ส ไม่แสวงกำไร"
    elif locale == "ja-JP":
        tagline = "オープンソース・非営利の英語学習アプリ"
    else:
        tagline = "开源非盈利 · 英语学习应用"

    events = [
        f"Dialogue: 0,{_ass_time(0)},{_ass_time(total_duration)},Header,,0,0,0,,{{\\an7\\pos(88,42)}}DuolinTing",
        f"Dialogue: 0,{_ass_time(0)},{_ass_time(total_duration)},Tagline,,0,0,0,,{{\\an7\\pos(88,92)}}{_ass_escape(tagline)}",
        f"Dialogue: 0,{_ass_time(0)},{_ass_time(total_duration)},Course,,0,0,0,,{{\\an9\\pos(1020,66)}}{title}",
    ]

    for render_line in render_lines:
        start = _ass_time(render_line.timeline_start)
        end = _ass_time(render_line.timeline_start + render_line.line.duration)
        phase = _ass_escape(_phase_text(locale, render_line.round_number))
        events.append(
            f"Dialogue: 0,{start},{end},Phase,,0,0,0,,{{\\an7\\pos(70,790)}}{phase}"
        )
        if render_line.round_number != 3:
            continue
        english = _wrap_ass_text(_ass_escape(render_line.line.text), 36)
        events.append(
            f"Dialogue: 0,{start},{end},English,,0,0,0,,{{\\an5\\pos(540,1015)}}{english}"
        )
        translated = _translation(render_line.line, locale)
        if translated:
            translation = _wrap_ass_text(_ass_escape(translated), 34)
            events.append(
                f"Dialogue: 0,{start},{end},Translation,,0,0,0,,{{\\an5\\pos(540,1150)}}{translation}"
            )

    content = "\n".join(
        [
            "[Script Info]",
            "ScriptType: v4.00+",
            "PlayResX: 1080",
            "PlayResY: 1440",
            "WrapStyle: 2",
            "ScaledBorderAndShadow: yes",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            f"Style: Header,{options.font_name},42,&H00FFFFFF,&H00FFFFFF,&H00101010,&H99000000,-1,0,0,0,100,100,0,0,1,2,1,7,40,40,20,1",
            f"Style: Tagline,{options.font_name},22,&H00BFEAFF,&H00BFEAFF,&H00101010,&H99000000,-1,0,0,0,100,100,0,0,1,2,1,7,40,40,20,1",
            f"Style: Course,{options.font_name},24,&H00FFFFFF,&H00FFFFFF,&H00101010,&H99000000,-1,0,0,0,100,100,0,0,1,2,1,9,40,40,20,1",
            f"Style: Phase,{options.font_name},24,&H00A9E4FF,&H00A9E4FF,&H00101010,&H99000000,-1,0,0,0,100,100,0,0,1,2,1,7,40,40,20,1",
            f"Style: English,{options.font_name},54,&H00FFFFFF,&H00FFFFFF,&H00101010,&HCC000000,-1,0,0,0,100,100,0,0,1,3,1,5,60,60,20,1",
            f"Style: Translation,{options.font_name},34,&H00D4D4D4,&H00D4D4D4,&H00101010,&HCC000000,-1,0,0,0,100,100,0,0,1,2,1,5,60,60,20,1",
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
            *events,
            "",
        ]
    )
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
        parts.append(f"[0:v]split={segment_count}{source_labels}")
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
                    f"[vbg{index}]scale={options.width}:{options.media_height}:force_original_aspect_ratio=increase,crop={options.width}:{options.media_height},boxblur=20:2[blur{index}]",
                    f"[vfg{index}]scale={options.width}:{options.media_height}:force_original_aspect_ratio=decrease[fit{index}]",
                    f"[blur{index}][fit{index}]overlay=(W-w)/2:(H-h)/2:shortest=1[media{index}]",
                    f"[media{index}]pad={options.width}:{options.height}:0:{options.header_height}:color=#050505,tpad=stop_mode=clone:stop_duration={_decimal(options.gap_seconds)}[v{index}]",
                ]
            )
        else:
            parts.append(
                f"color=c=#102c42:s={options.width}x{options.media_height}:r={options.fps}:d={_decimal(render_line.line.duration)},"
                f"pad={options.width}:{options.height}:0:{options.header_height}:color=#050505,tpad=stop_mode=clone:stop_duration={_decimal(options.gap_seconds)}[v{index}]"
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
    video_input = "[concatv]"
    if has_logo:
        parts.append(
            "[1:v]scale=64:64:force_original_aspect_ratio=decrease[logo];"
            "[concatv][logo]overlay=45:38:shortest=1[branded]"
        )
        video_input = "[branded]"
    # ASS is applied after concat, so subtitle times follow the generated three-pass timeline.
    parts.append(f"{video_input}subtitles=filename='{_filter_value(ass_path.as_posix())}'[outv]")
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
                return_code = process.wait()
        except FileNotFoundError as error:
            raise RenderError(
                "找不到 ffmpeg。请先安装 FFmpeg，或设置 DUOLINTING_FFMPEG_BIN 指向本地可执行文件。"
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

    lines = load_renderable_lines(dltjson)
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
