export type ProfileLinkIcon = 'email' | 'github' | 'steam' | 'bilibili';

export interface ProfileLink {
  id: string;
  label: string;
  url: string;
  icon: ProfileLinkIcon;
}

export interface FriendLink {
  id: string;
  nickname: string;
  avatar: string;
  url: string;
  description?: string;
}

export const siteConfig = {
  title: '黑蚊子的门',
  shortTitle: '黑蚊子的门',
  tagline: 'Heaven’s Door',
  description: '黑蚊子多的个人博客，记录技术学习、工具捣鼓与项目经历。',
  siteUrl: 'https://www.heavensdoor1.top/',
  logo: '/assets/profile/logo.png',
  language: 'zh-CN',
  profile: {
    name: '黑蚊子多',
    avatar: '/assets/profile/avatar.jpg',
    headline: '真不是蚊子 QAQ',
    bio: '什么都不会的后端萌新 QAQ',
    links: [
      { id: 'email', label: 'Email', url: 'mailto:3511457481@qq.com', icon: 'email' },
      { id: 'github', label: 'GitHub', url: 'https://github.com/BURIBURI-ZAEMON1', icon: 'github' },
      { id: 'steam', label: 'Steam', url: 'https://steamcommunity.com/profiles/76561199347692185/', icon: 'steam' },
      { id: 'bilibili', label: 'Bilibili', url: 'https://space.bilibili.com/326297088', icon: 'bilibili' },
    ] satisfies ProfileLink[],
  },
  copyright: '2026 © 黑蚊子的门',
};

export const friendLinks: FriendLink[] = [
  { id: 'wjs', nickname: '马克朱佩奇', avatar: '/assets/friends/wjs.png', url: 'https://wjsblog.xyz' },
  { id: 'zheyi', nickname: '折乙', avatar: '/assets/friends/zheyi.jpg', url: 'https://zheyi.in' },
  { id: 'baitang', nickname: '白糖洒一地', avatar: '/assets/friends/baitang.jpg', url: 'https://blog.sugarmgp.cn' },
  { id: 'claran', nickname: 'Claran', avatar: '/assets/friends/Claran.png', url: 'https://www.claran-blog.work' },
  { id: 'qingniao', nickname: '青鸟', avatar: '/assets/friends/qingniao.jpg', url: 'https://blog.bluebird.icu' },
  { id: 'ximo', nickname: '惜寞', avatar: '/assets/friends/ximo.jpg', url: 'https://lonesome.cn' },
  { id: 'diamond-boy', nickname: 'Diamond boy', avatar: '/assets/friends/Diamond_boy.png', url: 'https://blog.stargazer-luciddream.top' },
];
