import { siteConfig } from './site';

export type AboutSection = {
  id: string;
  title: string;
  paragraphs: string[];
  link?: { label: string; href: string };
};

// About-only copy lives here; shared name, avatar and links remain in site.ts.
export const aboutContent = {
  introduction: siteConfig.profile.bio || siteConfig.description,
  sections: [
    {
      id: 'me', title: '关于我',
      paragraphs: [
        '我是黑蚊子多，大二萌新一枚',
        '当前在学习 go 后端与 Agent 开发',
        '乐于做一些有意思的东西',
        '偶尔兴起便会做一些记录'
      ],
    },
    {
      id: 'town', title: '这座小镇',
      paragraphs: [
        '这座小镇就是博客的地图：每篇文章都有自己的建筑，同一系列的文章住在同一栋楼的不同楼层',
        '可以探索地图，看看最近写下的东西；点开一栋楼，镜头会带你进入文章',
        '中心风车通向这里，环形小镇里住着友邻。悬停建筑或侧边栏列表可以预览，点击友邻小屋后会前往朋友的网站',
      ],
    },
    {
      id: 'framework', title: '关于框架',
      paragraphs: [
        '这座小镇由 Blog Town 搭建，一个基于 Astro、React 和 Babylon.js 的开源博客框架',
        '文章用 Markdown 维护，建筑随内容自动生成。小镇之外，也保留了档案、搜索、分类、标签和 RSS，方便按熟悉的方式阅读',
        '此框架由我本人长期维护并更新，若发现问题或有想法都欢迎来联系或直接提PR'
      ],
      link: { label: '查看框架源码', href: 'https://github.com/BURIBURI-ZAEMON1/Blog-Town' },
    },
    {
      id: 'writing', title: '写作与记录',
      paragraphs: [
        '这里记录技术学习、工具捣鼓与项目经历。除了结果，也留下遇到的问题、试过的办法，以及当时的想法',
        '可以从档案翻阅旧文，也可以订阅 RSS，等下一篇记录。对文章有疑问或建议，欢迎通过上面的链接找到我',
      ],
    },
  ] satisfies AboutSection[],
};
