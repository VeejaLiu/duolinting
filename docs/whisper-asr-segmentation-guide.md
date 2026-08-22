# 字幕转写与语义分段指南

本文面向字幕/课程内容生产，说明为什么本地 Whisper 转写会「切得太碎」，以及
推荐的替代方案与操作流程。配套工作台功能见文末。

## 1. 为什么 Whisper 切得很碎

Whisper 是「语音转文字」模型，它的分段由声学信号 + 固定时间窗（约 30 秒滑窗）
驱动，而不是语义驱动。它内部用交叉注意力解码出时间戳，遇到犹豫、连读、语气词、
标点缺失时就会按停顿乱切。

关键结论：

- **换 `large` 模型只提升识别正确率，不改变分段粒度。** 十几分钟视频切成 200–300
  句是这种解码方式的固有产物。
- **Whisper 不是多模态模型，无法用提示词控制切分粒度。** 在这一层努力没有意义，
  应把精力放在「拿到转录之后」的重新分段上。

## 2. 方案一（推荐）：换用带词级时间戳的转写工具

碎片化的根源是「分段粒度太粗、且边界不落在语义边界」。正确的解法是拿到
**词级时间戳（word-level timestamps）**，再在词级真值之上重新分段。

两个成熟工具（都比 stock Whisper 快、且支持词级时间戳）：

| 工具 | 特点 | 适用场景 |
| --- | --- | --- |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | CTranslate2 后端，CPU/GPU 上通常比 stock Whisper 快数倍，支持 `word_timestamps` | 首选，替代本地 stock Whisper |
| [WhisperX](https://github.com/m-bain/whisperX) | 在 faster-whisper 基础上加 VAD（去静音）+ wav2vec2 词级强制对齐，分段更贴近真实发音边界 | 需要更精确词边界时 |

安装与转写示例（命令参数以各项目官方文档为准）：

```bash
# faster-whisper
pip install faster-whisper
faster-whisper input.mp4 --model large-v3 --word_timestamps True \
  --output_format srt --output_dir out/

# WhisperX（需额外安装对齐模型依赖）
pip install whisperx
whisperx input.mp4 --model large-v3 --align_model WAV2VEC2_ASR_BASE_960H \
  --output_format srt --output_dir out/
```

说明：

- Apple Silicon 上 faster-whisper 走 CTranslate2，通常比跑 stock Whisper 明显更快，
  可先试 `int8` 量化进一步提速。
- 转出的 SRT 用工作台的「字幕导入」直接导入（已支持 SRT/VTT/ASS/LRC/TXT）。

## 3. 方案二：LLM 语义重分段（工作台已内置）

即使有了词级时间戳，仍需要按「语义」把短句合并成适合阅读的文本块。这一步交给
LLM 最合适（不是 ASR 能做的）。

工作台波形区已提供 **「复制分段提示词」** 按钮：

1. 打开课程编辑工作台，进入「音轨波形」工具栏；
2. 点击 **复制分段提示词** —— 一键复制「专家分段提示词 + 当前英文字幕（SRT 格式）」；
3. 粘贴到 ChatGPT 等支持长文本的模型，让它返回优化分段后的 **SRT**；
4. 用「字幕导入」把返回的 SRT 导回系统；
5. 人工复核时间轴与文本后，走翻译 / 提交审核流程。

要点：

- **时间戳真值永远来自 ASR**，LLM 只负责「决定哪些句子合并 / 拆分」，不负责重写时间。
  返回的 SRT 中每块 start/end 应取原句的首/尾，边界落在单词边界、不重叠。
- 提示词要求模型 **不改动英文原文**（仅合并时用空格连接），因为原文用于听写判分。
- 重复朗读 / 跟读是教学动作，不是错误，模型不应去重。

## 4. 推荐端到端流程

```
媒体上传
  → faster-whisper / WhisperX 转写（词级时间戳，快）
  → 字幕导入工作台
  → 「复制分段提示词」给 LLM 语义重分段
  → 导回 SRT，人工复核
  → AI 翻译（中文 / ไทย / 日本語）
  → 提交审核 → 发布
```

核心原则：**把更细粒度的时间戳当源头真值，把「分段」做成可逆、可重跑的操作**，
这样永远不必为了换一种切法重新跑一遍转写。
