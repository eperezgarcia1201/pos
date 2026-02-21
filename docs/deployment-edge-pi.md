# Edge Deployment on Raspberry Pi

## Scope
Deploy one store edge node (backend + frontend + store-agent) on Raspberry Pi.

## Recommended hardware
- Raspberry Pi 5 (8GB+)
- SSD (USB 3) for OS/data
- Active cooling
- UPS for graceful outage handling

## Runtime components
- `webapp/backend`
- `webapp/frontend`
- `webapp/store-agent`
- MySQL (local)

## Environment variables
### Backend
- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`

### Store Agent
- `CLOUD_API_URL`
- `EDGE_API_URL`
- `STORE_ID` + `BOOTSTRAP_TOKEN` (first run) OR `NODE_ID` + `NODE_TOKEN`
- One edge auth strategy:
  - `EDGE_AUTH_BEARER` + `EDGE_USER_ID`
  - `EDGE_PIN`
  - `EDGE_USERNAME` + `EDGE_PASSWORD`

## First-time bootstrap
1. Start backend and ensure `/health` is reachable.
2. From cloud backoffice, issue node bootstrap token.
3. Start `store-agent` with `STORE_ID` + `BOOTSTRAP_TOKEN`.
4. Agent registers node and persists credentials in `agent-state.json`.
5. Future starts use saved node credentials.

## Suggested PM2 services
- `websys-backend`
- `websys-frontend`
- `websys-store-agent`

## Monitoring checklist
- Backend health endpoint responsive.
- Agent heartbeat updates `StoreNode.lastSeenAt`.
- Pending command queue does not grow unbounded.
- Disk free space and MySQL service status.

## Optional seed bootstrap
`backend/scripts/seed.ts` now creates:
- default cloud tenant (`default-tenant`)
- default cloud store (`PRIMARY-STORE`)

Optional environment variables before `npm run db:seed`:
- `CLOUD_TENANT_NAME`
- `CLOUD_TENANT_SLUG`
- `CLOUD_STORE_NAME`
- `CLOUD_STORE_CODE`
- `CLOUD_STORE_TIMEZONE`
- `CLOUD_EDGE_BASE_URL`
- `CLOUD_BOOTSTRAP_TOKEN` (if provided, creates one reusable unconsumed bootstrap hash)
- `CLOUD_BOOTSTRAP_LABEL`

## Cloud API smoke test
After backend is running, verify command lifecycle:

```bash
cd webapp/backend
npm run cloud:smoke
```

The script performs:
1. Login with PIN
2. Create cloud store
3. Issue bootstrap token
4. Register node
5. Publish `SETTINGS_PATCH` revision
6. Poll command queue
7. ACK command
8. Read command logs
