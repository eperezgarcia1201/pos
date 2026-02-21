# Websys Store Agent

Outbound sync worker for edge stores.

## What it does
- Registers a store node with cloud control plane (one-time bootstrap).
- Polls cloud for pending sync commands.
- Applies supported commands to local edge backend APIs.
- Acknowledges success/failure back to cloud.

## Supported command types
- `SETTINGS_PATCH`
- `*_SETTINGS_PATCH`
- `REMOTE_ACTION_HEARTBEAT_NOW`
- `REMOTE_ACTION_SYNC_PULL`
- `REMOTE_ACTION_RUN_DIAGNOSTICS`
- `REMOTE_ACTION_RELOAD_SETTINGS`
- `REMOTE_ACTION_RESTART_BACKEND` (requires endpoint)
- `REMOTE_ACTION_RESTART_AGENT`

Payload shapes supported:
- `{ "key": "settings_key", "value": <json> }`
- `{ "settings": [{ "key": "k1", "value": <json> }, ...] }`
- Remote action payload:
  - `{ "action": "RESTART_BACKEND", "parameters": { "endpoint": "/maintenance/restart" } }`

## Run
1. Install deps:
   - `npm install`
2. Configure env:
   - copy `.env.example` values into your runtime environment
3. Start:
   - `npm run dev`

## Notes
- Agent only opens outbound requests.
- No inbound ports are needed at store.
- For backend restart command, either pass `parameters.endpoint` in remote action payload or set `EDGE_RESTART_ENDPOINT` env.
