import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import KeepFlipIntro from '@/components/intro/keepflip-intro.native';
import { markKeepFlipLaunchExperienceCompleted } from '@/services/keepflip-launch-state-service';

type KeepFlipLaunchExperienceProps = {
  onVisibilityChange?: (visible: boolean) => void;
};

export default function KeepFlipLaunchExperience({
  onVisibilityChange,
}: KeepFlipLaunchExperienceProps) {
  const router = useRouter();
  const { status } = useKeepFlipAuth();
  const [introFinished, setIntroFinished] = useState(false);
  const hasResolvedLaunchRef = useRef(false);

  useEffect(() => {
    onVisibilityChange?.(!introFinished);
  }, [introFinished, onVisibilityChange]);

  useEffect(() => {
    if (
      !introFinished ||
      status === 'checking' ||
      hasResolvedLaunchRef.current
    ) {
      return;
    }

    hasResolvedLaunchRef.current = true;

    if (status === 'signed-in') {
      void markKeepFlipLaunchExperienceCompleted();
      const frame = requestAnimationFrame(() => {
        router.replace('/' as Href);
      });
      return () => cancelAnimationFrame(frame);
    }

    const frame = requestAnimationFrame(() => {
      router.replace('/welcome' as Href);
    });
    return () => cancelAnimationFrame(frame);
  }, [introFinished, router, status]);

  if (introFinished) return null;

  return (
    <KeepFlipIntro
      onComplete={() => setIntroFinished(true)}
      startupReady
    />
  );
}
