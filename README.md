# KeepFlip

KeepFlip is an Expo/React Native item scanner with Appwrite authentication,
private photo uploads, and evidence-backed AI identification.

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` and provide the public Appwrite project IDs.
   `.env` is ignored by Git. Never place OpenAI, Google Cloud, or Appwrite
   server API keys in an `EXPO_PUBLIC_` variable.

3. In Appwrite, add a React Native platform for `com.keepflip.app` and enable
   Email/Password authentication. The app supports sign-in, account creation,
   persisted registered sessions, foreground session verification, and sign-out.

4. Follow the Function and private Storage checklist in
   [`backend/functions/analyze-item/README.md`](backend/functions/analyze-item/README.md),
   then configure sold-comp research using
   [`backend/functions/ebay-sold-comps/README.md`](backend/functions/ebay-sold-comps/README.md).

5. Start the native development build:

   ```powershell
   npx expo start --dev-client
   ```

`react-native-vision-camera` and the native Three.js scanner atmosphere require
a development build; they are not expected to run inside Expo Go.

## Route boundary

The root Expo Router stack uses protected groups:

- `(auth)` is available only while signed out, misconfigured, or unable to
  verify the current session.
- `(app)` contains the scanner, inventory, slide-down menu, and account screen,
  and is mounted only for a verified non-anonymous Appwrite session.
- While session state is being checked, KeepFlip renders a branded bootstrap
  screen instead of mounting the camera route.

## Verification

```powershell
npx tsc --noEmit
npx expo lint
npx expo export --platform android
```

Backend checks:

```powershell
cd backend/functions/analyze-item
npm run check
npm test

cd ../ebay-sold-comps
npm run check
npm test
```
