import { useEffect } from 'react';

type KeepFlipLaunchExperienceProps = {
  onVisibilityChange?: (visible: boolean) => void;
};

/** The browser has its own route-driven auth/onboarding entry screens. */
export default function KeepFlipLaunchExperience({
  onVisibilityChange,
}: KeepFlipLaunchExperienceProps) {
  useEffect(() => {
    onVisibilityChange?.(false);
  }, [onVisibilityChange]);

  return null;
}
