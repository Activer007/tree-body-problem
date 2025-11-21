<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Three-Body Star System – 本地运行与部署指南

这是一个使用 Vite + React 构建的三体问题交互式模拟器。按照以下步骤在本地运行、创建生产构建并部署到您选择的静态托管服务。

## 系统要求

- Node.js 18+ (推荐 LTS 版本) 和 npm

## 本地运行应用程序

本项目已完全配置为独立运行，无需任何外部 API 密钥或云服务依赖。


## 1. Install Dependencies

```bash
npm install
```

## 2. Run Locally (Hot Reload)

```bash
npm run dev
```

The dev server listens on `http://localhost:3000` (or another available port if 3000 is taken). Press `o` in the terminal to auto-open the browser.

## 3. Build for Production

```bash
npm run build
```

The production-ready assets are written to `dist/`. To sanity-check the optimized bundle locally, run:

```bash
npm run preview
```

## 4. Deploy

Because this is a static Vite app, you can deploy the `dist/` folder to any static host. Two common options:

### Deploy to Vercel
1. Install the CLI (`npm i -g vercel`) and run `vercel login`.
2. From the repo root run `vercel` (first deploy) or `vercel --prod` (subsequent production deploys). The default settings detect Vite automatically.

### Deploy to Netlify (or any static host)
1. Install the CLI (`npm i -g netlify-cli`) and run `netlify login`.
2. Build locally (`npm run build`).
3. Run `netlify deploy --dir=dist` for a draft URL, or add `--prod` to publish.

If you prefer manual hosting (e.g., S3, Cloudflare Pages, GitHub Pages), simply upload the contents of `dist/` and point your CDN to that directory.

---

Need help? Open an issue or ping the team. Happy launching!
