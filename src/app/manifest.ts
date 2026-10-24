import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MiTV 控制中心',
    short_name: 'MiTV',
    description: 'Redmi 显示器 G Pro 27U / 小米显示器的本地控制中心',
    start_url: '/',
    display: 'standalone',
    background_color: '#131318',
    theme_color: '#131318',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
