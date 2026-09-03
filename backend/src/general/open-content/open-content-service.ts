import type {
    DltjsonFile,
    OpenContentCatalogResponse,
} from '../../domain';
import {
    getPublishedExerciseForOpenContent,
    listCatalog,
    listCategoryExercises,
} from '../catalog/catalog-service';

const dltjsonPath = (courseId: number) =>
    `/api/v1/open-content/courses/${courseId}/dltjson`;

/**
 * 开放目录输出字幕同步和本地视频生成所需的元数据。媒体地址只指向已经公开的课程素材；
 * 编码工作始终发生在调用方电脑，不会让后端承担视频处理负载。
 */
export async function getOpenContentCatalog(): Promise<OpenContentCatalogResponse> {
    const catalog = await listCatalog(false, false);
    const courseLists = await Promise.all(
        catalog.categories.map((category) =>
            listCategoryExercises(category.id, false),
        ),
    );

    return {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        categoryGroups: catalog.categoryGroups.map((group) => ({
            id: group.id,
            name: group.name,
            description: group.description,
            accent: group.accent,
            sortOrder: group.sortOrder,
            localizations: group.localizations,
        })),
        categories: catalog.categories.map((category) => ({
            id: category.id,
            groupId: category.groupId,
            name: category.name,
            description: category.description,
            accent: category.accent,
            sourceUrl: category.sourceUrl,
            sortOrder: category.sortOrder,
            localizations: category.localizations,
        })),
        courses: courseLists.flatMap((courses) =>
            courses.map((course) => ({
                id: course.id,
                categoryId: course.categoryId,
                title: course.title,
                source: course.source,
                sourceUrl: course.sourceUrl,
                difficulty: course.difficulty,
                durationLabel: course.durationLabel,
                mediaType: course.mediaType,
                mediaUrl: course.audioUrl,
                summary: course.summary,
                sortOrder: course.sortOrder,
                lineCount: course.lineCount,
                localizations: course.localizations,
                dltjsonUrl: dltjsonPath(course.id),
            })),
        ),
    };
}

/** 已发布课程才可导出；getExercise 的公开状态过滤也让草稿课程表现为不存在。 */
export async function getOpenContentDltjson(courseId: number): Promise<DltjsonFile | null> {
    const course = await getPublishedExerciseForOpenContent(courseId);
    if (!course) {
        return null;
    }

    return {
        version: '2.0',
        type: 'dltjson',
        course: {
            id: course.id,
            categoryId: course.categoryId,
            title: course.title,
            source: course.source,
            sourceUrl: course.sourceUrl,
            difficulty: course.difficulty,
            durationLabel: course.durationLabel,
            summary: course.summary,
            sortOrder: course.sortOrder,
            localizations: course.localizations,
        },
        lines: course.lines,
    };
}
