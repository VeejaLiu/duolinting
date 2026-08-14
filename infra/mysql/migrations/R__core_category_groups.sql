insert into category_groups (id, name, description, accent, sort_order) values
  (1, '新闻资讯', '新闻简报、专题报道、公共事件解读', '#1cb0f6', 10),
  (2, '演讲访谈', '演讲、访谈、圆桌讨论、人物对话', '#ce82ff', 20),
  (3, '故事文化', '故事、纪录片、文化节目、影视片段', '#ff9600', 30),
  (4, '校园考试', '校园广播、考试题型、学术讲座', '#2f6fed', 40),
  (5, '职场商务', '会议、汇报、面试、商业播客', '#0d8f74', 50),
  (6, '科技产品', '技术分享、产品发布、开发者内容', '#845ec2', 60),
  (7, '生活服务', '旅行、医疗、购物、客服与公共服务', '#ff4b4b', 70)
as incoming
on duplicate key update
  name = incoming.name,
  description = incoming.description,
  accent = incoming.accent,
  sort_order = incoming.sort_order;
