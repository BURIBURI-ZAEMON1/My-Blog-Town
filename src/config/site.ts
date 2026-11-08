export interface ProfileLink {
  id: string;
  label: string;
  url: string;
  logo: string;
}

export interface FriendLink {
  id: string;
  nickname: string;
  avatar: string;
  url: string;
  description?: string;
}

interface SiteConfig {
  title: string;
  shortTitle: string;
  tagline: string;
  description: string;
  siteUrl: string;
  logo: string;
  language: string;
  townSeed: string;
  profile: {
    name: string;
    avatar: string;
    headline: string;
    bio: string;
    links: ProfileLink[];
  };
  copyright: string;
}

export const siteConfig: SiteConfig = {
  title: '黑蚊子的门',
  shortTitle: '黑蚊子的门',
  tagline: 'Heaven’s Door',
  description: '黑蚊子多的个人博客，记录技术学习、工具捣鼓与项目经历。',
  siteUrl: 'https://www.heavensdoor1.top/',
  logo: '/assets/profile/logo.webp',
  language: 'zh-CN',
  townSeed: 'heavens-door-town-v1',
  profile: {
    name: '黑蚊子多',
    avatar: '/assets/profile/avatar.jpg',
    headline: '真不是蚊子 QAQ',
    bio: '',
    links: [
      { id: 'email', label: 'Email', url: 'mailto:3511457481@qq.com', logo: '/assets/links/email.svg' },
      { id: 'github', label: 'GitHub', url: 'https://github.com/BURIBURI-ZAEMON1', logo: '/assets/links/github.svg' },
      { id: 'steam', label: 'Steam', url: 'https://steamcommunity.com/profiles/76561199347692185/', logo: '/assets/links/steam.svg' },
      { id: 'bilibili', label: 'Bilibili', url: 'https://space.bilibili.com/326297088', logo: '/assets/links/bilibili.svg' },
    ],
  },
  copyright: '2026 © 黑蚊子的门',
};

export const friendLinks: FriendLink[] = [
  { id: 'wjs', nickname: '马克朱佩奇', avatar: '/assets/friends/wjs.jpeg', url: 'https://wjsblog.xyz' },
  { id: 'Zayee', nickname: '折乙', avatar: '/assets/friends/Zayee.jpeg', url: 'https://zheyi.in' },
  { id: 'sugerMGP', nickname: '白糖洒一地', avatar: '/assets/friends/sugerMGP.jpeg', url: 'https://blog.sugarmgp.cn' },
  { id: 'Claran', nickname: 'Claran', avatar: '/assets/friends/Claran.jpeg', url: 'https://www.claran-blog.work' },
  { id: 'bird', nickname: '青鸟', avatar: '/assets/friends/bird.jpeg', url: 'https://blog.bluebird.icu' },
  { id: 'ximo', nickname: '惜寞', avatar: '/assets/friends/ximo.jpeg', url: 'https://lonesome.cn' },
  { id: 'diamond-boy', nickname: 'Diamond boy', avatar: '/assets/friends/Diamond_boy.jpeg', url: 'https://blog.stargazer-luciddream.top' },
  { id: 'true', nickname: '十且八', avatar: '/assets/friends/true.jpeg', url: 'https://sqbtt.cn' },
  { id: 'H2SO4', nickname: 'H2SO4', avatar: '/assets/friends/H2SO4.jpeg', url: 'https://h2so4.site' },
];
