---
townId: post-hugo-blog-guide
title: Hello, Blog！用 Hugo 快速搭建你的博客
description: 记录使用 Hugo、Blowfish、GitHub 与 Vercel 搭建个人博客的完整过程。
date: 2025-10-19T13:59:13+08:00
category: 捣鼓记录
tags:
  - 博客
  - 入门教程
series: Hello, Blog!
seriesIndex: 0
draft: false
---

此篇用于记录自己构建此博客的过程以及给同样想搭建自己博客的朋友们一些指引

## 一、选择框架

现在市面上有很多优秀的博客框架,如:

- 简单易上手的 Hexo
- 开箱即用的 Jekyll
- 网页性能极强的 Astro
- 生态极度完善的 WordPress

而本博客采用 Hugo 框架搭建,此文章也是面向于 Hugo 框架的教程.

选用 Hugo 的原因则是因为它独树一帜的构建速度,以及相对简单的上手难度.也不至于像 Hexo 那么常见.

## 二、安装以及配置Hugo

### 1.安装

需要科学上网

通过此链接下载：[[前往github下载Hugo](https://github.com/gohugoio/hugo/releases)]

选择你自己需要下载的版本，一般选择hugo_extended版本，如果是Windows用户[直接点此下载即可](https://github.com/gohugoio/hugo/releases/download/v0.152.1/hugo_extended_0.152.1_windows-amd64.zip)

然后将压缩包解压缩到一个你容易找到的目录下，比如新建一个E:\Hugo\bin

### 2.配置

在设置中搜索系统环境变量并打开

点击环境变量，选择系统变量下的path，点击编辑，点击新建

将刚刚新建的这个文件夹的路径复制到新建的这行变量中

然后一路确定就大功告成了

这时可以win+r输入cmd打开终端输入hugo version 如果正确显示了版本号就说明配置成功了

## 三、开始搭建博客

### 1.创建站点

来到刚刚新建的E:\Hugo目录下，在目录框中输入cmd打开终端

输入如下的命令行：hugo new site myblog（myblog是此站点名称，可以自定义）

运行成功后应该能够看到此目录下多了一个myblog文件夹

### 2.安装一个主题

[点此进入Hugo官网选择主题下载](https://themes.gohugo.io)

选一个你喜欢的主题下载，点击Download进入其github站点

我们这里以blowfish主题为例

在github界面内点击右上角绿色的Code，点击下面的Download ZIP下载其压缩包

然后解压缩并将其移动到刚刚myblog文件夹下的theme文件夹里

然后将其重命名为所需的文件夹名（部分主题有特殊要求，如blowfish主题就要将文件夹重命名为blowfish，如果你不确定你的主题的重命名要求，可以直接使用下面的方法）

- 打开hugo.toml这个文件，在其中加上一行：theme = '你的主题名字（你刚刚重命名的文件名）'
- 将baseURL此行改为baseURL = "https://www.你的网站域名/" (注意最后的斜杠)
- 把languageCode那行改为languageCode = 'zh-cn'
然后我以blowfish主题为例（此主题自定义程度极高，每个人都能用这个主题搭建出独属于自己的特别的博客）

- 首先剪切自带的hugo.toml文件
- 在theme\blowfish目录下找到config文件夹，将其复制到Hugo\myblog目录下
- 点开hugo文件，把theme = "blowfish"这行前的"#"删去（"#"在.toml文件下为注释，之后所有需要开启的功能都先要将当行前的"#"删去），将defaultContentLanguage = "en"中的en改为zh-cn
- 将languages.en文件重命名为languages.zh-cn，点开此文件把所有的en都替换为zh-cn
- 把dateFormat = "2 January 2006"替换为常用形式，一般用"2006-01-02"即可
- 然后对于下面的部分，择需开启（删去"#"）并作相应的修改（[params.author]建议打开，然后在里面想要展示的部分同时打开即可，记得最后一行前的"#"也要删除），对于logo所需要的图片部分会在后文提到
- 将menus.en文件重命名为menus.zh-cn，其中第1、7、8组功能都建议打开，其他择需打开即可
- params文件下主要是自定义功能，择需打开即可，打开合适的功能有助于你的博客更好看好用，主要就讲一下图片部分
- [点此了解具体配置介绍](https://blowfish.page/zh-cn/docs/configuration)

#### 主题图片

在myblog目录下找到assets或者static文件夹，并在其中创建img文件夹，之后要用到的图片都放到这里面来，并重命名一个简单易区分的名字

在要用到图片的参数后面填入图片路径即可，如：img/logo1.png(确定文件后缀不要错)

也可以使用外部图床的方式：将图片储存到图床网站（如路过图床）,再将此图片的URL路径复制下来粘贴到参数后面即可

### 3.写一篇文章

在myblog目录下启动终端，输入命令：hugo new posts/Article01.md(命名自定义)

然后在content\posts目录下能找到此文章文件，点入即可进行编辑

title即为文章标题，自取即可

可以在两行+++之间加上categories: ["--"] （单项）tags: ["--""--"]（可多项） series: ["--"] series_order: -，以做到分类，挂标签，纳入系列等操作，正文写在两行+++之外

如果你想用到封面图，你需要将你的.md文件更改为一个同名文件夹,并创建一个与文章同名的目录，并在此目录中添加一个 `index.md` 文件（此文件用于写你的文章，和之前你的那个.md文件一样），再把你要用的图片移动到此文件夹下，并重命名为featured

在写正文之前，建议在vscode中下载拓展"Typora"以更便于写作

如果你想在文章中加入图片，使用Typora拓展中内置的工具即可，或者你也可以直接Crtl c+v![1761231626754](/assets/posts/hugo-blog-guide/image/1761231626754.png)

写完后 `Ctrl+S`保存即可

### 4.试运行

在myblog目录下启动终端，输入命令行：hugo server启动，看到Web Server is available at ...即代表启动成功

如果显示1313端口已被占用，输入hugo server -p 1314即可

此时可以在浏览器访问localhost:1313即可本地访问自己的博客啦！😆

## 四、部署网站（无需租云服务器）

云服务器真是太贵啦😭，用这种方法可以帮你避免这部分费用

进入github创建一个仓库，将myblog文件夹同步到这个仓库里

或者在终端逐步输入这部分代码来push

```powershell
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/你的用户名/你的仓库.git
git push -u origin main
```

上阿里云/腾讯云等网站租一个自己喜欢的域名（注意首年费和续费的区别）

[点此进入vercel](https://vercel.com/)，注册登录并绑定刚刚github的仓库，点击**Settings** → **Domains**，并输入你刚购买的域名，点击**Add**

此时会显示不可用，以及两条这种形式的A记录和两条DNS服务器（A记录和CNAME记录二选一即可，这里以A记录为例）

```
A   @   216.198.79.1
A   @   216.198.81.1
```

复制下来去域名商管理域名控制台处的DNS修改（需要实名）删除原有的A和CNAME记录和DNS服务器，将刚刚复制下来的两行记录和DNS服务器分别对应填入

回到vercel点**Refresh**刷新即可

此时就已经部署成功啦！你现在可以在任何设备上通过你自己的域名访问你的博客网站了👍

## 致谢

在此希望大家都可以搭建出自己满意的博客，写出更好的内容

希望本文对你有所帮助，如有问题可通过首页的 QQ 联系我！❤️
