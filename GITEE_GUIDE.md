# 跑团助手 - Gitee 版本管理指南

## 仓库信息

| 项目 | 地址 |
|------|------|
| Gitee 仓库 | [gitee.com/hoshiharachen/paotuan-app](https://gitee.com/hoshiharachen/paotuan-app) |
| 本地路径 | `e:\Work\Vibe-coding\跑团\paotuan-app\` |
| 远端名称 | `gitee` |
| 认证方式 | SSH 密钥 (`~/.ssh/gitee_ed25519`) |

---

## 日常操作

### 提交并推送代码

```bash
cd "e:/Work/Vibe-coding/跑团/paotuan-app/"

# 1. 暂存所有改动
git add -A

# 2. 提交（引号内写改动说明）
git commit -m "描述你改了什么"

# 3. 推送到 Gitee
git push gitee master
```

> **建议**：每完成一个功能模块就提交一次，不要攒大量改动一起提交。

### 查看提交历史

```bash
# 简洁版（一行一条）
git log --oneline

# 最近 10 条
git log --oneline -10

# 图形化显示分支
git log --oneline --graph
```

### 查看当前状态

```bash
# 看看哪些文件被改动了
git status

# 看看具体改了什么内容
git diff
```

---

## 版本回溯

### 场景 1：代码崩溃，回到上一个正常版本

```bash
# 先看历史记录，找到正常版本的 commit 号（如 a1b2c3d）
git log --oneline -10

# 安全回退（保留回退记录，推荐）
git revert <commit-id>
git push gitee master
```

### 场景 2：彻底丢弃最近的改动

```bash
# 硬回退到某个历史版本（⚠️ 之后的所有改动将丢失）
git reset --hard <commit-id>
git push gitee master --force
```

### 场景 3：只恢复某一个文件

```bash
# 从历史版本恢复单个文件
git checkout <commit-id> -- src/pages/GamePage.vue

# 提交恢复
git commit -m "恢复 GamePage.vue 到 <commit-id> 版本"
git push gitee master
```

### 场景 4：查看某次提交改了什么

```bash
# 看差异
git diff <commit-id>

# 看详细信息
git show <commit-id>
```

### 场景 5：误删文件后恢复

```bash
# 查看被删除的文件
git log --diff-filter=D --summary

# 从上一个提交恢复
git checkout HEAD~1 -- 被删除的文件路径
```

---

## 打标签（标记稳定版本）

当某个版本特别稳定时，打个标签方便以后快速定位：

```bash
# 打标签
git tag v1.0-stable

# 推送到远端
git push gitee --tags

# 查看所有标签
git tag

# 回到某个标签
git checkout v1.0-stable
```

---

## 分支管理（进阶）

当要做大改动时，可以开分支，不影响主分支：

```bash
# 创建并切换到新分支
git checkout -b feature/新功能名

# 在新分支上开发、提交、推送
git add -A
git commit -m "新功能完成"
git push gitee feature/新功能名

# 切回主分支
git checkout master

# 合并新分支
git merge feature/新功能名
git push gitee master

# 删除已完成的分支
git branch -d feature/新功能名
```

---

## 常见问题

### Q: push 时提示冲突怎么办？

```bash
# 先拉取远端最新代码
git pull gitee master

# 如果有冲突，手动解决后：
git add -A
git commit -m "解决冲突"
git push gitee master
```

### Q: 想撤销还没 push 的 commit？

```bash
# 撤销最近一次 commit，保留文件改动
git reset --soft HEAD~1

# 撤销最近一次 commit，丢弃文件改动（⚠️ 危险）
git reset --hard HEAD~1
```

### Q: 本地文件改乱了，想回到上次 commit 的状态？

```bash
# 丢弃所有未提交的改动（⚠️ 不可恢复）
git checkout -- .
```

---

## 快速参考卡片

| 操作 | 命令 |
|------|------|
| 查看历史 | `git log --oneline` |
| 查看状态 | `git status` |
| 提交+推送 | `git add -A && git commit -m "..." && git push gitee master` |
| 回到某版本 | `git revert <id>` 或 `git reset --hard <id>` |
| 恢复单文件 | `git checkout <id> -- 文件路径` |
| 打稳定标签 | `git tag v1.0 && git push gitee --tags` |
| 开新分支 | `git checkout -b 分支名` |
| 拉取远端 | `git pull gitee master` |
