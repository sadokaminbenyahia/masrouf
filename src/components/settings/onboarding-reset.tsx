'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2Icon, RotateCcwIcon } from 'lucide-react';
import { resetOnboardingAction } from '@/app/actions/user';
import { Button } from '@/components/ui/button';
import { errorMessage, unwrap } from '@/lib/query';
import { toastError } from '@/lib/toast';
import { SettingsSection } from './settings-section';

export function OnboardingReset() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <SettingsSection
      id="introduction"
      title="Introduction"
      description="Revoyez les étapes de démarrage : soldes de départ, budgets proposés, première action."
    >
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              unwrap(await resetOnboardingAction());
              router.refresh();
            } catch (e) {
              toastError(errorMessage(e));
            }
          })
        }
      >
        {pending ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <RotateCcwIcon aria-hidden="true" />
        )}
        Revoir l&apos;introduction
      </Button>
    </SettingsSection>
  );
}
