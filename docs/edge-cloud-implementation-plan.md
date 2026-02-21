# Websys POS Edge + Cloud Backoffice Implementation Plan

## 1) Goal
Enable each store to run locally on an on-site server (Raspberry Pi class hardware), while allowing centralized backoffice changes (menu, settings, users, permissions, pricing, etc.) from anywhere without remote desktop into the store machine.

## 2) Current Baseline (from this codebase)
- **Local runtime**
  - Backend: `webapp/backend` (Fastify + Prisma + MySQL)
  - Frontend: `webapp/frontend` (React + Vite)
  - Mobile: `webapp/mobile-server`, `webapp/mobile-owner` (Expo)
- **Key existing primitives**
  - App-level key/value settings via `AppSetting` model and `/settings/*` routes
  - Existing auth + access control in `webapp/backend/src/services/accessControl.ts`
  - Rich operational APIs already in place (`/menu/*`, `/orders/*`, `/tables/*`, `/users`, `/roles`, `/settings/*`)

This is a strong base for an **edge-first sync model**.

## 3) Target Architecture
1. **Store Edge Node (on-site)**
   - Existing backend/frontend/mobile stack remains primary runtime for POS operations.
   - Works fully on LAN even if WAN fails.
2. **Cloud Control Plane**
   - Central multi-tenant backoffice UI + API for remote changes.
   - Does not require inbound ports at store.
3. **Store Agent (outbound-only)**
   - Lightweight process on store node.
   - Maintains secure outbound connection/poll to cloud.
   - Pulls remote commands/config revisions and applies to local backend APIs.

## 4) Delivery Strategy (phased)

### Phase 0 - Foundation Decisions (1-2 days)
- Decide deployment mode strategy:
  - Option A: split cloud API as new service (`webapp/cloud-backend`) - cleaner long term.
  - Option B: single backend with `DEPLOYMENT_MODE=edge|cloud` feature gates - faster bootstrap.
- Decide tunnel/connectivity provider (Cloudflare Tunnel / Tailscale / direct TLS poll).
- Define store identity issuance flow (device bootstrap token + certificate/key).

**Deliverable**
- Final ADR doc in `webapp/docs/adr-edge-cloud-architecture.md`.

### Phase 1 - Data Model + Control Plane Core (3-5 days)
Add cloud-side models in Prisma.

**Schema additions (cloud DB)**
- `Tenant`
- `Store`
- `StoreNode` (device identity, status, lastSeenAt, softwareVersion)
- `SyncRevision` (versioned desired state per domain: settings/menu/users/etc.)
- `SyncCommand` (pending/acked/failed command queue)
- `SyncCommandLog` (execution attempts, error traces)

**Files to change**
- `webapp/backend/prisma/schema.prisma`
- `webapp/backend/prisma/migrations/*`

**Deliverable**
- Migrated schema + seed for one tenant/store + health query.

### Phase 2 - Cloud APIs for Remote Backoffice (4-6 days)
Implement cloud endpoints for store management + revision publication.

**New router modules**
- `webapp/backend/src/routers/cloudStores.ts`
- `webapp/backend/src/routers/cloudSync.ts`
- Register in `webapp/backend/src/server.ts`

**Core endpoints (initial)**
- `POST /cloud/stores` (create store)
- `POST /cloud/stores/:id/nodes/bootstrap` (issue bootstrap token)
- `POST /cloud/stores/:id/revisions` (publish desired config revision)
- `GET /cloud/stores/:id/revisions/latest`
- `GET /cloud/stores/:id/commands`

**Deliverable**
- Cloud can publish a revision and queue commands per store.

### Phase 3 - Store Agent (outbound sync worker) (4-7 days)
Add new service in repo:
- `webapp/store-agent` (Node + TypeScript)

**Responsibilities**
- Register/authenticate store node with cloud.
- Poll commands (or maintain websocket later).
- Apply changes to local edge backend using existing APIs (`/settings/*`, `/menu/*`, `/users`, `/roles`, etc.).
- Ack/fail command results with detailed logs.

**Initial command types**
- `SETTINGS_PATCH`
- `MENU_UPSERT_BATCH`
- `ROLE_PERMISSIONS_PATCH`
- `USER_UPSERT`

**Deliverable**
- End-to-end: publish setting in cloud -> agent applies locally -> ack success.

### Phase 4 - Conflict Model + Audit (3-5 days)
- Add revision checks (`ifMatchRevision`) to prevent stale writes.
- Add immutable audit trail for all cloud-initiated and local changes.
- Add per-domain conflict policy:
  - Settings: cloud-wins by default.
  - Active ticket/order data: always local authoritative.
  - User/role: cloud-wins with local emergency override flag.

**Files (likely)**
- `webapp/backend/src/services/*` (sync + audit services)
- `webapp/backend/src/routers/settings.ts`, `users.ts`, `roles.ts` (emit change events)

### Phase 5 - Backoffice UX for Multi-store Management (5-8 days)
In frontend, add a cloud-oriented “Store Fleet” management area.

**Frontend additions**
- `webapp/frontend/src/pages/CloudStores.tsx`
- `webapp/frontend/src/pages/CloudStoreSync.tsx`
- route wiring in `webapp/frontend/src/App.tsx`

**Capabilities**
- Store list + online/offline + last heartbeat
- Publish config change
- View sync queue + errors + retry
- Compare desired vs applied revision

### Phase 6 - Raspberry Pi Packaging + Operations (3-5 days)
- Add production compose/profile for edge node.
- Add watchdog + auto-start for backend/frontend/agent.
- Add backup/restore workflow.
- Add remote diagnostics package upload.

**Files**
- `webapp/docker-compose.yml` (or new `docker-compose.edge.yml`)
- `webapp/docs/deployment-edge-pi.md`

## 5) Security Model
- **No inbound store ports required** for cloud control.
- Per-store node identity + short-lived tokens.
- Rotate credentials and revoke compromised node IDs.
- RBAC for cloud operators (tenant/store scoped).
- Signed command payloads + replay protection.
- Full audit log for compliance and debugging.

## 6) Sync Boundaries (important)
Domains to sync from cloud to store:
- Settings (`app_settings` domains)
- Menu/catalog/modifiers/pricing/taxes/discounts
- Users/roles/permissions/security levels
- Station/printer routing profiles

Domains that stay local-first:
- Open orders / kitchen tickets / payments in flight
- Device bridge runtime state
- Time-sensitive live station state

## 7) API Contract Pattern
For each sync command:
- `commandId`
- `storeId`
- `domain`
- `revision`
- `payload`
- `issuedAt`
- `signature`

Agent execution result:
- `commandId`
- `status` (`ACKED` | `FAILED`)
- `appliedRevision`
- `errorCode`
- `errorDetail`
- `appliedAt`

## 8) Immediate Next Sprint (start now)

### Sprint Task A - Cloud schema bootstrap
1. Add new Prisma models (`Tenant`, `Store`, `StoreNode`, `SyncRevision`, `SyncCommand`, `SyncCommandLog`).
2. Add migration and seed sample tenant/store.
3. Add minimal repository/service layer.

### Sprint Task B - Minimal cloud sync endpoints
1. Add `POST /cloud/stores/:id/revisions`.
2. Add `GET /cloud/nodes/:nodeId/commands`.
3. Add `POST /cloud/commands/:id/ack`.

### Sprint Task C - Agent proof-of-concept
1. Create `webapp/store-agent` project.
2. Poll cloud commands every N seconds.
3. Apply `SETTINGS_PATCH` command to local `/settings/:key`.
4. Ack result.

## 9) Acceptance Criteria for MVP
- A cloud operator updates one store setting remotely.
- Within 30 seconds, store edge backend reflects new setting.
- Action is visible in cloud audit log and store local audit log.
- If WAN is down, store continues POS operations and retries sync later.

## 10) Risks & Mitigations
- **Config drift** -> use revision IDs + periodic reconciliation job.
- **Partial apply failures** -> idempotent commands + retry with backoff.
- **Store offline for long periods** -> bounded command retention + snapshot catch-up.
- **Security leakage** -> short-lived tokens, key rotation, and signed payload checks.

## 11) Proposed Implementation Order in This Repo
1. `backend/prisma/schema.prisma` + migration
2. `backend/src/routers/cloudStores.ts`
3. `backend/src/routers/cloudSync.ts`
4. `backend/src/server.ts` route registration
5. `store-agent` new package
6. `frontend/src/pages/CloudStores.tsx`
7. `frontend/src/pages/CloudStoreSync.tsx`

## 12) Current Implementation Status (2026-02-20)
- Done:
  - Cloud control-plane Prisma models and migrations.
  - Cloud routers for store provisioning, revision publishing, node registration, command polling/ack.
  - Command-ops endpoints (`/cloud/stores/:id/commands`, `/cloud/commands/:id/logs`, `/cloud/commands/:id/retry`).
  - Store agent service with node bootstrap, heartbeat, command poll, `SETTINGS_PATCH` apply flow, and ack/fail reporting.
  - Frontend cloud pages (`/settings/cloud-stores`, `/settings/cloud-sync`) plus Back Office entry tiles.
  - Raspberry Pi edge compose scaffold (`docker-compose.edge.yml`).
  - Seed bootstrap for default tenant/store (`Tenant` + `Store`) and optional seeded bootstrap token.
  - End-to-end smoke script (`npm run cloud:smoke`) for the cloud command path.
- In progress / next:
  - Conflict policy enforcement (`ifMatchRevision`) and richer per-domain reconciliation.
  - Immutable local+cloud audit stream for non-cloud domain writes.
  - Additional agent command types (`MENU_UPSERT_BATCH`, `USER_UPSERT`, `ROLE_PERMISSIONS_PATCH`).

---

## Notes for existing Websys POS features
- Keep current local POS behavior untouched first.
- Integrate sync through existing APIs instead of direct DB writes to preserve business rules.
- Reuse existing `/settings/*`, `/menu/*`, `/users`, `/roles` endpoints during early agent implementation.
