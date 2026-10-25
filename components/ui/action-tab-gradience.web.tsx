import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

export interface ActionTabGradienceProps extends ViewProps {
  width?: number;
  height?: number;
  children?: React.ReactNode;
}

const KEYFRAMES_ID = 'action-tab-gradience-web-keyframes';

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;

  const styleEl = document.createElement('style');
  styleEl.id = KEYFRAMES_ID;
  styleEl.textContent = `
    @keyframes actionTabGradienceShift {
      0% {
        background-position: 0% 25%;
      }
      25% {
        background-position: 50% 25%;
      }
      50% {
        background-position: 100% 75%;
      }
      75% {
        background-position: 50% 75%;
      }
      100% {
        background-position: 75% 100%;
      }
    }
    .action-tab-gradience-bg {
      background: linear-gradient(135deg, #7c60f9, #a693fb, #f8d79a, #ffcd70, #00ffff, #01c2c2);
      background-size: 300% 300%;
      animation: actionTabGradienceShift 16s ease-in-out infinite alternate;
      will-change: background-position;
    }
  `;
  document.head.appendChild(styleEl);
}

export default function ActionTabGradience({
  width,
  height,
  children,
  style,
  ...viewProps
}: ActionTabGradienceProps) {
  const responsiveLayout = useResponsiveLayout();
  useEffect(() => {
    ensureKeyframes();
  }, []);

  return (
    <View
      style={[
        styles.container,
        width !== undefined ? { width } : null,
        height !== undefined ? { height } : null,
        style,
      ]}
      {...viewProps}
    >
      <div
        className="action-tab-gradience-bg"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
        }}
      />
      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
});
