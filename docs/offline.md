# Offline strategy

The app is designed for on‑prem installs where the backend and database are local to the site. This means the UI remains functional even if the internet connection goes down.

To cover intermittent LAN/Wi‑Fi loss, the frontend will use:
- A service worker to cache the UI shell.
- An IndexedDB queue to store writes when the API is unreachable.
- A background sync routine to flush queued mutations once the API is reachable.

The backend remains the source of truth. Terminals can use a local network URL or localhost (kiosk mode) to keep traffic on‑prem.
