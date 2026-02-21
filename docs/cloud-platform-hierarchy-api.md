# Cloud Platform Hierarchy API

This API implements owner -> reseller -> tenant -> multi-location store logic.

## Account types
- `OWNER`: full platform scope
- `RESELLER`: scoped to one reseller and its tenants/stores
- `TENANT_ADMIN`: scoped to one tenant and its stores

## Auth
1. Login:
   - `POST /cloud/auth/login`
   - body: `{ "email": "...", "password": "..." }`
2. Use returned JWT as `Authorization: Bearer <token>`.
3. Session check:
   - `GET /cloud/auth/me`

## Resellers
- `GET /cloud/platform/resellers`
  - owner: all resellers
  - reseller: own reseller only
- `POST /cloud/platform/resellers` (owner only)
  - create reseller and optional reseller admin account
- `POST /cloud/platform/resellers/:id/accounts`
  - owner can create for any reseller
  - reseller can create under own reseller

## Tenants
- `GET /cloud/platform/tenants`
  - owner: all or `?resellerId=...`
  - reseller: own tenants
  - tenant_admin: own tenant
- `POST /cloud/platform/tenants`
  - owner: can assign optional `resellerId`
  - reseller: tenant forced under own reseller
- `POST /cloud/platform/resellers/:id/tenants`
  - explicit tenant creation under one reseller
- `POST /cloud/platform/tenants/:id/accounts`
  - create tenant-admin cloud accounts

## Stores (multi-location)
- `GET /cloud/platform/stores`
  - owner/reseller/tenant_admin scoped automatically
- `POST /cloud/platform/stores`
  - create location under tenant

## Dedicated Store Network (onsite mapping)
- `GET /cloud/platform/network`
  - scoped by cloud account
  - optional query:
    - `resellerId`
    - `tenantId`
    - `storeStatus`
    - `nodeStatus=ONLINE|STALE|OFFLINE`
    - `includeUnlinked=true|false`
  - returns:
    - summary counters (`storesLinked`, `nodesOnline`, etc.)
    - store list with node details (`nodeKey`, `onsiteServerUid`, `onsiteBaseUrl`, heartbeat age)
- `POST /cloud/platform/network/nodes/:id/rotate-token`
  - scoped by cloud account and tenant ownership
  - rotates node token securely and returns one-time `nodeToken`
  - use this only for recovery/re-pairing

## Reseller Remote Actions (no direct onsite login)
- `POST /cloud/platform/network/actions`
  - queue remote command to a specific node or all nodes in a store.
  - body:
    - `storeId`
    - optional `nodeId`
    - optional `targetAllNodes`
    - `action` one of:
      - `HEARTBEAT_NOW`
      - `SYNC_PULL`
      - `RUN_DIAGNOSTICS`
      - `RESTART_BACKEND`
      - `RESTART_AGENT`
      - `RELOAD_SETTINGS`
    - optional `note`, `parameters`
- `GET /cloud/platform/network/actions`
  - scoped query over remote actions
  - filters: `resellerId`, `tenantId`, `storeId`, `nodeId`, `status`, `action`, `limit`
- `POST /cloud/platform/network/actions/:id/retry`
  - re-queues failed/acked action back to `PENDING`
- `POST /cloud/platform/network/actions/:id/cancel`
  - cancels `PENDING` action (marks as failed with cancel code)

## Onsite Server Claim Workflow
This adds a unique server identifier + one-time claim pairing flow.

1. On onsite server (local network, authenticated in POS):
   - `GET /onsite/identity`
   - `POST /onsite/claim/create`
     - returns `serverUid`, `claimId`, `claimCode`, `expiresAt`
2. In cloud dashboard:
   - `POST /cloud/platform/onsite/claim`
   - body includes:
     - `onsiteBaseUrl`
     - `claimId`
     - `claimCode`
     - `tenantId` (or existing `storeId`)
     - optional store overrides (`storeName`, `storeCode`, `timezone`, `edgeBaseUrl`, `nodeLabel`)
3. Cloud verifies claim against onsite endpoint:
   - `/onsite/public/claim/consume`
4. Cloud creates/binds location + node (based on unique `serverUid`) and rotates node token.
5. Cloud finalizes onsite link:
   - `/onsite/public/claim/finalize`
   - persists cloud link details locally on the onsite server (`cloud_edge_link`).

## Onsite Heartbeat
- `POST /onsite/cloud/heartbeat` (authenticated onsite call)
  - pushes heartbeat to linked cloud node endpoint using saved node credentials.
- `GET /onsite/cloud/link`
  - returns current cloud link metadata for diagnostics.

## Seeded owner account
`backend/scripts/seed.ts` ensures owner account exists:
- email env: `CLOUD_OWNER_EMAIL` (default: `owner@websyspos.local`)
- password env: `CLOUD_OWNER_PASSWORD` (default: `WebsysOwner123!`)
- name env: `CLOUD_OWNER_NAME` (default: `Platform Owner`)

## Notes
- Existing `/cloud/stores` and `/cloud/sync` endpoints remain available for current workflows.
- New hierarchy routes are under `/cloud/platform/*`.
