export type BilingualText = {
  en: string;
  es: string;
};

export type BilingualSection = {
  id: string;
  title: BilingualText;
  steps: BilingualText[];
};

export type ServerConnectionGuide = {
  id: "server-connection";
  title: BilingualText;
  summary: BilingualText;
  updatedAt: string;
  sections: BilingualSection[];
};

const baseSections: BilingualSection[] = [
  {
    id: "architecture",
    title: { en: "Architecture Target", es: "Arquitectura Objetivo" },
    steps: [
      {
        en: "Onsite store server runs MySQL, backend API, frontend UI, device bridge, and store-agent.",
        es: "El servidor local de tienda ejecuta MySQL, API backend, UI frontend, device bridge y store-agent."
      },
      {
        en: "Cloud server runs central backend + frontend backoffice + cloud database.",
        es: "El servidor cloud ejecuta backend central + frontend de backoffice + base de datos cloud."
      },
      {
        en: "Store-agent uses outbound sync to cloud `/cloud/*`; no inbound store port exposure required.",
        es: "Store-agent usa sincronizacion saliente a cloud `/cloud/*`; no se requiere exponer puertos entrantes en tienda."
      }
    ]
  },
  {
    id: "cloud-setup",
    title: { en: "Cloud Setup", es: "Configuracion Cloud" },
    steps: [
      {
        en: "Deploy backend from `webapp/backend` and configure `DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN`.",
        es: "Despliega backend desde `webapp/backend` y configura `DATABASE_URL`, `JWT_SECRET` y `CORS_ORIGIN`."
      },
      {
        en: "Run `npm install`, `npm run prisma:generate`, `npx prisma migrate deploy`, `npm run db:seed`, then start server.",
        es: "Ejecuta `npm install`, `npm run prisma:generate`, `npx prisma migrate deploy`, `npm run db:seed`, y luego inicia el servidor."
      },
      {
        en: "Deploy frontend from `webapp/frontend` and point it to cloud API host.",
        es: "Despliega frontend desde `webapp/frontend` y apuntalo al host de API cloud."
      },
      {
        en: "Validate cloud health endpoint before connecting stores.",
        es: "Valida el endpoint de salud cloud antes de conectar tiendas."
      }
    ]
  },
  {
    id: "onsite-setup",
    title: { en: "Onsite (Edge) Setup", es: "Configuracion En Sitio (Edge)" },
    steps: [
      {
        en: "Install Docker + Docker Compose on Raspberry Pi or onsite server.",
        es: "Instala Docker + Docker Compose en Raspberry Pi o servidor local."
      },
      {
        en: "Copy `webapp` and configure `.env` values for edge compose (`MYSQL_*`, `JWT_SECRET`, `CLOUD_API_URL`, and edge auth fields).",
        es: "Copia `webapp` y configura valores `.env` para compose edge (`MYSQL_*`, `JWT_SECRET`, `CLOUD_API_URL` y credenciales edge)."
      },
      {
        en: "Run `docker compose -f docker-compose.edge.yml --env-file .env up -d --build`.",
        es: "Ejecuta `docker compose -f docker-compose.edge.yml --env-file .env up -d --build`."
      },
      {
        en: "Validate onsite backend health from local network.",
        es: "Valida la salud del backend local desde la red interna."
      }
    ]
  },
  {
    id: "bootstrap",
    title: { en: "Store Bootstrap", es: "Bootstrap De Tienda" },
    steps: [
      {
        en: "On onsite server, open local settings and generate a claim package (`claimId` + `claimCode`) from `POST /onsite/claim/create`.",
        es: "En servidor local, abre settings local y genera paquete de claim (`claimId` + `claimCode`) desde `POST /onsite/claim/create`."
      },
      {
        en: "In cloud Back Office, open `Settings > Cloud Store Network` and run `Claim Onsite Server` using onsite URL + claim credentials.",
        es: "En Back Office cloud, abre `Settings > Cloud Store Network` y ejecuta `Claim Onsite Server` usando URL local + credenciales de claim."
      },
      {
        en: "Cloud creates/binds the store location and node from the unique onsite `serverUid` and finalizes link automatically.",
        es: "Cloud crea/vincula la ubicacion y nodo desde el `serverUid` unico del servidor local y finaliza el enlace automaticamente."
      },
      {
        en: "After claim, verify cloud link details on onsite identity endpoint, check node status in `Settings > Cloud Store Network`, and confirm commands in `Settings > Cloud Sync`.",
        es: "Despues del claim, verifica detalles de enlace cloud en endpoint de identidad local, revisa estado del nodo en `Settings > Cloud Store Network` y confirma comandos en `Settings > Cloud Sync`."
      }
    ]
  },
  {
    id: "validation",
    title: { en: "Validation", es: "Validacion" },
    steps: [
      {
        en: "Open `Settings > Cloud Sync`, publish a revision, and verify command transitions `PENDING -> ACKED`.",
        es: "Abre `Settings > Cloud Sync`, publica una revision y verifica transiciones `PENDING -> ACKED`."
      },
      {
        en: "If command fails, inspect command logs and use retry.",
        es: "Si un comando falla, revisa logs del comando y usa retry."
      },
      {
        en: "Run backend smoke command `npm run cloud:smoke` to validate register/publish/poll/retry/ack flow.",
        es: "Ejecuta `npm run cloud:smoke` en backend para validar el flujo register/publish/poll/retry/ack."
      }
    ]
  },
  {
    id: "operations",
    title: { en: "Operations & Security", es: "Operacion Y Seguridad" },
    steps: [
      {
        en: "Keep cloud endpoints under TLS and restrict cloud admin access.",
        es: "Mantén endpoints cloud bajo TLS y restringe acceso administrativo."
      },
      {
        en: "Do not expose onsite backend publicly; allow outbound traffic from store to cloud only.",
        es: "No expongas backend local a internet; permite solo salida desde tienda hacia cloud."
      },
      {
        en: "Rotate bootstrap/node secrets periodically and monitor node heartbeat status.",
        es: "Rota secretos bootstrap/nodo periodicamente y monitorea heartbeat de nodos."
      },
      {
        en: "Back up onsite DB and cloud DB on separate schedules.",
        es: "Respalda DB local y DB cloud en horarios separados."
      }
    ]
  }
];

const internalSections: BilingualSection[] = [
  {
    id: "internal-entry-links",
    title: { en: "Internal: Entry Links", es: "Interno: Links De Entrada" },
    steps: [
      {
        en: "Cloud/Backoffice UI: `http://<cloud-host>:5173/back-office`.",
        es: "UI Cloud/Backoffice: `http://<cloud-host>:5173/back-office`."
      },
      {
        en: "Dedicated network page: `http://<cloud-host>:5173/settings/cloud-network`.",
        es: "Pagina dedicada de red: `http://<cloud-host>:5173/settings/cloud-network`."
      },
      {
        en: "Cloud hierarchy page: `http://<cloud-host>:5173/settings/cloud-stores`.",
        es: "Pagina de jerarquia cloud: `http://<cloud-host>:5173/settings/cloud-stores`."
      },
      {
        en: "Direct hierarchy aliases: `http://<cloud-host>:5173/cloud/platform` or `/cloud/platform/hierarchy`.",
        es: "Aliases directos de jerarquia: `http://<cloud-host>:5173/cloud/platform` o `/cloud/platform/hierarchy`."
      },
      {
        en: "Direct network alias: `http://<cloud-host>:5173/cloud/platform/network` and sync alias `/cloud/platform/sync`.",
        es: "Alias directo de red: `http://<cloud-host>:5173/cloud/platform/network` y alias sync `/cloud/platform/sync`."
      },
      {
        en: "Cloud API health: `http://<cloud-api-host>:8080/health` and cloud login endpoint `POST /cloud/auth/login`.",
        es: "Salud API cloud: `http://<cloud-api-host>:8080/health` y endpoint de login cloud `POST /cloud/auth/login`."
      }
    ]
  },
  {
    id: "internal-owner-login",
    title: { en: "Internal: Cloud Owner Login", es: "Interno: Login Owner Cloud" },
    steps: [
      {
        en: "Use seeded owner account from backend seed: email default `owner@websyspos.local` and password default `WebsysOwner123!` unless overridden by env.",
        es: "Usa la cuenta owner sembrada por seed de backend: email por defecto `owner@websyspos.local` y password por defecto `WebsysOwner123!` salvo override por variables de entorno."
      },
      {
        en: "Env overrides: `CLOUD_OWNER_EMAIL`, `CLOUD_OWNER_PASSWORD`, `CLOUD_OWNER_NAME`.",
        es: "Overrides por env: `CLOUD_OWNER_EMAIL`, `CLOUD_OWNER_PASSWORD`, `CLOUD_OWNER_NAME`."
      },
      {
        en: "Create reseller accounts and tenant admin accounts from `Cloud Platform Hierarchy` once owner is authenticated.",
        es: "Crea cuentas reseller y tenant admin desde `Cloud Platform Hierarchy` una vez autenticado el owner."
      },
      {
        en: "If owner login fails because account is missing, run backend seed again: `cd webapp/backend && npm run db:seed`.",
        es: "Si falla login owner porque falta cuenta, corre seed backend otra vez: `cd webapp/backend && npm run db:seed`."
      }
    ]
  },
  {
    id: "internal-onsite-claim-flow",
    title: { en: "Internal: Onsite Claim Flow", es: "Interno: Flujo Claim En Sitio" },
    steps: [
      {
        en: "On onsite server UI open `Settings > Help > Server Connection`, generate claim package (`claimId`, `claimCode`).",
        es: "En UI local abre `Settings > Help > Server Connection`, genera paquete claim (`claimId`, `claimCode`)."
      },
      {
        en: "In cloud `Settings > Cloud Store Network`, run `Claim + Link` with `onsiteBaseUrl`, claim id, claim code, and tenant.",
        es: "En cloud `Settings > Cloud Store Network`, ejecuta `Claim + Link` con `onsiteBaseUrl`, claim id, claim code y tenant."
      },
      {
        en: "Cloud creates/updates store node key `ONSITE-<serverUid>` and returns node token to finalize pairing.",
        es: "Cloud crea/actualiza node key `ONSITE-<serverUid>` y regresa node token para finalizar el enlace."
      },
      {
        en: "Onsite stores cloud link and uses token for `/onsite/cloud/heartbeat` plus automatic heartbeat worker.",
        es: "Servidor local guarda cloud link y usa token para `/onsite/cloud/heartbeat` mas worker automatico de heartbeat."
      }
    ]
  },
  {
    id: "internal-operations-checklist",
    title: { en: "Internal: Ops Checklist", es: "Interno: Checklist Operativo" },
    steps: [
      {
        en: "Use `Settings > Cloud Store Network > Reseller Remote Actions` to queue heartbeat, sync, diagnostics, and restart actions per store/node.",
        es: "Usa `Settings > Cloud Store Network > Reseller Remote Actions` para encolar acciones de heartbeat, sync, diagnostico y reinicio por tienda/nodo."
      },
      {
        en: "In cloud network view, verify node status: ONLINE/STALE/OFFLINE and heartbeat age.",
        es: "En vista cloud network, valida estado de nodos: ONLINE/STALE/OFFLINE y antiguedad de heartbeat."
      },
      {
        en: "Use `Rotate Token` only for recovery; after rotation, update onsite link credentials before next heartbeat.",
        es: "Usa `Rotate Token` solo para recuperacion; despues de rotar, actualiza credenciales de enlace local antes del siguiente heartbeat."
      },
      {
        en: "Keep `EXPOSE_INTERNAL_HELP=0` in production to hide this temporary implementation section.",
        es: "Mantén `EXPOSE_INTERNAL_HELP=0` en produccion para ocultar esta seccion temporal de implementacion."
      }
    ]
  }
];

export function buildServerConnectionGuide(options?: { includeInternal?: boolean }): ServerConnectionGuide {
  return {
    id: "server-connection",
    title: {
      en: "Onsite Server + Cloud System",
      es: "Servidor En Sitio + Sistema Cloud"
    },
    summary: {
      en: "Step-by-step deployment and connection guide for edge store runtime with centralized cloud backoffice.",
      es: "Guia paso a paso para desplegar y conectar el runtime local de tienda con backoffice centralizado en cloud."
    },
    updatedAt: "2026-02-21",
    sections: options?.includeInternal ? [...baseSections, ...internalSections] : baseSections
  };
}

export const serverConnectionGuide: ServerConnectionGuide = {
  id: "server-connection",
  title: {
    en: "Onsite Server + Cloud System",
    es: "Servidor En Sitio + Sistema Cloud"
  },
  summary: {
    en: "Step-by-step deployment and connection guide for edge store runtime with centralized cloud backoffice.",
    es: "Guia paso a paso para desplegar y conectar el runtime local de tienda con backoffice centralizado en cloud."
  },
  updatedAt: "2026-02-21",
  sections: baseSections
};
