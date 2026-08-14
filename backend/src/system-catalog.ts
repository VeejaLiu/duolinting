import type { MaterialCategory } from './domain';

export const materialCategories: MaterialCategory[] = [
    {
        id: 1,
        name: '新闻资讯',
        description: '新闻简报、专题报道、公共事件解读',
        accent: '#1cb0f6',
        sortOrder: 10,
    },
    {
        id: 2,
        name: '演讲访谈',
        description: '演讲、访谈、圆桌讨论、人物对话',
        accent: '#ce82ff',
        sortOrder: 20,
    },
    {
        id: 3,
        name: '故事文化',
        description: '故事、纪录片、文化节目、影视片段',
        accent: '#ff9600',
        sortOrder: 30,
    },
    {
        id: 4,
        name: '校园考试',
        description: '校园广播、考试题型、学术讲座',
        accent: '#2f6fed',
        sortOrder: 40,
    },
    {
        id: 5,
        name: '职场商务',
        description: '会议、汇报、面试、商业播客',
        accent: '#0d8f74',
        sortOrder: 50,
    },
    {
        id: 6,
        name: '科技产品',
        description: '技术分享、产品发布、开发者内容',
        accent: '#845ec2',
        sortOrder: 60,
    },
    {
        id: 7,
        name: '生活服务',
        description: '旅行、医疗、购物、客服与公共服务',
        accent: '#ff4b4b',
        sortOrder: 70,
    },
];
