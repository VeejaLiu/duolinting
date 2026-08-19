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
 * 开源目录只输出整理文件所需的元数据。封面、音频、视频与媒体类型均不出现在该响应中，
 * 即使外部 API Key 泄露也不能借此枚举或下载私有媒体对象。
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
