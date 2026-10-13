"""Regression coverage for drift across many fractional, three-pass cuts."""
import array
import json
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from dataclasses import replace
from pathlib import Path

from duolinting_video_generator.models import TranscriptLine
from duolinting_video_generator.render import (
    ProbedMedia, RenderOptions, _build_filter_graph, _build_render_lines,
    _ffmpeg_binary, _ffprobe_binary, _validate_output_timing, RenderError,
)
from duolinting_video_generator.theme import VideoTheme


class TimelineTests(unittest.TestCase):
    def test_delivery_guard_rejects_drift_in_either_stream(self):
        for kind in ("video", "audio"):
            streams = [{"codec_type": k, "duration": 10.2 if k == kind else 10}
                       for k in ("video", "audio")]
            probe = subprocess.CompletedProcess([], 0, json.dumps({"streams": streams}), "")
            with self.subTest(kind=kind), patch("duolinting_video_generator.render._run_checked", return_value=probe):
                with self.assertRaises(RenderError):
                    _validate_output_timing(Path("unused.mp4"), 10, 30)

    def test_exact_frame_edges_do_not_gain_a_frame_from_float_noise(self):
        passes = _build_render_lines([TranscriptLine(.1, .2, "Test")], RenderOptions())
        self.assertEqual([round(p.timeline_end * 30) for p in passes], [12, 24, 36])

    def test_fractional_passes_and_gaps_use_one_integer_frame_clock(self):
        options = RenderOptions(fps=29, gap_seconds=.017)
        passes = _build_render_lines([TranscriptLine(.041, .178, "Test")] * 100, options)
        self.assertEqual(len(passes), 300)
        self.assertEqual([p.round_number for p in passes[:6]], [1, 2, 3, 1, 2, 3])
        # .154 seconds becomes five frames at 29 fps, for EVERY stream/label.
        self.assertEqual(passes[-1].timeline_end, 1500 / 29)
        for i, p in enumerate(passes):
            self.assertEqual(p.timeline_start, i * 5 / 29)
            self.assertEqual(p.timeline_end, (i + 1) * 5 / 29)


class EncodedTimingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ffmpeg, cls.ffprobe = _ffmpeg_binary(), _ffprobe_binary()
        if not shutil.which(cls.ffmpeg) or not shutil.which(cls.ffprobe):
            raise unittest.SkipTest("FFmpeg/ffprobe not installed")

    def test_180_passes_preserve_audio_onsets_and_video_frame_count(self):
        # 12 fps mirrors the actual courses. 25 fps and audio/video-only paths
        # protect against a fix that only happens to work for one source type.
        for source_fps, media in ((12, ProbedMedia(True, True)),
                                  (25, ProbedMedia(True, True)),
                                  (12, ProbedMedia(False, True)),
                                  (12, ProbedMedia(True, False))):
            with self.subTest(source_fps=source_fps, media=media), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                source, output = root / "source.mkv", root / "output.mkv"
                subprocess.run([self.ffmpeg, "-v", "error", "-y", "-f", "lavfi", "-i",
                                f"color=blue:s=160x120:r={source_fps}:d=3", "-f", "lavfi", "-i",
                                "sine=frequency=1000:sample_rate=44100:duration=3",
                                "-c:v", "ffv1", "-c:a", "pcm_s16le", str(source)], check=True)
                lines = [TranscriptLine(.04 + (i % 7) * .031,
                                        .04 + (i % 7) * .031 + .137 + (i % 5) * .019,
                                        "Test") for i in range(60)]
                options = RenderOptions(theme=replace(VideoTheme(), width=720, height=1280,
                                                       media_height=406, watermark_opacity=0))
                graph, passes = _build_filter_graph(media=media, lines=lines, options=options,
                                                    ass_path=root / "unused.ass", has_logo=False)
                # Test real production cutting/padding/concat without spending
                # time on text layout. Downscale only after the actual concat.
                graph = graph.split(";[concatv]drawbox")[0] + ";[concatv]scale=160:120[out]"
                subprocess.run([self.ffmpeg, "-v", "error", "-y", "-i", str(source),
                                "-filter_complex", graph, "-map", "[out]", "-map", "[concata]",
                                "-c:v", "libx264", "-preset", "ultrafast", "-r", "30",
                                "-c:a", "pcm_s16le", str(output)], check=True)
                probe = json.loads(subprocess.check_output([
                    self.ffprobe, "-v", "error", "-count_frames", "-show_entries",
                    "stream=codec_type,nb_read_frames:format=duration", "-of", "json", str(output)]))
                expected = passes[-1].timeline_end
                self.assertAlmostEqual(float(probe["format"]["duration"]), expected, delta=.002)
                video = next(s for s in probe["streams"] if s["codec_type"] == "video")
                self.assertEqual(int(video["nb_read_frames"]), round(expected * 30))
                pcm = subprocess.check_output([self.ffmpeg, "-v", "error", "-i", str(output),
                                               "-map", "0:a", "-ar", "48000", "-ac", "1",
                                               "-f", "s16le", "-"])
                samples = array.array("h", pcm)
                self.assertEqual(len(samples), round(expected * 48000))
                if media.has_audio:
                    # Find the tone after each padded silence, including the
                    # LAST pass. This catches growing drift even when both
                    # encoded streams agree with each other in total duration.
                    window = 48  # one millisecond at 48 kHz
                    onsets, active = [], False
                    for pos in range(0, len(samples), window):
                        loud = max(map(abs, samples[pos:pos + window]), default=0) > 1000
                        if loud and not active:
                            onsets.append(pos / 48000)
                        active = loud
                    self.assertEqual(len(onsets), len(passes))
                    self.assertLess(max(abs(t - p.timeline_start)
                                        for t, p in zip(onsets, passes)), .002)


if __name__ == "__main__":
    unittest.main()
