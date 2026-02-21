# Websys POS Owner Mobile App

Cross-platform mobile app (iOS + Android) for restaurant owners.

## Current scope
- Sign in with existing Websys POS credentials (`/auth/login`)
- View owner dashboard (`/owner/dashboard`)
- See:
  - open tickets
  - daily sales snapshot
  - void-abuse alerts (voids above threshold)

## Run locally
1. Start backend API (`http://<server-ip>:8080`).
2. From this folder:
   - `npm install`
   - `npm run start`
3. Open with:
   - `npm run ios` (iOS simulator/macOS)
   - `npm run android` (Android emulator)
   - Expo Go on physical device via QR

## Server URL setup
- In the app sign-in screen, set **Server URL**.
- Use your backend machine LAN IP for real phones, example:
  - `http://192.168.1.50:8080`
- Do not use `localhost` on physical phones.

## Notes
- Session and server URL are stored locally on device.
- Auto refresh runs every 30 seconds while signed in.
