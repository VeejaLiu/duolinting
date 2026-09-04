import { getOsEnvOptional } from '../../lib/env/utils';
import { Logger } from '../../lib/logger';
import { randomUUID } from 'node:crypto';

const logger = new Logger(__filename);

const DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
// 网关会在长连接上超时，因此单个 HTTP 翻译请求只处理一小批字幕。
// 前端负责把整部课程拆成多个顺序请求，避免一个慢批次阻塞整次翻译。
// 批次保持较小（6 行）：批越大模型越容易合并/漏行导致整批解析失败，小批重试成本也更低。
const TRANSLATE_BATCH_SIZE = 6;
const REQUEST_TIMEOUT_MS = 25_000;

// 批量翻译用的 system prompt:要求模型严格按输入顺序返回 JSON 字符串数组,
// 数量与输入一致,不输出任何额外内容,便于后端直接解析并对齐行号。
const localeNames: Record<string, string> = {
    'zh-CN': '简体中文',
    'en-US': '英语',
    'th-TH': '泰语',
    'ja-JP': '日语',
};

const buildBatchSystemPrompt = (sourceLocale: string, targetLocale: string) =>
    `你是听力课程字幕翻译器，把每行${localeNames[sourceLocale] ?? sourceLocale}` +
    `翻译成自然、简洁的${localeNames[targetLocale] ?? targetLocale}，供学习者对照学习。` +
    '严格按输入顺序返回 JSON 字符串数组，数量必须与输入一致，不要输出任何额外内容。' +
    // 模型常把语义连贯的相邻行合并翻译，导致输出行数少于输入、行号错位，
    // 因此显式禁止合并/拆分/省略，要求逐行一一对应。
    '注意：输入的每一行都必须恰好对应一个输出行；即使某行只是短语、不完整句子或语气词，' +
    '也必须单独翻译，不得与相邻行合并，不得拆分，不得跳过。';

// 重试时使用的加强版 prompt：首试输出与输入对不齐时，用更强硬的措辞再试一次。
const buildRetrySystemPrompt = (sourceLocale: string, targetLocale: string, lineCount: number) =>
    `${buildBatchSystemPrompt(sourceLocale, targetLocale)}` +
    `你上一次的回答行数与输入不一致，这是严重错误。请重新翻译，输出数组必须恰好包含 ${lineCount} 个字符串。`;

export class TranslateNotConfiguredError extends Error {}

type ChatCompletionMessage = {
    role: 'system' | 'user';
    content: string;
};

type ChatCompletionResponse = {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
};

export type TranslateLinesResult = {
    // 与入参 lines 等长、按序对应;翻译失败的行是空字符串。
    translations: string[];
    // 翻译失败的行在入参 lines 中的下标,供调用方提示哪些行需要人工处理。
    failedIndexes: number[];
};

type TranslationJob = {
    status: 'processing' | 'completed' | 'failed';
    result?: TranslateLinesResult;
    message?: string;
};

const translationJobs = new Map<string, TranslationJob>();
const TRANSLATION_JOB_TTL_MS = 15 * 60 * 1000;

// 调用 DeepSeek OpenAI 兼容的 chat completions 接口,返回 message.content 文本。
// 日志中不输出完整 prompt 内容,只记录消息条数和总字符数,避免泄露字幕文本。
const requestDeepSeekChatCompletion = async (
    messages: ChatCompletionMessage[],
    apiKey: string,
    model: string,
): Promise<string> => {
    const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
    logger.info(`DeepSeek 请求开始: model=${model}, messages=${messages.length}, totalChars=${totalChars}`);

    const startedAt = Date.now();
    try {
        const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                // 翻译是确定性的格式化任务，关闭思考模式可显著降低首字延迟和总耗时。
                thinking: { type: 'disabled' },
                temperature: 0.3,
                messages,
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            // 记录响应体前 500 字符，便于定位鉴权失败/限流/参数错误等具体原因。
            const errorBody = await response.text().catch(() => '');
            throw new Error(`DeepSeek 翻译接口请求失败: HTTP ${response.status}, body=${errorBody.slice(0, 500)}`);
        }

        const payload = (await response.json()) as ChatCompletionResponse;
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            // 记录整个响应结构（截断），帮助判断是模型空返回还是接口字段变更。
            logger.warn(`DeepSeek 响应缺少有效 content: ${JSON.stringify(payload).slice(0, 1000)}`);
            throw new Error('DeepSeek 翻译接口没有返回有效内容');
        }

        logger.info(`DeepSeek 请求成功: model=${model}, 耗时=${Date.now() - startedAt}ms, 返回字符数=${content.length}`);
        return content;
    } catch (error) {
        logger.error(`DeepSeek 请求失败: model=${model}, 耗时=${Date.now() - startedAt}ms`, error);
        throw error;
    }
};

// 从模型输出中提取 JSON 字符串数组。模型有时会包一层 ```json 代码块,
// 需要先剥掉代码块再 JSON.parse;解析失败或元素不是字符串都返回 null。
// 失败日志只记录结构和数量，不记录字幕或模型正文。课程内容可能尚未发布或受版权保护，
// 不应被复制到访问范围和保留周期都不同的运行日志中。

const parseTranslationArray = (content: string, expectedLength: number): string[] | null => {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const jsonText = fenced ? fenced[1] : trimmed;

    try {
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) {
            logger.warn(`模型输出不是 JSON 数组: chars=${content.length}`);
            return null;
        }
        const invalidIndexes = parsed
            .map((item, index) => (typeof item === 'string' ? -1 : index))
            .filter((index) => index >= 0);
        if (invalidIndexes.length > 0) {
            // 打出每个非字符串元素的下标、类型和值预览，方便判断模型把哪行翻成了对象/数字。
            const types = invalidIndexes.map((index) => Array.isArray(parsed[index]) ? 'array' : typeof parsed[index]);
            logger.warn(`模型输出数组中包含非字符串元素: indexes=[${invalidIndexes.join(',')}], types=[${types.join(',')}]`);
            return null;
        }
        if (parsed.length !== expectedLength) {
            logger.warn(`模型输出数组长度不匹配: expected=${expectedLength}, actual=${parsed.length}`);
            return null;
        }

        return parsed;
    } catch (error) {
        logger.warn(`模型输出 JSON 解析失败: chars=${content.length}, error=${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
};

// 整批翻译:把这批行包成 JSON 数组字符串发给模型,要求等长 JSON 数组返回。
// 解析失败时重试一次（job 是后台异步执行 + 前端轮询，重试不会触碰网关超时）。
const translateBatch = async (
    lines: string[],
    apiKey: string,
    model: string,
    sourceLocale: string,
    targetLocale: string,
): Promise<string[] | null> => {
    const startedAt = Date.now();
    try {
        const attempts: Array<{ label: string; systemPrompt: string }> = [
            { label: '首试', systemPrompt: buildBatchSystemPrompt(sourceLocale, targetLocale) },
            { label: '重试', systemPrompt: buildRetrySystemPrompt(sourceLocale, targetLocale, lines.length) },
        ];

        for (const attempt of attempts) {
            const content = await requestDeepSeekChatCompletion(
                [
                    { role: 'system', content: attempt.systemPrompt },
                    { role: 'user', content: JSON.stringify(lines) },
                ],
                apiKey,
                model,
            );
            const translations = parseTranslationArray(content, lines.length);
            if (translations) {
                logger.info(`批量翻译成功(${attempt.label}): ${lines.length} 行, 耗时=${Date.now() - startedAt}ms`);
                return translations.map((translation) => translation.trim());
            }
            logger.warn(`批量翻译解析失败(${attempt.label}): ${sourceLocale}→${targetLocale}, lines=${lines.length}`);
        }

        return null;
    } catch (error) {
        logger.warn(`批量翻译失败: ${lines.length} 行, 耗时=${Date.now() - startedAt}ms`, error);
        return null;
    }
};

// 字幕批量翻译入口。
// 单个请求最多处理 12 行；失败批次直接返回失败下标，由前端继续下一批。
// 不能在本请求内逐句重试，否则多句字幕会超过反向代理的网关超时。
export const translateLines = async (
    lines: string[],
    sourceLocale = 'en-US',
    targetLocale = 'zh-CN',
): Promise<TranslateLinesResult> => {
    const apiKey = getOsEnvOptional('DEEPSEEK_API_KEY');
    if (!apiKey) {
        throw new TranslateNotConfiguredError('未配置 DEEPSEEK_API_KEY,AI 翻译服务不可用');
    }
    const model = getOsEnvOptional('DEEPSEEK_MODEL') || DEFAULT_DEEPSEEK_MODEL;

    const startedAt = Date.now();
    const totalBatches = Math.ceil(lines.length / TRANSLATE_BATCH_SIZE);
    logger.info(`开始 AI 翻译: totalLines=${lines.length}, ${sourceLocale}→${targetLocale}, model=${model}, batchSize=${TRANSLATE_BATCH_SIZE}, totalBatches=${totalBatches}`);

    const translations = new Array<string>(lines.length).fill('');
    const failedIndexes: number[] = [];

    for (let batchStart = 0; batchStart < lines.length; batchStart += TRANSLATE_BATCH_SIZE) {
        const batchIndex = Math.floor(batchStart / TRANSLATE_BATCH_SIZE) + 1;
        const batch = lines.slice(batchStart, batchStart + TRANSLATE_BATCH_SIZE);
        logger.info(`批量翻译批次开始: batch=${batchIndex}/${totalBatches}, lines=${batch.length}`);

        const batchStartedAt = Date.now();
        const batchTranslations = await translateBatch(batch, apiKey, model, sourceLocale, targetLocale);

        if (batchTranslations) {
            batchTranslations.forEach((translation, index) => {
                translations[batchStart + index] = translation;
            });
            logger.info(`批量翻译批次完成: batch=${batchIndex}/${totalBatches}, 耗时=${Date.now() - batchStartedAt}ms`);
            continue;
        }

        batch.forEach((_, index) => failedIndexes.push(batchStart + index));
        logger.info(`批量翻译批次失败: batch=${batchIndex}/${totalBatches}, lines=${batch.length}`);
    }

    logger.info(
        `AI 翻译结束: totalLines=${lines.length}, success=${lines.length - failedIndexes.length}, failed=${failedIndexes.length}, failedIndexes=[${failedIndexes.join(',')}], totalTime=${Date.now() - startedAt}ms`,
    );
    return { translations, failedIndexes };
};

// LLM 调用可能慢于反向代理超时。任务在后端继续执行，浏览器通过 jobId 轮询，
// 使创建任务的 HTTP 请求立即返回，避免把模型耗时暴露为前端 504。
export const createTranslationJob = (lines: string[], sourceLocale = 'en-US', targetLocale = 'zh-CN') => {
    const jobId = randomUUID();
    translationJobs.set(jobId, { status: 'processing' });

    void translateLines(lines, sourceLocale, targetLocale)
        .then((result) => translationJobs.set(jobId, { status: 'completed', result }))
        .catch((error) => translationJobs.set(jobId, {
            status: 'failed',
            message: error instanceof Error ? error.message : 'AI 翻译失败',
        }));

    setTimeout(() => translationJobs.delete(jobId), TRANSLATION_JOB_TTL_MS);
    return jobId;
};

export const getTranslationJob = (jobId: string) => translationJobs.get(jobId);
