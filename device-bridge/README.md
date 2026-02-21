# Device Bridge (Windows)

This service runs locally on the on‑prem Windows server and connects to hardware.

## Supported device types (current stubs)
- PAX A35 (semi‑integration, Ethernet)
- Receipt/Kitchen printers (generic ESC/POS, Epson, Star)
- Cash drawer (printer kick)
- Barcode scanner (USB HID, Ethernet)
- Scale (USB, Ethernet)
- Customer display

## Config
Copy `config.example.json` to `config.json` and set your device IPs/ports.
You can override the path with `DEVICE_BRIDGE_CONFIG`.

## Run
```bash
npm install
npm run dev
```

## Notes
- Print jobs are currently spooled to a temp folder.
- PAX endpoints are stubbed until we add the SDK/protocol.
