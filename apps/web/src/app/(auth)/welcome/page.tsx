'use client';

import { useRouter } from 'next/navigation';

import { Button, Screen } from '@/components';

export default function Welcome() {
  const router = useRouter();

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <h1 className="text-4xl font-bold text-ink">Buddy</h1>
        <p className="text-base text-ink-muted">
          Plan your day, get it approved by a buddy, build the streak.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Button label="Create an account" onClick={() => router.push('/register')} />
          <Button
            label="I already have an account"
            variant="ghost"
            onClick={() => router.push('/login')}
          />
        </div>
      </div>
    </Screen>
  );
}
