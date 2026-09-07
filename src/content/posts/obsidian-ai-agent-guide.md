---
townId: "post-obsidian-ai-agent-guide"
title: "极速上手 Obsidian，配置 AI Agent 搭建笔记流"
description: "从基础安装、插件配置到 AI Agent 工作流，完整介绍一套可快速上手的 Obsidian 笔记方案。"
date: "2026-05-13T13:59:13+08:00"
category: "工具捣鼓"
tags: ["Obsidian", "入门", "Agent", "笔记", "skill"]
series: "Obsidian"
seriesIndex: 0
cover: "/assets/posts/obsidian-ai-agent-guide/cover.png"
coverAlt: "极速上手 Obsidian，配置 AI Agent 搭建笔记流"
draft: false
---

近半年Obsidian在技术圈内热度激增,我也在"跟风"使用它的过程中收获了一些心得,于是写下这篇博客.同时也给一些还没有接触Obsidian的朋友提供一些参考和初步上手Obsidian的保姆级教程.

## 什么是Obsidian

Obsidian是一款基于本地Markdown文件的知识管理软件.它不只是一款笔记软件,而更是一个通过**双向链接**构建的非线性知识网络.对于追求高自动化,高隐私性的 AI 笔记流或个人知识库而言,Obsidian 具有显著的技术适配优势.

简单介绍一下缘由,也就是Obsidian的核心优势:

- 数据所有权与开放生态:所有笔记以纯文本形式存储于本地，开发者可利用文件系统直接对源文件进行批处理，或通过开放的 API 允许 AI Agent 实现底层逻辑的接管.
- 双向链接:通过 `[[`快速建立起笔记之间的双向链接并同步处理关系图谱,是极其高效的知识网络构建方式.这也让Obsidian的最佳实践不同于常规笔记方式.
- 高扩展性:社区插件极其丰富,更有大量专为Obsidian设计的AI skills(本文后面会带来推荐,还包含两个我自己写的还在试验阶段的 skill).
- LLM 友好型格式:Markdown 格式具备天然的结构化特征,对大语言模型 (LLM) 极其友好,可直接作为检索数据源.(Markdown可读性也高,基础语法易上手)
- 元数据驱动:通过  YAML Frontmatter ，AI 可以精准识别笔记的元数据,从而实现自动分类,关联建议或任务调度

虽说Obsidian的入门门槛略高于 Notion 这类开箱即用的工具,但通过合理的配置,其在处理复杂逻辑与构建私有 Agent 方面的上限远超竞品.且无论你是否有技术能力,跟着接下来的教程就能畅通无阻地极速上手,且能马上领会到这套流程的魅力.

## 开始

### 安装

[点此安装Obsidian](https://obsidian.md/)

若要使用AI Agent则需进行下面的安装

[点此安装Node.js](https://nodejs.org/zh-cn/download)(个人使用安装在本地即可)

需要Claude Code,Codex CLI,Gemini CLI其中之一和对应的acp.其他主流智能体工具也支持,但需额外配置.(以下操作都需要科学上网)

Claude Code安装:

```
npm install -g @anthropic-ai/claude-code@lasted
```

```
npm install -g @agentclientprotocol/claude-agent-acp@latest
```

Codex CLI安装:

```
npm install -g @openai/codex@lasted 
```

```
npm install -g @zed-industries/codex-acp@latest
```

Gemini CLI安装(无需acp):

```
npm install -g @google/gemini-cli
```

需要有API key,若为中转站购买的key或其他大模型的key需要[cc-switch(点此安装)](https://github.com/farion1231/cc-switch)或自己修改配置文件.

### 必备插件与基础配置

新建一个文件夹用于作为Obsidian仓库,进入Obsidian选择此文件夹打开

来到左下角设置:

- `关于`中拉到最下,找到 `命令行界面`并开启
- `文件与链接`中最上面,`附件默认存放路径`根据自己需要更改,并选择 `附件文件夹路径`(推荐设置,不必要,便于收纳附件)
- `第三方插件`中关闭安全模式,浏览 `社区插件市场`,搜索安装 `BRAT`,并启用
- 打开 `BRAT`的设置界面,点击 `Add beta plugin`,并将此链接粘贴到第一个框:`https://github.com/RAIT-09/obsidian-agent-client`点击 `Add plugin`
- 上一步执行过后能看到多出来一个"Agent Client"的插件,进入此插件设置.自行选择 `Default agent`.几个Path都不需要点 `Auto-detect`,保持原样即可,不然不便于多设备同步(同步化我会在后面的系列文章中给出完整教程).划到自己要使用的Agent位置(若使用的不是上面提到的三个之一则需要点击 `Add custom agent`自行配置),填入自己的API key,并在 `Environment variables`中填入对应的API BaseURL,如`OPENAI_BASE_URL=https://xxx/v1`

此时Agent的基础配置就完成了,重启Obsidian并在主页面点击左侧的机器人图标即可调出AI对话框.随便发送点什么若它回复及说明配置成功了

### skills 安装

其实在上面的基础配置之后就已经可以上手使用了,但为了帮助 AI 能在 Obsidian 中发挥出更强的能力和更强的适配性,我推荐你安装下面这些 skills,也可择需安装

| skill名称                 | 功能描述                                                                                                                                           | 安装方式                                                                                                                                                                                                                      | 补充说明                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| defuddle                | 网页内容清洗工具,可以把杂乱的网页转换成纯净的 Markdown 格式，通过剔除广告和导航栏来帮你节省 AI 调用时的 Token 消耗.(同时推荐在你使用的浏览器中通过插件市场安装"Obsidian Web Clipper"这个插件,用于直接将网页内容添加到 Obsidian 中) | 在你的 Obsidian仓库文件夹中打开终端,输入:`npx skills add https://github.com/kepano/obsidian-skills`然后在 skills 的可视化界面下完成操作,其中 `Which agents do you want to install to?`是默认配置了 `.agents`的,选择其余还需要的就行.`Installation scope`推荐选 `Project`     |                                                                   |
| obsidian-cli            | 让 AI Agent 能够直接调用 Obsidian 官方的命令行工具,从而实现对笔记,任务,属性的增删改查,以及对插件开发环境的调试与管理.                                                                        |                                                                                                                                                                                                                           |                                                                   |
| obsidian-bases          | 让 AI 能够创建和维护 .base 格式的配置文件,从而在 Obsidian 里生成类似 Notion 数据库的动态视图,实现对笔记的过滤,计算和结构化展示.                                                               |                                                                                                                                                                                                                           |                                                                   |
| obsidian-markdown       | 让 AI 能够编写和编辑符合 Obsidian 官方规范的增强版 Markdown 文档,实现双向链接,内容嵌入,提示框以及结构化属性的深度集成.                                                                      | 这个和上面三个是一同安装的,在 skills 的可视化界面选择这几个 skill 即可                                                                                                                                                                               | 可以根据自身需求自行调整格式规范                                                  |
| obsidian-canvas-creator | 让 AI 能够创建和编辑 Obsidian 的 .canvas 白板文件,通过 JSON 结构实现节点(文本,文件,链接,组)的布局以及它们之间的连线逻辑.                                                                 | 输入 `git clone https://github.com/axtonliu/axton-obsidian-visual-skills.git`将其中这个 skill 和下面两个 skill 的文件夹复制到你Obsidian 仓库下的 `.agents/skills`和其他你所需要的 agents 的 skills 目录下(macOS 用户需要在访达下 `Command+Shift+.`才能可见 `.agents` 等目录) |                                                                   |
| mermaid-visualizer      | 将文本逻辑转化为专业的 Mermaid 架构图或流程图,并内置了针对 Obsidian 渲染引擎的语法纠错机制.                                                                                       | 同上                                                                                                                                                                                                                        |                                                                   |
| excalidraw-diagram      | 将文本逻辑转化为手绘风格的 Excalidraw 图表.(同时推荐在 Obsidian 的社区插件市场中安装Excalidraw 插件,可以自己手绘图表,还有大量素材库可用)                                                        | 同上                                                                                                                                                                                                                        |                                                                   |
| tutor-skills            | 两个 skill (tutor-setup 和 tutor) ,构成了一个“输入-内化-检测”的完整闭环:将文档或代码库一键转化为结构化的 Obsidian 知识库,之后通过无提示的交互式测验不断暴露出你的知识盲区并记录学习轨迹.                            | 在你的 Obsidian仓库文件夹中打开终端,输入:`npx skills add RoundTable02/tutor-skills`,记得其中两个 skill 都要勾选,其余与第一项 skill 一致                                                                                                                    |                                                                   |
| study-direction-init    | 只在 `Study/`目录下工作.让 AI 能自己识别方向路径进行初始化,惰性创建或补全首页链,利于搭建合理清晰地关系图谱.并尽可能合理地为方向绑定轻型笔记模板(便于其他会话复用,遵守轻规则).                                              | 由于目前未完全优化好,所以未在 github 上公开,附件暂缺（旧博客中未找到对应文件）,下载并解压后复制到你Obsidian 仓库下的 `.agents/skills`和其他你所需要的 agents 的 skills 目录下                                                                                  | 这是我自己写的还在试验阶段的 skill.可能还有需要优化的地方,但几乎不存在使用风险.希望你们能安装它并可与我反馈需要优化的点. |
| study-note-refiner      | 只在 `Study/`目录下工作.让 AI 支持按用户指定标题范围,处理当前这次速记,将速记补充并整理成根据关系相互链接的原子笔记,并主动维护相关的笔记与链接,让用户能更快上手 Obsidian 特有的笔记实现模式.                                   | [点击下载附件 ](/assets/posts/obsidian-ai-agent-guide/file/study-note-refiner.zip),同上                                                                                                                                                                                 | 同上.这两个 skill 间有联动逻辑,最好都安装.                                        |

再补充解释一下为什么我写的两个 skill 只在 `/Study`目录下工作:这两个 skill 专注于优化各类学习笔记的搭建(各类课程内容或技术学习),但未针对于wiki知识库搭建优化(这也是 Obsidian 的一个核心优势,以后可能会再单独分享).且因为还在试验阶段,所以为了严格控制作用范围就限制在 `/Study`目录下工作,只要想使用这两个 skill 只需要建一个名为Study的目录并将文件夹或笔记放入此目录下就可以.

## 使用

虽然 Obsidian 更强调知识网络的链接,但我依然还是建议建一些文件夹偏于笔记管理,如:`Study/Math/高数`和 `Study/Programming/Language/Java`.合理的目录同时也能使study-direction-init skill 的发挥更准确(自动初始化目录的功能已被提上 skill 更新的日程,后面可能会更新,但过于自动化可能会导致脱离用户需求,所以方案仍需斟酌,也期待大家的建议❤️)

这里主要介绍的是我平时常用的方法.

在相应的目录下创建 `xx-速记`笔记,确定一个一级标题(一级标题的主要作用为:便于 AI 锁定处理位置,不做多余工作,节省 token.所以我偏爱于每次做笔记都在 `速记`笔记下新创一个一级标题开始记,当然你也可以每次都新建一个 `速记`笔记.

- 如果是听课:Obsidian 核心插件中有一个 `录音机`,开启后可以直接录音放入笔记中,也可以放入整份 PPT 以及屏幕相片等等,也可以简单打字记录重点.甚至仅仅只把每一节的知识点名称简单记录一下都行
- 如果是看直播/视频课,可以在 Obsidian 中创一个新标签页,选择打开网页浏览器(需要在设置中的核心插件里找到 `网页浏览器`并开启),双击上栏的新标签页选择分屏,就可以边看视频边做笔记了,随时把截图贴到笔记中,同时也可以做一下简单标注(就算只有截图都是可以的)
- 如果是正在浏览器浏览到一个值得做笔记的网站/博客文档,甚至是 YouTube 视频,就可以用我们前面提到的Obsidian Web Clipper这个浏览器插件直接将网页内容全部保存到 Obsidian 笔记当中
- 如果是看文档,看论文等等,直接将整份文件拖入 Obsidian 笔记中即可(大部分常用大部分文件格式都支持)

完成好这一次简单的速记后,就可以在 AI 对话框中让 AI 帮自己把这篇速记补充整理成原子笔记(study-note-refiner skill的主要功能之一就是帮用户整理为更碎片化/卡片式的原子笔记,这是 Obsidian 双向链接机制带来的特殊的高效笔记方法,但若你不喜欢这种笔记形式可以将 `/Study` 目录重命名为其他名称以让此 skill 不工作).你也可以提及其他要求让 AI 调用前面安装的其他 skill,如让 AI 创建 canvas,Excalidraw,让 AI 帮助测验一下你自己等等.

这种极速笔记法在期末速通时也极其好用:将往年试卷整个文件或截图部分题目放入速记中,AI就能依据考点题型整理出相关的一系列原子笔记,帮助你快速学习知识点和题型解法等等.再整理完笔记后还能让 AI 检验你的学习成果,这时 AI 就会调用tutor-skills,通过无提示的交互式测验不断暴露出你的知识盲区并记录学习轨迹.

若你需要手搓笔记,除了利用 Obsidian 特有的 `[[`创建双向链接让此篇笔记与其他笔记链接以外(这是建立关系图片的关键),其实只要会基础的 Markdown 语法就能写出格式很规范的笔记了,当然 Obsidian 也提供了可视化操作,能让你更快上手 Markdown 编辑.当然也能通过超丰富的社区插件和社区主题让你能使用得更得心应手,并完成更好的笔记.如前面提到的Excalidraw插件,推荐大家去试试,能通过素材库做出好看的笔记图表还能直接链接或展示到笔记上.

## 结语

希望通过此篇博客能让你产生想试试看使用 Obsidian 的想法,也希望我的教程能成功地帮助你在 Obsidian 里利用 AI 高效地整理笔记.接下来应该还会有几篇关于 Obsidian 的文章更新,我的博客也是堂堂复活了🙈.
