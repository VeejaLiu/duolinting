import { accessSync, constants, existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const inputArguments = process.argv.slice(2)

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

if (inputArguments.length === 0) {
  fail('用法：npm run media:normalize -- "/完整路径/课程视频.mp4"')
}

for (const command of ['ffprobe', 'ffmpeg']) {
  const check = spawnSync(command, ['-version'], { stdio: 'ignore' })
  if (check.error?.code === 'ENOENT') {
    fail(`未找到 ${command}。请先安装 FFmpeg（macOS 可运行：brew install ffmpeg）。`)
  }
}

for (const inputArgument of inputArguments) {
  const inputPath = resolve(inputArgument)
  try {
    accessSync(inputPath, constants.R_OK)
  } catch {
    fail(`无法读取视频：${inputPath}`)
  }

  const probe = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ],
    { encoding: 'utf8' },
  )
  if (probe.status !== 0) fail(`无法识别视频编码：${inputPath}`)

  const extension = extname(inputPath)
  const stem = basename(inputPath, extension)
  const outputPath = join(dirname(inputPath), `${stem}.h264.mp4`)
  if (existsSync(outputPath)) {
    fail(`为避免覆盖已有文件，已停止：${outputPath}`)
  }

  const sourceCodec = probe.stdout.trim() || 'unknown'
  console.log(`开始转换：${basename(inputPath)}（${sourceCodec} → H.264）`)
  // 视频统一为 H.264/yuv420p，并把 MP4 索引移到文件头以便网页快速起播。
  // fps_mode passthrough 保留原文件的可变帧率时间戳，避免字幕时间轴发生漂移；
  // 音频统一为浏览器普遍支持的 AAC，160 kbps 足以覆盖课程对白与背景声。
  const conversion = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-tag:v', 'avc1',
      '-fps_mode', 'passthrough',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      outputPath,
    ],
    { stdio: 'inherit' },
  )
  if (conversion.status !== 0) fail(`转换失败：${inputPath}`)

  const verification = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,pix_fmt',
      '-of', 'csv=p=0',
      outputPath,
    ],
    { encoding: 'utf8' },
  )
  if (verification.status !== 0 || !verification.stdout.trim().startsWith('h264,yuv420p')) {
    fail(`转换完成但格式验证未通过，请勿上传：${outputPath}`)
  }
  console.log(`转换完成，可上传：${outputPath}`)
}

