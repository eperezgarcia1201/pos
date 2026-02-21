# Websys POS Web Rewrite

This is a clean web rewrite of the legacy desktop POS. It is designed for on‑prem deployment, offline operation (no internet required), and local hardware integration.

## Architecture
- Backend API: Node.js + TypeScript + Fastify + Prisma
- Frontend: React + TypeScript + Vite (PWA)
- Database: MySQL (local on-prem)
- Device Bridge: Local Node.js service for printers, drawers, scales, scanners, customer display, and card reader integrations
- Migration: import utilities to move data from the legacy Derby/MySQL databases into MySQL

## Modules in scope
- Orders, tables, menu editing
- Users/roles and permissions
- Reports
- Inventory
- Hardware integrations: receipt printer, cash drawer, barcode scanner, scale, customer display, card reader
- Payments: TSYS (integration to be implemented via their approved gateway/SDK)

## Folder layout
- backend/ — API, DB schema, auth, reporting
- frontend/ — UI and offline queue
- device-bridge/ — local hardware connectors (stubbed)
- migration/ — legacy DB import tools
- docs/ — architecture and deployment notes

## Quick start (development)
1. Ensure MySQL is running locally and credentials match your `.env`.
2. From `backend`, run `npm run db:bootstrap` to create `poselmer_web` (keeps legacy `poselmer` intact).
3. Run `npx prisma db push` to apply the schema.
4. Run `npm run db:seed` to load starter data.
5. Run the API and UI locally.

Detailed setup and deployment steps will live in docs/.

## Docker (recommended for persistent DB)
From `webapp/`:
1. `docker compose up --build`
2. Open the UI at `http://localhost:5173`
3. API runs at `http://localhost:8080`
4. MySQL is exposed on `localhost:3307` (port 3306 is often already in use locally)

The MySQL data is stored in a named volume (`poselmer-mysql`) so it will persist between restarts. Do not run `docker compose down -v` unless you want to wipe the database.
