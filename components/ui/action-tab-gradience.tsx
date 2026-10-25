// Expo resolves .web and .native implementations on supported platforms.
// - On native (iOS/Android): action-tab-gradience.native.tsx (using @shopify/react-native-skia)
// - On web: action-tab-gradience.web.tsx (using CSS animations, avoiding CanvasKit WASM errors)
// This file serves as the platform-neutral export and TypeScript interface.

export * from './action-tab-gradience.web';
export { default } from './action-tab-gradience.web';
