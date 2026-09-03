from __future__ import annotations

import argparse
import getpass
import json
import os
import platform
import sys
from pathlib import Path
from typing import Any

from .api import OpenContentApiError, OpenContentClient, atomic_write_json, load_json
from .media import (
    build_manifest_template,
    downloaded_media_path,
    load_media_manifest,
    resolve_media_path,
)
from .models import Course
from .render import RenderError, RenderOptions, render_course


def _load_dotenv(path: Path) -> None:
    """Load simple KEY=value entries without adding a dependency to this local tool."""

    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


def _project_directory() -> Path:
    return Path(__file__).resolve().parents[2]


def _saved_environment_path() -> Path:
    return _project_directory() / ".env"


def _default_storage_path(environment_key: str, directory_name: str) -> str:
    """Keep generated files inside this project unless the user opts into another path."""

    configured = os.environ.get(environment_key)
    if configured:
        return configured
    return str(_project_directory() / directory_name)


def _save_interactive_config(base_url: str, api_key: str) -> None:
    """Persist first-run settings locally while preserving other .env options."""

    path = _saved_environment_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    existing_lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    replacements = {
        "DUOLINTING_API_BASE": base_url,
        "DUOLINTING_OPEN_CONTENT_API_KEY": api_key,
    }
    written_keys: set[str] = set()
    output_lines: list[str] = []
    for line in existing_lines:
        key, separator, _value = line.partition("=")
        normalized_key = key.strip()
        if separator and normalized_key in replacements:
            output_lines.append(f"{normalized_key}={replacements[normalized_key]}")
            written_keys.add(normalized_key)
        else:
            output_lines.append(line)
    if output_lines and output_lines[-1].strip():
        output_lines.append("")
    for key, value in replacements.items():
        if key not in written_keys:
            output_lines.append(f"{key}={value}")
    path.write_text("\n".join(output_lines).rstrip() + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _reset_interactive_config() -> None:
    path = _saved_environment_path()
    if path.is_file():
        retained = [
            line
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.split("=", 1)[0].strip()
            not in {"DUOLINTING_API_BASE", "DUOLINTING_BACKEND_URL", "DUOLINTING_OPEN_CONTENT_API_KEY"}
        ]
        path.write_text("\n".join(retained).rstrip() + ("\n" if retained else ""), encoding="utf-8")
    for key in ("DUOLINTING_API_BASE", "DUOLINTING_BACKEND_URL", "DUOLINTING_OPEN_CONTENT_API_KEY"):
        os.environ.pop(key, None)


def _default_font_name() -> str:
    if platform.system() == "Darwin":
        return "PingFang SC"
    if platform.system() == "Windows":
        return "Microsoft YaHei"
    return "Noto Sans CJK SC"


def _safe_name(value: str) -> str:
    normalized = " ".join(str(value).replace("\n", " ").split()).strip()
    for character in '<>:"/\\|?*':
        normalized = normalized.replace(character, "-")
    normalized = normalized.rstrip(". ")
    return normalized or "untitled"


def _read_terminal_key() -> str:
    """Read one navigation key without adding a third-party interactive dependency."""

    if os.name == "nt":
        import msvcrt

        key = msvcrt.getwch()
        if key in ("\x00", "\xe0"):
            return {"H": "up", "P": "down"}.get(msvcrt.getwch(), "")
        if key in ("\r", "\n"):
            return "enter"
        if key == "\x1b":
            return "escape"
        return key

    import termios
    import tty

    file_descriptor = sys.stdin.fileno()
    previous = termios.tcgetattr(file_descriptor)
    try:
        tty.setcbreak(file_descriptor)
        key = sys.stdin.read(1)
        if key == "\x1b":
            sequence = sys.stdin.read(2)
            return {"[A": "up", "[B": "down"}.get(sequence, "escape")
        if key in ("\r", "\n"):
            return "enter"
        return key
    finally:
        termios.tcsetattr(file_descriptor, termios.TCSADRAIN, previous)


def _select_option(title: str, options: list[tuple[str, Any]]) -> Any:
    if not options:
        raise RenderError(f"{title}：没有可选择的内容")
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        print(f"\n{title}")
        for index, (label, _value) in enumerate(options, start=1):
            print(f"  {index}. {label}")
        while True:
            try:
                selected = int(input("请输入编号并回车：").strip())
            except ValueError:
                print("请输入有效编号。")
                continue
            if 1 <= selected <= len(options):
                return options[selected - 1][1]
            print("编号超出范围，请重新输入。")

    selected_index = 0
    while True:
        # Redrawing keeps the menu compact even when the terminal window is small.
        print("\033[2J\033[H", end="")
        print(title)
        print("使用 ↑/↓ 选择，回车确认，按 q 退出。\n")
        for index, (label, _value) in enumerate(options):
            marker = "❯" if index == selected_index else " "
            print(f" {marker} {label}")
        key = _read_terminal_key()
        if key == "up":
            selected_index = (selected_index - 1) % len(options)
        elif key == "down":
            selected_index = (selected_index + 1) % len(options)
        elif key == "enter":
            return options[selected_index][1]
        elif key in ("q", "Q", "escape", "\x03"):
            raise KeyboardInterrupt


def _sorted_catalog_items(catalog: dict[str, Any], key: str) -> list[dict[str, Any]]:
    values = catalog.get(key, [])
    if not isinstance(values, list):
        return []
    return sorted(
        [value for value in values if isinstance(value, dict)],
        key=lambda value: (int(value.get("sortOrder", 0)), int(value.get("id", 0))),
    )


def _choose_interactive_course(catalog: dict[str, Any]) -> Course:
    groups = _sorted_catalog_items(catalog, "categoryGroups")
    categories = _sorted_catalog_items(catalog, "categories")
    courses = [
        Course.from_catalog(value)
        for value in catalog.get("courses", [])
        if isinstance(value, dict)
    ]
    categories_by_group: dict[int, list[dict[str, Any]]] = {}
    for category in categories:
        categories_by_group.setdefault(int(category.get("groupId", 0)), []).append(category)

    if groups:
        group = _select_option(
            "选择内容分类",
            [
                (
                    f"{value.get('name', '未命名')}  ·  {len(categories_by_group.get(int(value.get('id', 0)), []))} 个系列",
                    value,
                )
                for value in groups
            ],
        )
        group_id = int(group.get("id", 0))
        categories = categories_by_group.get(group_id, [])
    else:
        categories = categories or [{"id": 0, "name": "全部系列", "sortOrder": 0}]

    category = _select_option(
        "选择学习系列",
        [
            (
                f"{value.get('name', '未命名')}  ·  "
                f"{sum(1 for course in courses if course.category_id == int(value.get('id', 0)))} 门课程",
                value,
            )
            for value in categories
        ],
    )
    category_id = int(category.get("id", 0))
    category_courses = [course for course in courses if course.category_id == category_id]
    if not category_courses and category_id == 0:
        category_courses = courses
    category_courses.sort(key=lambda course: (course.sort_order, course.id))
    return _select_option(
        "选择课程",
        [
            (
                f"{course.sort_order:04d}  {course.title}  ·  {course.duration_label or '时长未知'}",
                course,
            )
            for course in category_courses
        ],
    )


def _choose_interactive_locale() -> str:
    return _select_option(
        "选择成片字幕语言",
        [
            ("中文（zh-CN）", "zh-CN"),
            ("日本語（ja-JP）", "ja-JP"),
            ("ไทย（th-TH）", "th-TH"),
            ("仅英文（en-US）", "en-US"),
        ],
    )


def _cache_catalog(cache_dir: Path) -> dict[str, Any]:
    return load_json(cache_dir / "catalog.json")


def _course_from_cache(cache_dir: Path, course_id: int) -> tuple[Course, dict[str, Any], dict[str, Any]]:
    catalog = _cache_catalog(cache_dir)
    courses = catalog.get("courses")
    if not isinstance(courses, list):
        raise RenderError("缓存目录中没有有效的 courses")
    value = next((item for item in courses if isinstance(item, dict) and int(item.get("id", 0)) == course_id), None)
    if value is None:
        raise RenderError(f"缓存目录中没有课程 {course_id}，请先运行 sync")
    course = Course.from_catalog(value)
    dltjson = load_json(cache_dir / "courses" / f"{course.id}.dltjson")
    return course, dltjson, catalog


def _course_with_dltjson_media(course: Course, dltjson: dict[str, Any]) -> Course:
    """Keep rendering compatible with caches created before mediaUrl was exported."""

    raw_course = dltjson.get("course")
    if not isinstance(raw_course, dict) or course.media_url:
        return course
    media_url = raw_course.get("mediaUrl") or raw_course.get("audioUrl")
    if not isinstance(media_url, str) or not media_url.strip():
        return course
    return Course(
        id=course.id,
        category_id=course.category_id,
        title=course.title,
        duration_label=course.duration_label,
        line_count=course.line_count,
        dltjson_url=course.dltjson_url,
        sort_order=course.sort_order,
        media_type=str(raw_course.get("mediaType") or course.media_type),
        media_url=media_url.strip(),
    )


def _download_progress(label: str):
    last_value = -1

    def report(received: int, total: int | None) -> None:
        nonlocal last_value
        if total:
            value = int(received / total * 100)
            if value == last_value:
                return
            last_value = value
            print(f"\r{label} {value:3d}%", end="", flush=True)
        else:
            value = received // (1024 * 1024)
            if value == last_value:
                return
            last_value = value
            print(f"\r{label} {value} MiB", end="", flush=True)

    return report


def _resolve_media_for_render(
    *,
    args: argparse.Namespace,
    course: Course,
    client: OpenContentClient | None = None,
) -> tuple[Path, OpenContentClient | None]:
    manifest_path = Path(args.manifest).expanduser().resolve() if args.manifest else None
    manifest = load_media_manifest(manifest_path) if manifest_path and manifest_path.is_file() else None
    media_dir = Path(args.media_dir).expanduser().resolve() if args.media_dir else None
    local_error: ValueError | None = None
    if manifest and str(course.id) in manifest:
        try:
            return resolve_media_path(course, manifest=manifest, media_dir=media_dir), client
        except ValueError as error:
            local_error = error
    elif media_dir is not None:
        try:
            return resolve_media_path(course, manifest=manifest, media_dir=media_dir), client
        except ValueError as error:
            local_error = error

    if not course.media_url:
        raise local_error or ValueError(
            f"课程 {course.id} 没有媒体地址。请重新 sync，或在 media-manifest.json 中指定本地文件。"
        )

    if client is None:
        base_url, api_key = _api_settings(args)
        client = OpenContentClient(base_url, api_key)
    download_directory = media_dir or Path(_default_storage_path("DUOLINTING_VIDEO_MEDIA_DIR", "media")).expanduser().resolve()
    destination = downloaded_media_path(course, download_directory)
    if destination.is_file() and destination.stat().st_size > 0:
        print(f"使用已缓存媒体：{destination}")
        return destination, client

    print(f"正在下载源媒体到 {destination}")
    client.download_media(
        course.media_url,
        destination,
        on_progress=_download_progress(f"下载 {course.title}"),
    )
    print()
    return destination, client


def _api_settings(args: argparse.Namespace) -> tuple[str, str]:
    base_url = str(
        args.api_base
        or os.environ.get("DUOLINTING_API_BASE")
        or os.environ.get("DUOLINTING_BACKEND_URL", "")
    ).strip()
    api_key = str(args.api_key or os.environ.get("DUOLINTING_OPEN_CONTENT_API_KEY", "")).strip()
    if not base_url:
        raise OpenContentApiError(
            "Missing service address. Set DUOLINTING_API_BASE (or DUOLINTING_BACKEND_URL), "
            "for example http://127.0.0.1:8102."
        )
    return base_url, api_key


def _command_sync(args: argparse.Namespace) -> int:
    base_url, api_key = _api_settings(args)
    cache_dir = Path(args.cache_dir).expanduser().resolve()
    client = OpenContentClient(base_url, api_key)
    catalog = client.fetch_catalog()
    atomic_write_json(cache_dir / "catalog.json", catalog)

    courses = [Course.from_catalog(value) for value in catalog.get("courses", []) if isinstance(value, dict)]
    for index, course in enumerate(courses, start=1):
        dltjson = client.fetch_course_dltjson(course)
        atomic_write_json(cache_dir / "courses" / f"{course.id}.dltjson", dltjson)
        print(f"[{index}/{len(courses)}] synced {course.id} {course.title}")
    atomic_write_json(cache_dir / "media-manifest.example.json", build_manifest_template(catalog))
    print(f"Synced {len(courses)} published courses into {cache_dir}")
    print("Media is downloaded only when a course is selected for local rendering; it is never encoded on the server.")
    return 0


def _command_list(args: argparse.Namespace) -> int:
    catalog = _cache_catalog(Path(args.cache_dir).expanduser().resolve())
    courses = [Course.from_catalog(value) for value in catalog.get("courses", []) if isinstance(value, dict)]
    for course in sorted(courses, key=lambda item: (item.category_id, item.sort_order, item.id)):
        print(f"{course.id}\t{course.title}\t{course.line_count} lines\t{course.duration_label}")
    print(f"{len(courses)} courses")
    return 0


def _render_options(args: argparse.Namespace) -> RenderOptions:
    if args.gap_seconds < 0:
        raise RenderError("--gap-seconds 不能小于 0")
    return RenderOptions(
        locale=args.locale,
        font_name=args.font_name,
        gap_seconds=args.gap_seconds,
    )


def _render_one(
    *,
    args: argparse.Namespace,
    course: Course,
    dltjson: dict[str, Any],
    catalog: dict[str, Any],
    output_path: Path,
    progress_prefix: str = "",
    client: OpenContentClient | None = None,
) -> None:
    course = _course_with_dltjson_media(course, dltjson)
    media_path, _client = _resolve_media_for_render(args=args, course=course, client=client)
    logo_path = Path(args.logo).expanduser().resolve() if args.logo else None
    options = _render_options(args)
    last_reported = -1

    def report(value: float) -> None:
        nonlocal last_reported
        rounded = int(value)
        if rounded == last_reported:
            return
        last_reported = rounded
        print(f"{progress_prefix}{course.id} {course.title}: {rounded}%", flush=True)

    # catalog is passed explicitly to keep render-all's directory decision visible at the call site.
    del catalog
    render_course(
        course=course,
        dltjson=dltjson,
        media_path=media_path,
        output_path=output_path,
        options=options,
        logo_path=logo_path,
        on_progress=report,
    )


def _command_render(args: argparse.Namespace) -> int:
    cache_dir = Path(args.cache_dir).expanduser().resolve()
    course, dltjson, catalog = _course_from_cache(cache_dir, args.course_id)
    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else Path(args.output_dir).expanduser().resolve() / f"{course.id}-{_safe_name(course.title)}.mp4"
    )
    _render_one(args=args, course=course, dltjson=dltjson, catalog=catalog, output_path=output_path)
    print(f"Generated {output_path}")
    return 0


def _directory_for_course(catalog: dict[str, Any], course: Course, output_dir: Path) -> Path:
    categories = catalog.get("categories", [])
    groups = catalog.get("categoryGroups", [])
    category = next((item for item in categories if isinstance(item, dict) and int(item.get("id", 0)) == course.category_id), None)
    group_id = int(category.get("groupId", 0)) if isinstance(category, dict) else 0
    group = next((item for item in groups if isinstance(item, dict) and int(item.get("id", 0)) == group_id), None)
    group_name = _safe_name(str(group.get("name", "uncategorized"))) if isinstance(group, dict) else "uncategorized"
    category_name = _safe_name(str(category.get("name", "uncategorized"))) if isinstance(category, dict) else "uncategorized"
    return output_dir / group_name / category_name


def _command_render_all(args: argparse.Namespace) -> int:
    cache_dir = Path(args.cache_dir).expanduser().resolve()
    catalog = _cache_catalog(cache_dir)
    courses = [Course.from_catalog(value) for value in catalog.get("courses", []) if isinstance(value, dict)]
    output_dir = Path(args.output_dir).expanduser().resolve()
    failures = 0
    for course in sorted(courses, key=lambda item: (item.category_id, item.sort_order, item.id)):
        try:
            dltjson = load_json(cache_dir / "courses" / f"{course.id}.dltjson")
            output_path = _directory_for_course(catalog, course, output_dir) / f"{course.sort_order:04d}-{_safe_name(course.title)}.mp4"
            _render_one(
                args=args,
                course=course,
                dltjson=dltjson,
                catalog=catalog,
                output_path=output_path,
                progress_prefix="  ",
            )
            print(f"Generated {output_path}")
        except (RenderError, ValueError) as error:
            failures += 1
            print(f"Skipped {course.id} {course.title}: {error}", file=sys.stderr)
    if failures:
        print(f"Completed with {failures} failed course(s)", file=sys.stderr)
        return 1
    print(f"Generated {len(courses)} course video(s) in {output_dir}")
    return 0


def _interactive(*, reset_config: bool = False) -> int:
    """Run the one-command local workflow for people who do not want CLI flags."""

    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise RenderError("交互模式需要在终端中运行；脚本环境请使用 sync/list/render 子命令。")

    print("DuolinTing 本地视频生成器\n")
    if reset_config:
        _reset_interactive_config()
        print("已清除本地服务端地址和 API Key，请重新设置。\n")
    default_base = (
        os.environ.get("DUOLINTING_API_BASE")
        or os.environ.get("DUOLINTING_BACKEND_URL")
        or "http://127.0.0.1:8102"
    )
    configured_base = os.environ.get("DUOLINTING_API_BASE") or os.environ.get("DUOLINTING_BACKEND_URL")
    if configured_base and not reset_config:
        base_url = configured_base.strip()
        print(f"已使用保存的服务端地址：{base_url}")
    else:
        entered_base = input(f"服务端地址（Admin/Backend）[{default_base}]: ").strip()
        base_url = entered_base or default_base
    api_key = os.environ.get("DUOLINTING_OPEN_CONTENT_API_KEY", "").strip()
    if not api_key:
        api_key = getpass.getpass("请输入开放内容 API Key（输入不会显示）：").strip()
    _save_interactive_config(base_url, api_key)

    client = OpenContentClient(base_url, api_key)
    print("正在读取课程目录……")
    catalog = client.fetch_catalog()
    cache_dir = Path(_default_storage_path("DUOLINTING_VIDEO_CACHE_DIR", "cache")).expanduser().resolve()
    media_dir = Path(_default_storage_path("DUOLINTING_VIDEO_MEDIA_DIR", "media")).expanduser().resolve()
    output_dir = Path(_default_storage_path("DUOLINTING_VIDEO_OUTPUT_DIR", "output")).expanduser().resolve()
    atomic_write_json(cache_dir / "catalog.json", catalog)

    course = _choose_interactive_course(catalog)
    locale = _choose_interactive_locale()
    print(f"\n正在读取字幕：{course.title}")
    dltjson = client.fetch_course_dltjson(course)
    atomic_write_json(cache_dir / "courses" / f"{course.id}.dltjson", dltjson)
    course = _course_with_dltjson_media(course, dltjson)

    render_args = argparse.Namespace(
        api_base=base_url,
        api_key=api_key,
        cache_dir=str(cache_dir),
        media_dir=str(media_dir),
        manifest=str(_project_directory() / "media-manifest.json"),
    )
    media_path, _ = _resolve_media_for_render(args=render_args, course=course, client=client)
    logo_candidate = os.environ.get("DUOLINTING_VIDEO_LOGO", "").strip()
    if not logo_candidate:
        repository_logo = Path(__file__).resolve().parents[3] / "admin" / "public" / "duolinting-logo-ear.png"
        logo_candidate = str(repository_logo) if repository_logo.is_file() else ""
    logo_path = Path(logo_candidate).expanduser().resolve() if logo_candidate else None
    output_path = output_dir / f"{course.id}-{_safe_name(course.title)}.mp4"
    if output_path.exists():
        replace = input(f"\n{output_path} 已存在，覆盖它？[y/N]：").strip().lower()
        if replace not in {"y", "yes"}:
            raise RenderError("已取消，未覆盖原有视频。")

    options = RenderOptions(locale=locale, font_name=_default_font_name())
    last_reported = -1

    def report(value: float) -> None:
        nonlocal last_reported
        rounded = int(value)
        if rounded == last_reported:
            return
        last_reported = rounded
        print(f"\r正在生成 {course.title}：{rounded}%", end="", flush=True)

    print(f"\n开始本地生成：{output_path}")
    render_course(
        course=course,
        dltjson=dltjson,
        media_path=media_path,
        output_path=output_path,
        options=options,
        logo_path=logo_path,
        on_progress=report,
    )
    print(f"\n生成完成：{output_path}")
    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dlt-video",
        description="Local DuolinTing dltjson + FFmpeg video generator",
    )
    parser.add_argument("--version", action="version", version="0.1.0")
    parser.add_argument(
        "--reset-config",
        action="store_true",
        help="清除已保存的服务端地址和 API Key，并重新进入交互设置",
    )
    subparsers = parser.add_subparsers(dest="command")

    sync = subparsers.add_parser("sync", help="Fetch the published catalog and dltjson files")
    sync.add_argument("--api-base", help="Admin origin, or DUOLINTING_API_BASE")
    sync.add_argument("--api-key", help="API key, or DUOLINTING_OPEN_CONTENT_API_KEY")
    sync.add_argument("--cache-dir", default=_default_storage_path("DUOLINTING_VIDEO_CACHE_DIR", "cache"))
    sync.set_defaults(handler=_command_sync)

    list_command = subparsers.add_parser("list", help="List courses in the local cache")
    list_command.add_argument("--cache-dir", default=_default_storage_path("DUOLINTING_VIDEO_CACHE_DIR", "cache"))
    list_command.set_defaults(handler=_command_list)

    def add_render_arguments(command: argparse.ArgumentParser) -> None:
        command.add_argument("--api-base", help="Admin origin, or DUOLINTING_API_BASE (used when media must be downloaded)")
        command.add_argument("--api-key", help="API key, or DUOLINTING_OPEN_CONTENT_API_KEY (used when media must be downloaded)")
        command.add_argument("--cache-dir", default=_default_storage_path("DUOLINTING_VIDEO_CACHE_DIR", "cache"))
        command.add_argument("--media-dir", default=_default_storage_path("DUOLINTING_VIDEO_MEDIA_DIR", "media"))
        command.add_argument("--manifest", default=str(_project_directory() / "media-manifest.json"))
        command.add_argument("--locale", choices=("en-US", "zh-CN", "th-TH", "ja-JP"), default="zh-CN")
        command.add_argument("--font-name", default=_default_font_name())
        command.add_argument("--gap-seconds", type=float, default=0.3)
        command.add_argument("--logo", help="Optional local logo PNG, for example ../admin/public/duolinting-logo-ear.png")
        command.add_argument("--output-dir", default=_default_storage_path("DUOLINTING_VIDEO_OUTPUT_DIR", "output"))

    render = subparsers.add_parser("render", help="Render one cached course locally")
    render.add_argument("--course-id", type=int, required=True)
    render.add_argument("--output", help="Exact output MP4 path")
    add_render_arguments(render)
    render.set_defaults(handler=_command_render)

    render_all = subparsers.add_parser("render-all", help="Render every cached course into group/category folders")
    add_render_arguments(render_all)
    render_all.set_defaults(handler=_command_render_all)
    return parser


def main() -> None:
    project_dir = _project_directory()
    # Prefer the directory from which the local command is launched, while keeping
    # editable installs convenient when invoked from the project directory itself.
    _load_dotenv(Path.cwd() / ".env")
    _load_dotenv(project_dir / ".env")
    args = _parser().parse_args()
    try:
        if args.reset_config and args.command is not None:
            raise RenderError("--reset-config 只能在交互模式下使用，请不要与子命令一起传入。")
        exit_code = _interactive(reset_config=args.reset_config) if args.command is None else args.handler(args)
    except KeyboardInterrupt:
        print("\n已取消。", file=sys.stderr)
        exit_code = 130
    except (OpenContentApiError, RenderError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        exit_code = 1
    raise SystemExit(exit_code)
