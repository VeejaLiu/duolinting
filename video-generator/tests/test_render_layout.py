"""Run with PYTHONPATH=video-generator/src python3 -m unittest discover -s video-generator/tests."""
import json
import shutil
import subprocess
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from duolinting_video_generator.models import Course, TranscriptLine, RenderLine
from duolinting_video_generator.render import (RenderError, RenderOptions, _caption_layout, _wrap_text,
                                              _ffmpeg_binary, _ffprobe_binary, render_course, _build_ass, _website_events)
from duolinting_video_generator.theme import VideoTheme, load_theme


class LayoutTests(unittest.TestCase):
    def test_media_height_moves_captions(self):
        base = VideoTheme()
        taller = replace(base, media_height=base.media_height + 100)
        self.assertEqual(taller.caption_top, base.caption_top + 100)

    def test_long_bilingual_caption_fits_available_space(self):
        theme = VideoTheme()
        en, en_size, tr, tr_size = _caption_layout(
            "Learning to listen carefully takes practice and patience. " * 3,
            "练习精听需要耐心，也需要反复听清每个句子。" * 3, theme)
        self.assertLess(en_size, theme.english_size)
        used = (len(en) * en_size + len(tr) * tr_size) * theme.line_height + theme.caption_gap
        self.assertLessEqual(used, theme.caption_bottom - theme.caption_top)

    def test_unfittable_caption_fails_without_truncation(self):
        with self.assertRaises(RenderError):
            _caption_layout("word " * 2000, "译文" * 2000, VideoTheme())

    def test_combining_marks_stay_with_base(self):
        rows = _wrap_text("a\u0301" * 40, 40, 160)
        self.assertEqual("".join(rows), "a\u0301" * 40)
        self.assertTrue(all(not row.startswith("\u0301") for row in rows))

    def test_theme_rejects_typos_and_invalid_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "theme.toml"
            for text in ('english_sze = 60', 'width = 1081', 'background = "red"', 'line_height = nan'):
                path.write_text(text)
                with self.assertRaises(ValueError):
                    load_theme(path)

    def test_english_balances_lines_without_orphan_word(self):
        sentence = "George wants to jump into the big puddle first."
        rows, _, _, _ = _caption_layout(sentence, "乔治想第一个跳到泥坑里去玩", VideoTheme())
        self.assertEqual(" ".join(rows), sentence)
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(len(row.split()) > 1 for row in rows))
        self.assertTrue(rows[-1].endswith("puddle first."))

    def test_title_uses_header_right_margin(self):
        theme = VideoTheme()
        line = TranscriptLine(0, 1, "Hello")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "captions.ass"
            _build_ass(course=Course(0, 0, "Muddy Puddles", "", 1, ""), lines=[line],
                       render_lines=[RenderLine(line, 3, 0, 1.3)],
                       options=RenderOptions(theme=theme), path=path)
            title = next(row for row in path.read_text().splitlines() if row.startswith("Dialogue:") and ",Course," in row)
            self.assertIn(r"\an9", title)
            self.assertIn(f"pos({theme.width - theme.margin},{theme.title_top})", title)
            self.assertLess(theme.title_top, theme.header_height)

    def test_ticker_has_both_https_addresses_and_repeats(self):
        events = _website_events("zh-CN", 184, 118, 848, 24, 27, 7, 6)
        self.assertTrue(any("https://app.duolinting.cn" in event for event in events))
        self.assertTrue(any("https://mobile.duolinting.cn" in event for event in events))
        self.assertTrue(all(r"\clip(184,118,1032,145)" in event for event in events))
        self.assertTrue(any("0:00:06.00,0:00:07.00" in event and "https://app." in event for event in events))

    def test_theme_partial_override_keeps_defaults(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "theme.toml"
            path.write_text('english_size = 72\naccent = "#1cb0f6"\n')
            theme = load_theme(path)
            self.assertEqual(theme.english_size, 72)
            self.assertEqual(theme.width, 1080)

    def test_watermark_covers_gaps_and_blind_passes_hide_transcript(self):
        line = TranscriptLine(0, 1, "Secret sentence", translations={"zh-CN": "隐藏原句"})
        passes = [RenderLine(line, i + 1, i * 1.3, (i + 1) * 1.3) for i in range(3)]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.ass"
            _build_ass(course=Course(0, 0, "Test", "", 1, ""), lines=[line],
                       render_lines=passes, options=RenderOptions(), path=path)
            events = [r for r in path.read_text().splitlines() if r.startswith("Dialogue:")]
            watermarks = [r for r in events if ",Watermark," in r]
            for mark in range(3):
                route = [r for r in watermarks if f",wm{mark}," in r]
                self.assertIn("0:00:00.00,0:00:00.50", route[0])
                self.assertIn("0:00:03.50,0:00:03.90", route[-1])
                self.assertTrue(all(r"\move(" in r for r in route))
            captions = [r for r in events if "Secret sentence" in r or "隐藏原句" in r]
            self.assertEqual(len(captions), 2)
            self.assertTrue(all("0:00:02.60,0:00:03.60" in r for r in captions))

    def test_watermark_rejects_invalid_opacity(self):
        with self.assertRaises(ValueError):
            VideoTheme(watermark_opacity=1.1)


class AspectRatioTests(unittest.TestCase):
    def test_illustrated_frame_preserves_media_and_duration(self):
        ffmpeg, ffprobe = _ffmpeg_binary(), _ffprobe_binary()
        with tempfile.TemporaryDirectory() as directory:
            source, frame, output = [Path(directory) / name for name in ("source.mp4", "frame.png", "result.mp4")]
            subprocess.run([ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=blue:s=320x240:r=30:d=0.3",
                            "-c:v", "libx264", str(source)], check=True)
            subprocess.run([ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=red:s=720x1280",
                            "-frames:v", "1", str(frame)], check=True)
            theme = replace(VideoTheme(), width=720, height=1280, media_height=406, watermark_opacity=0)
            render_course(course=Course(0, 0, "Frame", "", 1, ""),
                          dltjson={"lines": [{"start": 0, "end": .2, "text": "Test"}]},
                          media_path=source, output_path=output, logo_path=frame,
                          options=RenderOptions(theme=theme, frame_image=frame, gap_seconds=.1))
            duration = float(subprocess.check_output([ffprobe, "-v", "error", "-show_entries", "format=duration",
                                                    "-of", "default=nw=1:nk=1", str(output)]))
            self.assertAlmostEqual(duration, .9, delta=.15)
            pixels = subprocess.check_output([ffmpeg, "-v", "error", "-i", str(output), "-frames:v", "1",
                                              "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
            def pixel(x, y):
                start = (y * 720 + x) * 3
                return pixels[start:start+3]
            # The frame survives outside the video window, while the blue source
            # replaces its red interior. This also exercises logo/frame input order.
            self.assertGreater(pixel(10, 10)[0], 200)
            self.assertGreater(pixel(360, 350)[2], 200)

    def test_anamorphic_input_does_not_stretch_composite(self):
        ffmpeg, ffprobe = _ffmpeg_binary(), _ffprobe_binary()
        if not shutil.which(ffmpeg) or not shutil.which(ffprobe):
            self.skipTest("FFmpeg/ffprobe not installed")
        filters = subprocess.check_output([ffmpeg, "-hide_banner", "-filters"], text=True, stderr=subprocess.DEVNULL)
        if "subtitles" not in filters:
            self.skipTest("FFmpeg lacks libass")
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.mp4", Path(directory) / "result.mp4"
            subprocess.run([ffmpeg, "-v", "error", "-f", "lavfi", "-i",
                            "color=blue:s=320x240:r=30:d=0.3", "-vf", "setsar=4/3",
                            "-c:v", "libx264", str(source)], check=True)
            theme = replace(VideoTheme(), width=720, height=1280, media_height=406)
            render_course(course=Course(0, 0, "Aspect test", "", 1, ""),
                          dltjson={"lines": [{"start": 0, "end": .2, "text": "Test"}]},
                          media_path=source, output_path=output,
                          options=RenderOptions(theme=theme, gap_seconds=.1))
            result = json.loads(subprocess.check_output([
                ffprobe, "-v", "error", "-show_entries",
                "stream=codec_type,width,height,sample_aspect_ratio,display_aspect_ratio:format=duration",
                "-of", "json", str(output)]))
            video = next(stream for stream in result["streams"] if stream["codec_type"] == "video")
            self.assertEqual(video["sample_aspect_ratio"], "1:1")
            self.assertEqual(video["display_aspect_ratio"], "9:16")
            self.assertEqual((video["width"], video["height"]), (720, 1280))
            self.assertTrue(any(stream["codec_type"] == "audio" for stream in result["streams"]))
            self.assertAlmostEqual(float(result["format"]["duration"]), .9, delta=.15)


if __name__ == "__main__":
    unittest.main()
