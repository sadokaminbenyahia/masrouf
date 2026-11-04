import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Masrouf',
    short_name: 'Masrouf',
    description: 'Votre budget personnel en dinars tunisiens, avec une IA 100 % locale.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/tableau-de-bord',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    theme_color: '#1F5FAD',
    background_color: '#FAFAF7',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Ajouter une dépense',
        short_name: 'Ajouter',
        url: '/tableau-de-bord?nouveau=1',
        icons: [{ src: '/icons/shortcut-add.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Assistant',
        short_name: 'Assistant',
        url: '/assistant',
        icons: [{ src: '/icons/shortcut-add.png', sizes: '96x96', type: 'image/png' }],
      },
    ],
  };
}
