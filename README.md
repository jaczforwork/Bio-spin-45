# Bio Spin 45

面向肠道菌群—骨骼肌研究学习者的每日 45 分钟学习转盘。

在线使用：<https://jaczforwork.github.io/Bio-spin-45/>

## 功能

- 20 个待学习主题的随机转盘与 45 分钟计时
- 63 个肠道菌群、骨骼肌、线粒体、组学、实验与研究设计主题
- 完成后按 1–5 分记录掌握度并自动归档
- 根据薄弱类别、前置知识、近期学习和个人侧重推荐下一项
- 支持新增、编辑、删除、加入和换出转盘词条
- 支持按推荐顺序、难度、状态、类别和最近学习排列
- 可选邮箱验证码登录，在电脑、手机和平板之间实时同步
- PWA 安装与离线缓存
- 未登录时记录保存在浏览器；登录后通过行级权限隔离到每位用户

## 安装到 iPhone / iPad

使用 Safari 打开在线地址，点击“分享” → “添加到主屏幕”。

## 本地开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 配置跨设备同步

1. 创建 Supabase 项目，在 SQL Editor 中运行 [`supabase/schema.sql`](supabase/schema.sql)。
2. 在 Authentication → Email Templates → Magic Link 中，将邮件正文改为包含 `{{ .Token }}`，以发送一次性验证码。
3. 在 Authentication → URL Configuration 中，将 Site URL 设置为 `https://jaczforwork.github.io/Bio-spin-45/`。
4. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：
   - `VITE_SUPABASE_URL`：项目 URL。
   - `VITE_SUPABASE_ANON_KEY`：项目的 publishable key 或 legacy anon key。不要使用 `service_role` key。
5. 重新运行 GitHub Pages 工作流。配置完成后，页面右上角会出现“登录同步”。

首次在一台设备登录时，本机数据会与云端记录合并；以后云端是该账号各设备的共同状态。断网时继续保存到本机，恢复网络后自动上传。

推送到 `main` 后，GitHub Actions 会自动构建并部署 GitHub Pages。
