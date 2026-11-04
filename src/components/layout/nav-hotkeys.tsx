'use client';
import { useRouter } from 'next/navigation';
import { useHotkey } from '@/lib/hooks/use-hotkey';
import { NAV_ITEMS, type NavItem } from './nav-items';

function NavHotkey({ item }: { item: NavItem }) {
  const router = useRouter();
  useHotkey(`g ${item.shortcut}`, () => router.push(item.href));
  return null;
}

/** « g » puis une lettre : navigation au clavier. */
export function NavHotkeys() {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavHotkey key={item.href} item={item} />
      ))}
    </>
  );
}
