---
townId: "post-obsidian-sync"
title: "免费实现全设备同步 Obsidian 数据"
description: "借助 Git、GitHub 与移动端工具，搭建一套免费、可控的 Obsidian 多设备同步方案。"
date: "2026-05-16T13:59:13+08:00"
category: "工具捣鼓"
tags: ["Obsidian", "GitHub"]
series: "Obsidian"
seriesIndex: 1
cover: "/assets/posts/obsidian-sync/cover.png"
coverAlt: "免费实现全设备同步 Obsidian 数据"
draft: false
---

上一篇我们提到AI Agent 在 Obsidian 中的运用,也能感受到 Obsidian 的强大,但 Obsidian 的确存在一个使用体验上的明显缺陷:同步化难,官方提供的账号同步功能是收费的,且费用较高.但我们可以通过本篇提到的方法完美解决多设备间同步化的问题,甚至同步能到移动式设备上,且完全免费,在配置结束后使用起来也极其快捷.
## 苹果设备间的同步
由于 Obsidian 仓库是可以直接从 iCould 中打开的,所以如果你只需要在苹果设备间同步那实现是相当简单的,将整个仓库放入 iCould 即可,所以这里不过多赘述
## 不同系统设备间的同步
若你需要在 Windows/macOS/Liunx 甚至是安卓设备之间进行同步,那么最好的办法就是利用 github了(需要科学上网)
### 电脑系统间同步
首先要确保电脑环境里有 git(macOS 自带,Windows/Linux 用户直接去官网安装或者命令行安装都可),并要绑定账号.

先在 github 上新建一个仓库,并在 Obsidian 的社区插件市场中找到并安装`Git`这个插件
现在在 Obsidian 的界面中按`command+p`/`Crtl+p`打开命令面板,并在输入框中输入并选择`Git: Initialize a new repo`,然后再次打开命令面板,输入并选择`Git: Edit remotes`,在其中输入`origin`回车后再填入刚刚创建的 github 仓库的链接,然后进行第一次推送即可,第一次推送时可能会要求用户鉴权,注意此时要求输入的密码不是 github 的账号密码,而是在 github 的 `Settings` 里划到左侧最下方的`Developer settings`中`Personal access tokens`下的`Tokens (classic)`再选择`Generate new token (Classic) `输入个名称,然后勾选`repo`这个大类,最后点击生成即可,生成的这个 token 才是真正需要填入的密码(将生成的 token 暂存下来,就算这里没需要鉴权后面在移动设备上同步的时候也会用到这个 token).同样提醒输入的密码是默认隐藏的,不要粘贴多次了.

注:记得在仓库中新建一个`.gitignore`文件,在其中填入:
```
.DS_Store
Thumbs.db
*.tmp

.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian.mobile/
 
.obsidian/cache/
```

在需要同步的其他设备上,在你想要放 Obsidian 的目录下打开终端输入 `git clone https://github.com/你的用户名/仓库名.git`,在此设备的 Obsidian 上选择打开文件夹并选择刚刚克隆下来的仓库即可.
这样就已经完成同步了,在 Obsidian 左边栏找到并打开刚刚下载的 Git 插件就可以实现便捷的推拉操作了,也可以根据自身需求完成对 Git 插件的设置(其中的`Pull`中的`Pull on started`建议打开).
### 在安卓设备上同步
为了满足部分读者在移动设备上也需要查看并自行编辑笔记的需求,这里也简单提一下怎么在安卓设备进行同步,同样使用 github,但不再使用 Git 插件,具体实现方法如下:

首先安卓设备可以在 Google Play 商店里安装 Obsidian,同样也安装好 GitSync.然后进入 GitSync,直接登录 Github 鉴权,然后选择你的笔记仓库同步到一个空文件夹(建议放系统的 Documents 目录下),克隆完成后可能会提示你此仓库有 Obsidian 的 Git 插件可能导致冲突,先不要管,也先不要设置 GitSync 的自动同步功能,先进入 Obsidian 打开刚刚克隆后的文件夹,进入设置->文件与链接->划到最下找到`切换设置文件夹`将里面改为`.obsidian.mobile`,然后可以回到 GitSync 完成应用同步设置,授权无障碍后选择同步 Obsidian 应用即可.

注:在手机端打开Obsidian仓库后可能会导致插件被自动关闭并被 GitSync 自动提交修改后的`.obsidian/community-plugins.json`,此时在电脑端 Obsidian 拉取并重启应用后会发现插件被关闭了,重新启用插件并在电脑端上再次推送即可.由于手机端改为使用`.obsidian.mobile`设置文件夹了这种问题之后就不会再发生了

当然如果你想在 iPhone 上用 GitSync 同步仓库也是可以的(也需要科学上网),可以直接在AppStore 中安装GitSync,甚至一般来说体验会好于通过 iCloud 同步

## 结语
最后希望这篇简短的教程能够帮到你☺️
