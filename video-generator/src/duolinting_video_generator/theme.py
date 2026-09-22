"""Video theme: dimensions are square pixels, colors are ordinary #RRGGBB."""
from __future__ import annotations

import math
import re
import tomllib
from dataclasses import dataclass, fields
from pathlib import Path


@dataclass(frozen=True)
class VideoTheme:
    width: int = 1080
    height: int = 1440
    header_height: int = 168
    media_height: int = 608
    margin: int = 48
    background: str = "#85d665"
    header_background: str = "#55c8f6"
    panel_background: str = "#fffdeb"
    highlight_color: str = "#ff5974"
    trim_color: str = "#ffdb45"
    watermark_opacity: float = 0.28
    watermark_size: int = 26
    watermark_count: int = 3
    watermark_cycle_seconds: float = 23.0
    muted_color: str = "#284c6b"
    brand_line_height: float = 1.1
    brand_row_gap: int = 6
    logo_gap: int = 24
    audio_background: str = "#102c42"
    accent: str = "#087aba"
    foreground: str = "#08274e"
    translation_color: str = "#28476b"
    outline_color: str = "#000000"
    logo_size: int = 112
    logo_padding: int = 12
    logo_radius: int = 24
    logo_background: str = "#ffffff"
    logo_shadow: str = "#263f4d"
    logo_shadow_opacity: float = 0.72
    logo_shadow_offset: int = 0
    brand_size: int = 44
    tagline_size: int = 26
    website_size: int = 24
    url_cycle_seconds: float = 6.0
    title_size: int = 30
    title_width_ratio: float = 0.38
    title_top: int = 28
    phase_size: int = 29
    english_size: int = 72
    translation_size: int = 44
    min_caption_size: int = 24
    outline: int = 0
    shadow: int = 0
    line_height: float = 1.2
    caption_gap: int = 18
    section_gap: int = 20
    blur_radius: int = 20
    fade_in_ms: int = 120
    fade_out_ms: int = 140
    slide_ms: int = 240
    slide_distance: int = 32
    entrance_scale: int = 94

    def __post_init__(self) -> None:
        # Reject invalid dimensions/colors before they enter FFmpeg/ASS syntax.
        for item in fields(self):
            value = getattr(self, item.name)
            default = item.default
            if isinstance(default, str):
                if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
                    raise ValueError(f"主题 {item.name} 必须为 #RRGGBB 颜色")
            elif isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError(f"主题 {item.name} 必须为非负有限数字")
            elif isinstance(default, int) and not isinstance(value, int):
                raise ValueError(f"主题 {item.name} 必须为整数")
        if self.width < 480 or self.height < 640 or self.width % 2 or self.height % 2:
            raise ValueError("画布至少为 480×640，宽高必须为偶数")
        if self.media_height < 2 or self.media_height % 2:
            raise ValueError("media_height 必须为正偶数")
        if self.header_height < self.logo_size + 20 or self.logo_size <= 2 * self.logo_padding:
            raise ValueError("顶部空间或 Logo 内边距不合适")
        if self.logo_radius > self.logo_size / 2 or self.logo_shadow_opacity > 1:
            raise ValueError("Logo 圆角或阴影透明度超出范围")
        if self.watermark_opacity > 1 or not 12 <= self.watermark_size <= 60:
            raise ValueError("水印透明度必须为 0–1，字号必须为 12–60")
        if not 1 <= self.watermark_count <= 5 or not 8 <= self.watermark_cycle_seconds <= 120:
            raise ValueError("水印数量必须为 1–5，移动周期为 8–120 秒")
        if self.width - self.logo_size - 2 * self.margin - self.logo_gap < 160:
            raise ValueError("品牌文字区域太窄")
        if not 0.2 <= self.title_width_ratio <= 0.5 or self.title_top + self.title_size * self.line_height > self.header_height:
            raise ValueError("右上角标题区域超出范围")
        if self.caption_width - self.logo_size - self.logo_gap - self.title_width - self.section_gap < 120:
            raise ValueError("品牌与标题区域过窄，请调整画布或标题宽度")
        if self.caption_width < 160 or self.caption_bottom - self.caption_top < 180:
            raise ValueError("字幕区域太小，请增加画布或减小顶部/媒体区域")
        if self.brand_line_height < 1 or (self.brand_size + self.tagline_size + self.website_size) * self.brand_line_height + 2 * self.brand_row_gap > self.header_height - 24:
            raise ValueError("品牌文字超出顶部高度，请减小字号/行距或增加顶部高度")
        if self.line_height < 1.2 or self.min_caption_size < 12:
            raise ValueError("行高至少为 1.2，最小字幕字号至少为 12")
        if min(self.brand_size, self.tagline_size, self.website_size, self.title_size, self.phase_size, self.english_size, self.translation_size) < self.min_caption_size:
            raise ValueError("文字字号不能小于 min_caption_size")
        if not 2 <= self.url_cycle_seconds <= 60:
            raise ValueError("网址轮播周期必须在 2 到 60 秒之间")
        if self.blur_radius > min(self.width, self.media_height) // 4:
            raise ValueError("模糊半径不能超过媒体区短边的四分之一")
        if self.entrance_scale < 1 or self.entrance_scale > 100:
            raise ValueError("entrance_scale 必须在 1 到 100 之间")

    @property
    def caption_width(self) -> int:
        return self.width - 2 * self.margin - 32

    @property
    def title_width(self) -> int:
        return round(self.caption_width * self.title_width_ratio)

    @property
    def caption_top(self) -> int:
        # Only the phase stays below media; the course title lives in the header.
        return round(self.header_height + self.media_height + 2 * self.section_gap + self.phase_size * self.line_height + 40)

    @property
    def caption_bottom(self) -> int:
        # Reserve the bottom strip for sentence progress, outside the caption card.
        return self.height - self.margin - self.slide_distance - 64


def load_theme(path: Path | None) -> VideoTheme:
    if path is None:
        return VideoTheme()
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    known = {item.name for item in fields(VideoTheme)}
    unknown = data.keys() - known
    if unknown:
        raise ValueError(f"未知主题字段：{', '.join(sorted(unknown))}")
    return VideoTheme(**data)
