# AI Rules
# Codex Agent Instructions - KeepFlip Expo
This file defines code architecture constraints and best practices for this repository.

## Tech Stack

- Expo SDK 57 application targeting Android, iOS, and web, with EAS used for native builds.
- React 19 and React Native 0.86, written in strict TypeScript.
- Expo Router provides file-based routing from `app/`, including `(auth)` and `(app)` route groups and protected stacks.
- React Native `StyleSheet` and the shared `constants/keepflip-theme.ts` tokens provide styling; this project does not use Tailwind CSS or shadcn/ui.
- Appwrite is the backend for authentication, tables, storage, realtime data, and server-side functions through `react-native-appwrite`.
- `react-native-vision-camera`, Vision Camera worklets, and Expo image APIs power scanning and photo workflows.
- React Native Reanimated and Gesture Handler provide animations and gesture interactions; Expo Haptics handles tactile feedback.
- Shopify React Native Skia, Three.js/Filament, and fast TFLite support advanced scanner graphics, 3D rendering, and on-device inference.
- Break down monolithic components into atomic structural components to prevent rendering lags on web browsers.
- Always use performance-optimized virtualized lists for handling large datasets.

## Library and Architecture Rules

- **Routing:** Create routes only under `app/` and use Expo Router APIs (`Stack`, `Link`, `useRouter`, typed `Href`) for navigation. Keep signed-in screens in `app/(app)/`, auth screens in `app/(auth)/`, and shared route protection in layout files.
- **Components:** Put reusable UI in `components/`, grouped by feature. Keep route files thin by composing feature components rather than embedding large implementations in `app/` files.
- **Styling:** Use React Native `StyleSheet.create` and values from `keepFlipTheme`; do not add CSS frameworks, Tailwind, or web-only styling. Use `KeepFlipText`/`KeepFlipTextInput` for standard application typography and existing shared UI primitives where available.
- **Platform differences:** Use Expo/React Native cross-platform APIs by default. When native and web behavior must differ, use platform files such as `.native.tsx`, `.ios.tsx`, `.android.tsx`, or `.web.tsx` instead of large inline platform conditionals.
- **Backend:** Access Appwrite through `lib/appwrite.ts` and feature-specific modules in `services/`. UI components must not contain privileged backend logic or instantiate duplicate Appwrite clients.
- **Secrets and configuration:** Read client-safe configuration from explicit `EXPO_PUBLIC_*` environment variables. Never place API secrets, admin keys, OAuth client secrets, or privileged credentials in the app bundle; keep those inside Appwrite Functions or secure server infrastructure.
- **Images and camera:** Use `expo-image` for display, Expo image picker/manipulator for library and editing flows, and `react-native-vision-camera` only for live camera/scanner features. Always handle permissions and release camera-heavy work when a screen loses focus.
- **Motion and gestures:** Use Reanimated for UI-thread animations, Gesture Handler for complex gestures, and Expo Haptics for feedback. Respect component lifecycle and avoid long-running JS-thread animation loops.
- **Graphics and ML:** Use Skia for high-performance 2D overlays, Filament/Three.js for existing 3D workflows, and fast TFLite for on-device inference. Keep these native-heavy features isolated behind platform-specific components and preserve lightweight fallbacks for unsupported platforms.
- **State:** Prefer local React state for screen-only concerns and existing context providers for shared auth, menu, feedback, and analysis-result state. Do not introduce another state-management library unless the current patterns cannot meet a concrete requirement.
- **Imports and types:** Use the configured `@/` alias for project imports, keep TypeScript strict, avoid `any`, and define explicit boundary types for service inputs and outputs.
- **Dependencies:** Reuse installed Expo and React Native packages before adding a new dependency. Any new native library must be compatible with Expo SDK 57 and the project’s development-client/EAS workflow.
- **Quality:** Keep services focused, validate user input and external responses at boundaries, avoid logging sensitive user data, and run TypeScript and Expo lint checks for affected code before considering a change complete.
- **Firebase:** The target production directory for Firebase Hosting must be pointed to the compiled static output folder (typically `dist/`). Every deployment pipeline must explicitly run the step `npx expo export:web` or `npx expo export` before triggering the Firebase deployment action. Secure deployment access using the `FirebaseExtended/action-hosting-deploy` block mapped to repository secrets.
