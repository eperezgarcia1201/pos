# On‑prem deployment

## Recommended topology
- One server per location (POS server + Postgres + device bridge).
- Multiple terminals access the web UI from the local server.
- Optional upstream sync to a cloud backup (future phase).

## Components
- `backend`: REST API + auth + reporting
- `frontend`: static build served by a local web server (or bundled into the backend)
- `device-bridge`: local service that talks to printers/scales/drawers/card readers
- `postgres`: local database

## Containerized option (future)
A `docker-compose.yml` can run all services on a single host. For now we keep it simple to allow direct local installs.
