# DuolinTing 本地视频生成器

这是一个独立运行在个人电脑上的课程成片工具。它不会安装到 DuolinTing 后端，也不会在生产服务器上执行视频编码。

工具只通过开放内容 API 读取：

- 已发布课程目录；
- 课程的 `dltjson` 字幕和时间轴；
- 课程已配置的源媒体地址。

视频会按需下载到本机缓存，随后由本机 FFmpeg 解码和编码。服务器只负责提供原始媒体和字幕，绝不执行视频生成任务。

## 依赖

- Python 3.11 或更高版本；
- FFmpeg 6 或更高版本，并且 `ffmpeg`、`ffprobe` 在 PATH 中。成片需要包含
  `subtitles/libass` 滤镜。

macOS 的安装方式需要按芯片架构选择：

Apple Silicon（`arm64`）可以使用：
```bash
brew install ffmpeg-full
export PATH="$(brew --prefix ffmpeg-full)/bin:$PATH"
```

Intel（`x86_64`）请不要再使用 Homebrew，改用 MacPorts：

1. 从 [MacPorts 官网](https://www.macports.org/install.php) 安装与你的 macOS 版本匹配的安装包；
2. 在新的终端窗口执行：

```bash
sudo port selfupdate
sudo port install ffmpeg
```

MacPorts 的 `ffmpeg` 端口包含 `libass` 字幕依赖。如果终端找不到安装后的命令，执行
`export PATH="/opt/local/bin:$PATH"`，或在 `.env` 中填写
`DUOLINTING_FFMPEG_BIN=/opt/local/bin/ffmpeg` 和
`DUOLINTING_FFPROBE_BIN=/opt/local/bin/ffprobe`。工具会在开始编码前检查
`subtitles/libass` 滤镜并给出对应架构的提示。

如果没有管理员权限，也可以使用项目内的静态 Intel 构建：把 `ffmpeg` 和 `ffprobe`
可执行文件放入 `video-generator/tools/`。生成器会自动优先使用这两个文件，无需修改
系统 PATH 或 `.env`。

## 安装

```bash
cd video-generator
python3 -m venv .venv
source .venv/bin/activate
cp .env.example .env
python run.py --help
```

这个项目没有第三方 Python 运行时依赖，直接运行 `python run.py ...` 即可。
如果希望安装 `dlt-video` 命令行入口，再执行 `python -m pip install -e .`；下面的
`dlt-video` 都可以换成 `python run.py`。

编辑 `.env`，填入 Admin 中创建的开放内容 API Key：

```dotenv
DUOLINTING_API_BASE=http://127.0.0.1:8102
DUOLINTING_OPEN_CONTENT_API_KEY=dltak_replace_with_the_key_shown_once
```

`DUOLINTING_API_BASE` 可以填写 Admin 代理地址或后端地址；如果不设置它，也可以使用
`DUOLINTING_BACKEND_URL`。第一次直接运行 `python run.py` 时程序会询问服务端地址和
API Key，并保存到当前项目的本地 `.env`（文件权限会限制为仅当前用户可读写）；之后
启动会直接使用已保存的配置，不再重复询问。需要更换地址或 API Key 时，手动执行：

```bash
python run.py --reset-config
```

该选项会清除本地保存的地址和 API Key，然后只在这一次重新设置。

默认的 `cache/`、`media/` 和 `output/` 都位于 `video-generator/` 目录中，即使你从仓库
根目录启动 `python video-generator/run.py` 也不会把生成文件散落到仓库根目录。需要
更换位置时，再通过对应的环境变量或命令行参数覆盖默认值。

API Key 只从环境变量或本地 `.env` 读取，不要把它写进脚本、提交记录或开源仓库。

## 最简单的用法

不需要记住任何参数，直接运行：

```bash
python run.py
```

程序会依次完成：输入或读取 API Key → 加载内容分类 → 选择学习系列 → 选择课程 →
选择字幕语言 → 从服务器下载字幕和源媒体 → 在本机生成视频。目录和课程都可以使用
终端的 ↑/↓ 键移动，回车确认。

## 第一步：同步课程字幕

```bash
dlt-video sync
```

同步结果保存在 `cache/`：

- `catalog.json`：目录快照；
- `courses/<course-id>.dltjson`：每门已发布课程的字幕；
- `media-manifest.example.json`：本地媒体映射模板。

同步过程不会下载视频，只缓存目录和字幕。视频会在实际选择课程生成时按需下载，并复用本机缓存。

## 可选：使用本地媒体覆盖服务器文件

如果已经有本机源文件，也可以复制模板并指定路径：

```bash
cp cache/media-manifest.example.json media-manifest.json
```

编辑 `media-manifest.json`，把课程 ID 映射到本地视频或音频文件。路径可以是绝对路径，也可以相对于 `media-manifest.json`：

```json
{
  "123": {
    "title": "Muddy Puddles",
    "path": "Muddy Puddles.mp4"
  },
  "124": {
    "title": "Another lesson",
    "path": "/Users/me/Movies/another-lesson.mp4"
  }
}
```

如果未指定 manifest，程序默认从服务器下载媒体；已有的下载文件会直接复用。

## 命令行模式（可选）

```bash
dlt-video list
dlt-video render \
  --course-id 123 \
  --locale zh-CN \
  --logo ../admin/public/duolinting-logo-ear.png
```

默认输出到 `output/123-Muddy Puddles.mp4`。可用 `--output` 指定完整路径：

```bash
dlt-video render \
  --course-id 123 \
  --output ./output/muddy-puddles.mp4 \
  --locale ja-JP
```

支持的成片语言为 `en-US`、`zh-CN`、`th-TH` 和 `ja-JP`。第三遍会保留英文原句，并在存在对应译文时显示所选语言翻译。

## 批量生成

```bash
dlt-video render-all \
  --locale zh-CN \
  --logo ../admin/public/duolinting-logo-ear.png
```

输出结构为：

```text
output/
  内容分类/
    学习系列/
      0010-课程标题.mp4
```

单门失败不会中断其他课程，命令最后会报告失败数量。

## 成片逻辑

生成器沿用 Admin 录制台的逐句流程：

1. 每句盲听两遍；
2. 间隔约 300ms；
3. 第三遍同时显示英文和选定翻译；
4. 视频课程在媒体区播放原始画面；
5. 竖屏原视频的横向空白使用模糊背景填充；
6. 外层成片画布使用竖屏 3:4（高度:宽度为 4:3）；
7. 顶部品牌栏使用大号圆角正方形 Logo、品牌标语和醒目的 `https://www.duolinting.cn`；
8. 标题、阶段提示和字幕采用淡入、滑入及轻微缩放动效；英文与翻译字幕使用大号粗体、描边和投影，长句会自动下移换行；
9. 输出为 H.264/AAC MP4，适合直接发布或继续剪辑。

视频课程会从每句原始时间范围精确截取三次，音频课程会生成带原音频的深色媒体区。每个片段都会包含 300ms 的短暂呼吸间隔，因此字幕和音频时间轴不会依赖浏览器实时播放速度。

## 常见问题

### 视频会不会在服务器生成？

不会。服务器只提供原始媒体的读取地址，生成器把它下载到本机后，所有解码、字幕合成和编码都在本机完成。

### 为什么不用 MoviePy？

MoviePy 仍然依赖 FFmpeg，而且在长视频、重复片段和多语言字幕场景中更容易产生额外的中间文件和内存开销。本项目直接生成 FFmpeg filter graph，便于精确控制时间轴和失败日志。

### 中文、泰语或日语显示成方框怎么办？

FFmpeg 会使用本机字体。可以传入本机已安装的字体名称：

```bash
dlt-video render --course-id 123 --font-name "PingFang SC"
```

如果是在 Linux 上运行，请安装 Noto CJK 字体并使用 `--font-name "Noto Sans CJK SC"`。

### 可以放到服务器运行吗？

不建议，也不是本项目的目标。这个工具故意设计为本地 CLI，所有 FFmpeg 解码、编码和临时文件都在运行命令的电脑上完成。
