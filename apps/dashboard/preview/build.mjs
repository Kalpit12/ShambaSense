import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const result = await build({
  entryPoints: [path.join(root, 'preview/main.tsx')],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  alias: { '@': root },
  // The preview always runs on sample data.
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': 'undefined', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': 'undefined', 'process.env.NEXT_PUBLIC_DEMO_AUTH': 'undefined' },
  logLevel: 'error',
});
const css = ['app/globals.css', 'app/dashboard.css'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const js = result.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ShambaSense Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
<style>${css}</style>
</head>
<body><div id="root"></div><script>${js}</script></body>
</html>`;
fs.mkdirSync(process.argv[2] ? path.dirname(process.argv[2]) : root, { recursive: true });
fs.writeFileSync(process.argv[2] ?? path.join(root, 'preview/index.html'), html);
console.log('wrote', html.length);
