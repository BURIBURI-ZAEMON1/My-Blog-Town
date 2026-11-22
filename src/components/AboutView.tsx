import type { TownPostSummary } from '../scene/brick-town/types';
import { siteConfig } from '../config/site';
import { createSiteStats, formatWords } from '../lib/site-stats';
import '../styles/about.css';

type Props = { posts: TownPostSummary[]; totals?: { pageviews: number; visitors: number }; onOpen: (id: string) => void };
const externalIcon = <svg aria-hidden="true" viewBox="0 0 24 24" className="icon"><path d="M14 5h5v5M19 5l-8 8M17 13v5H5V6h5" /></svg>;
const profileLinks = siteConfig.profile.links;

function AboutLinks() {
  return <div className="about-links">{profileLinks.map(link => <a key={link.id} href={link.url} target={link.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener">{link.label}{externalIcon}</a>)}<a href="/rss.xml">RSS{externalIcon}</a></div>;
}

export default function AboutView({ posts, totals, onOpen }: Props) {
  const stats = createSiteStats(posts);
  const recent = [...posts].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 3);
  return <article className="about-page">
    <header className="about-heading">
      <span className="about-eyebrow">TOWN RESIDENT · ABOUT</span>
      <h1>{siteConfig.profile.name}</h1>
      <p>{siteConfig.profile.headline}</p>
    </header>
    <section className="about-hero" aria-label="作者与站点概况">
      <div className="about-portrait"><img src={siteConfig.profile.avatar} alt={siteConfig.profile.name} width="164" height="164" /><span>{siteConfig.shortTitle}</span></div>
      <div className="about-intro">
        <p>{siteConfig.profile.bio || siteConfig.description}</p>
        <dl className="about-stats">
          <div><dt>文章</dt><dd>{stats.posts}</dd></div>
          <div><dt>累计字数</dt><dd>{formatWords(stats.words)}</dd></div>
          {stats.days !== undefined && <div><dt>{siteConfig.launchDate ? '运行天数' : '记录天数'}</dt><dd>{stats.days}</dd></div>}
          <div><dt>访问量</dt><dd>{totals ? totals.pageviews.toLocaleString() : '—'}</dd></div>
          <div><dt>访问人数</dt><dd>{totals ? totals.visitors.toLocaleString() : '—'}</dd></div>
        </dl>
        <AboutLinks />
      </div>
    </section>
    <div className="about-grid">
      <section className="about-card"><span className="about-card-index">01</span><h2>关于我</h2>
        <p>我是{siteConfig.profile.name}，欢迎来到{siteConfig.title}。</p>
        <p>{siteConfig.description}</p>
        {siteConfig.profile.bio && <p>{siteConfig.profile.bio}</p>}
      </section>
      <section className="about-card is-accent"><span className="about-card-index">02</span><h2>这座小镇</h2>
        <p>这座小镇就是博客的地图：每篇文章都有自己的建筑，同一系列的文章住在同一栋楼的不同楼层，楼层多少对应篇幅长短。</p>
        <p>可以拖动、缩放地图，沿着路走，看看最近写下的东西；点开一栋楼，镜头会带你靠近，再进入文章。</p>
        <p>中心风车通向这里，环形小镇里住着友邻。悬停建筑或侧边栏列表可以预览，点击友邻小屋后会运镜前往，再访问朋友的网站。</p>
        <span className="about-card-ring" aria-hidden="true" />
      </section>
      <section className="about-card"><span className="about-card-index">03</span><h2>最近在做什么</h2>
        <p>最近写下的几篇记录：</p>
        <ul className="about-recent">{recent.map(post => <li key={post.id}><a href={`/posts/${encodeURIComponent(post.id)}/`} onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onOpen(post.id); }}>{post.title}</a></li>)}</ul>
      </section>
      <section className="about-card"><span className="about-card-index">04</span><h2>找到我</h2>
        <p>有想法、有问题、发现写错了，都可以从这里开始。</p>
        <AboutLinks />
      </section>
    </div>
    <footer className="about-notes">
      {!siteConfig.launchDate && stats.since && <p>记录天数从首篇文章发布日（{stats.since.slice(0, 10)}）起计算。</p>}
      <p>{totals ? '访问人数按匿名访客标识估算。' : '访问统计暂不可用。'}</p>
    </footer>
  </article>;
}
