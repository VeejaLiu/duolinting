/** 列表只统计时间字段有效的行，沿用详情的 Number(start/end) 有限性规则。
 * 不构造字幕对象，也不清理文本、翻译、答案和关键词，兼容旧字符串时间及空值。
 */
export function countTranscriptLines(value: unknown): number {
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return 0; }
    }
    if (!Array.isArray(value)) return 0;
    let count = 0;
    for (const line of value) {
        if (!line || typeof line !== 'object') continue;
        if (Number.isFinite(Number(line.start)) && Number.isFinite(Number(line.end))) count++;
    }
    return count;
}
