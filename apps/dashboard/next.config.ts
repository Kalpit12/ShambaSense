import type { NextConfig } from 'next';

// Static export while the dashboard runs on sample data. Once Supabase is connected the pages read
// through @supabase/ssr on the server (architecture.md §3.4) and this goes back to a server build.
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default config;
