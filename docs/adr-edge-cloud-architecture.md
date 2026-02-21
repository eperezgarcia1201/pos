# ADR: Edge + Cloud Control Plane

## Status
Accepted

## Context
Websys POS must support:
- Low-latency, offline-capable store operations on-site.
- Remote backoffice management without remote desktop access to store machines.
- Secure, auditable multi-store configuration distribution.

## Decision
Adopt a hybrid model:
1. **Edge runtime per store** for orders, kitchen, and payments.
2. **Cloud control plane** for multi-store configuration and command dispatch.
3. **Store agent** with outbound-only connectivity to cloud.

## Key choices
- Command/revision queue in cloud DB (`SyncRevision`, `SyncCommand`, `SyncCommandLog`).
- Per-node identity (`StoreNode`) with bootstrap enrollment (`StoreNodeBootstrapToken`).
- Agent pull model first (HTTP polling), websocket optional later.
- Apply remote changes through local backend APIs where possible.

## Security
- No inbound store port exposure required.
- Per-node token-based auth with hashed token persistence.
- Audit log entries for every command acknowledgement/failure.

## Consequences
- Strong operational resilience (store works while WAN is down).
- Added complexity: sync state, retries, and conflict resolution policy.
- Requires cloud + edge observability for support workflows.
