# Bio Spin 45

面向肠道菌群—骨骼肌研究学习者的每日 45 分钟学习转盘。

在线使用：<https://jaczforwork.github.io/Bio-spin-45/>

## 功能

- 20 个待学习主题的随机转盘与 45 分钟计时
- 63 个肠道菌群、骨骼肌、线粒体、组学、实验与研究设计主题
- 完成后记录自己的理解、待解决问题和 1–5 分掌握度，并自动归档
- 一键复制个性化导师提示并打开 ChatGPT，辅助追问和评估真实掌握程度
- 根据薄弱类别、前置知识、近期学习和个人侧重推荐下一项
- 支持新增、编辑、删除、加入和换出转盘词条
- 支持按推荐顺序、难度、状态、类别和最近学习排列
- 支持邮箱密码或 Magic Link 登录，在电脑、手机和平板之间实时同步
- PWA 安装与离线缓存
- 未登录时记录保存在浏览器；登录后通过行级权限隔离到每位用户

## 安装到 iPhone / iPad

使用 Safari 打开在线地址，点击“分享” → “添加到主屏幕”。

### 主屏幕 App 登录

iOS 会隔离 Safari 网页与主屏幕 Web App 的登录存储，因此邮件登录链接可能只让 Safari 显示“已同步”。推荐使用邮箱密码在主屏幕 App 内直接登录：

1. 如果以前只用 Magic Link 登录，先在 Safari 网页版打开右上角“已同步”，设置一次“同步密码”。
2. 回到主屏幕 App，打开“登录同步”，输入同一邮箱和同步密码。
3. 新用户可以直接选择“注册新账号”；确认邮箱后回到主屏幕 App 登录。

密码由 Supabase Auth 处理，应用不会保存明文密码。Magic Link 仍然保留，可用于首次进入或重新验证。

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
2. 在 Authentication → URL Configuration 中，将 Site URL 设置为 `https://jaczforwork.github.io/Bio-spin-45/`，并把同一地址加入 Redirect URLs。
3. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：
   - `VITE_SUPABASE_URL`：项目 URL。
   - `VITE_SUPABASE_ANON_KEY`：项目的 publishable key 或 legacy anon key。不要使用 `service_role` key。
4. 重新运行 GitHub Pages 工作流。配置完成后，页面右上角会出现“登录同步”。

首次在一台设备登录时，本机数据会与云端记录合并；以后云端是该账号各设备的共同状态。断网时继续保存到本机，恢复网络后自动上传。

推送到 `main` 后，GitHub Actions 会自动构建并部署 GitHub Pages。
