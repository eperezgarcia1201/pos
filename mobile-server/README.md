# Websys POS Server Mobile App

Cross-platform mobile app (iOS + Android) for server workflows.

## Included server functionality
- Sign in using PIN (`/auth/pin`) or username/password (`/auth/login`)
- Auto-discover Websys POS servers on local Wi-Fi (`/health` scan)
- Dine In, Take Out, Delivery ticket flows
- Dine-in table selection with open-check handling
- Dine-in table map selector (visual map with status colors)
- Menu browse by category/group and add items to ticket
- Modifier selection on add-item
- Quantity update and line removal
- Ticket actions:
  - Hold
  - Done (sends to kitchen)
  - Apply discount
  - Split ticket
  - Take payment
  - Void ticket
  - Print receipt
  - Add check (chain)
- Recall open tickets and reopen

## Run locally
1. Start backend API at `http://<server-ip>:8080`.
2. From this folder:
   - `npm install`
   - `npm run start`
3. Run platform:
   - `npm run ios`
   - `npm run android`
   - or open from Expo Go QR

## Notes
- Use backend machine LAN IP on physical phones, not `localhost`.
- Session and server URL are stored locally on device.
