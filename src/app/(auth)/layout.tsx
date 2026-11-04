import type { ReactNode } from 'react';
import { ShieldCheckIcon, SparklesIcon, WalletIcon } from 'lucide-react';
import { BrandMark, LogoGlyph } from '@/components/layout/brand';

const PROMISES = [
  { icon: WalletIcon, text: 'Comptes, espèces et cartes, en dinars au millime près.' },
  { icon: SparklesIcon, text: 'Catégorisation et conseils par une IA 100 % locale.' },
  { icon: ShieldCheckIcon, text: 'Vos données restent chez vous. Aucun service tiers.' },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside
        aria-label="Masrouf en bref"
        className="relative hidden overflow-hidden bg-[#1F5FAD] text-white lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        {/* Arcs inspirés des portes de Sidi Bou Saïd */}
        <svg
          className="pointer-events-none absolute -right-24 -bottom-24 h-[38rem] w-[38rem] opacity-[0.13]"
          viewBox="0 0 400 400"
          fill="none"
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M${60 + i * 28} 400V${200 - i * 6}c0-${76 - i * 14} ${62 - i * 14}-${140 - i * 28} ${140 - i * 28}-${140 - i * 28}s${140 - i * 28} ${62 - i * 14} ${140 - i * 28} ${140 - i * 28}V400`}
              stroke="white"
              strokeWidth="2"
            />
          ))}
        </svg>
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.16),transparent_55%)]" />
        <div className="relative flex items-center gap-3">
          <LogoGlyph className="size-10 ring-1 ring-white/25 rounded-[10px]" />
          <span className="text-xl font-semibold tracking-tight">Masrouf</span>
        </div>
        <div className="relative max-w-md">
          <p className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance">
            Sachez où part chaque dinar.
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {PROMISES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-[0.95rem] text-white/90">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/20">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/85">Conçu en Tunisie, pour la Tunisie.</p>
      </aside>

      <main id="contenu" className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
          <BrandMark />
          <p className="mt-2 text-sm text-muted-foreground">Sachez où part chaque dinar</p>
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
