const baseUrl = String(process.env.CLOUD_SMOKE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const pin = String(process.env.CLOUD_SMOKE_PIN || "1234").trim();
const tenantName = String(process.env.CLOUD_SMOKE_TENANT || "Smoke Tenant").trim();
const nodeLabel = String(process.env.CLOUD_SMOKE_NODE_LABEL || "Smoke Node").trim();
const settingKey = String(process.env.CLOUD_SMOKE_SETTING_KEY || "services").trim();
const settingValueRaw = process.env.CLOUD_SMOKE_SETTING_VALUE || '{"dineIn":true,"takeOut":true,"delivery":true}';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type LoginResponse = {
  token: string;
  user: { id: string; username: string };
};

type StoreResponse = {
  id: string;
  name: string;
  code: string;
};

type BootstrapResponse = {
  bootstrapToken: string;
};

type RegisterNodeResponse = {
  nodeId: string;
  nodeToken: string;
  nodeKey: string;
};

type RevisionPublishResponse = {
  revision: { id: string; revision: number; domain: string };
  command: { id: string; commandType: string };
};

type NodeCommandResponse = {
  commands: Array<{
    id: string;
    status: string;
    commandType: string;
    payload: JsonValue;
    revisionRef?: { revision: number } | null;
  }>;
};

type AckResponse = {
  id: string;
  status: string;
};

type CommandLogsResponse = {
  logs: Array<{
    status: string;
    createdAt: string;
  }>;
};

function uniqueCode(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}-${stamp}`;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...extraHeaders
    }
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      json && typeof json === "object" && !Array.isArray(json)
        ? String((json as Record<string, unknown>).message || response.statusText)
        : response.statusText;
    throw new Error(`${response.status} ${message}`);
  }

  return json as T;
}

async function main() {
  let settingValue: JsonValue;
  try {
    settingValue = JSON.parse(settingValueRaw) as JsonValue;
  } catch {
    throw new Error("CLOUD_SMOKE_SETTING_VALUE must be valid JSON");
  }

  const login = await requestJson<LoginResponse>("/auth/pin", {
    method: "POST",
    body: JSON.stringify({ pin })
  });

  const authHeaders = {
    Authorization: `Bearer ${login.token}`,
    "x-user-id": login.user.id
  };

  const storeCode = uniqueCode("SMOKE");
  const store = await requestJson<StoreResponse>(
    "/cloud/stores",
    {
      method: "POST",
      body: JSON.stringify({
        tenantName,
        storeName: `Smoke Store ${storeCode}`,
        storeCode,
        timezone: "America/Chicago"
      })
    },
    authHeaders
  );

  const bootstrap = await requestJson<BootstrapResponse>(
    `/cloud/stores/${encodeURIComponent(store.id)}/nodes/bootstrap`,
    {
      method: "POST",
      body: JSON.stringify({ label: nodeLabel, expiresInMinutes: 60 })
    },
    authHeaders
  );

  const registration = await requestJson<RegisterNodeResponse>(
    "/cloud/nodes/register",
    {
      method: "POST",
      body: JSON.stringify({
        storeId: store.id,
        bootstrapToken: bootstrap.bootstrapToken,
        label: nodeLabel,
        softwareVersion: "smoke-1"
      })
    }
  );

  const publish = await requestJson<RevisionPublishResponse>(
    `/cloud/stores/${encodeURIComponent(store.id)}/revisions`,
    {
      method: "POST",
      body: JSON.stringify({
        domain: "SETTINGS",
        commandType: "SETTINGS_PATCH",
        nodeId: registration.nodeId,
        payload: {
          key: settingKey,
          value: {
            ...(typeof settingValue === "object" && settingValue && !Array.isArray(settingValue)
              ? (settingValue as Record<string, JsonValue>)
              : { value: settingValue }),
            smokeStamp: new Date().toISOString()
          }
        }
      })
    },
    authHeaders
  );

  const nodeHeaders = {
    "x-node-id": registration.nodeId,
    "x-node-token": registration.nodeToken
  };

  const commands = await requestJson<NodeCommandResponse>(
    `/cloud/nodes/${encodeURIComponent(registration.nodeId)}/commands?status=PENDING&limit=20`,
    { method: "GET" },
    nodeHeaders
  );

  const pending = commands.commands.find((command) => command.id === publish.command.id);
  if (!pending) {
    throw new Error("Published command not visible in node queue.");
  }

  await requestJson<AckResponse>(
    `/cloud/commands/${encodeURIComponent(publish.command.id)}/ack`,
    {
      method: "POST",
      body: JSON.stringify({
        status: "FAILED",
        appliedRevision: publish.revision.revision,
        errorCode: "SMOKE_FAIL",
        errorDetail: "Simulated failure before retry"
      })
    },
    nodeHeaders
  );

  await requestJson(
    `/cloud/commands/${encodeURIComponent(publish.command.id)}/retry`,
    {
      method: "POST",
      body: JSON.stringify({})
    },
    authHeaders
  );

  const pendingAfterRetry = await requestJson<NodeCommandResponse>(
    `/cloud/nodes/${encodeURIComponent(registration.nodeId)}/commands?status=PENDING&limit=20`,
    { method: "GET" },
    nodeHeaders
  );

  const retried = pendingAfterRetry.commands.find((command) => command.id === publish.command.id);
  if (!retried) {
    throw new Error("Retried command not visible in PENDING queue.");
  }

  const ack = await requestJson<AckResponse>(
    `/cloud/commands/${encodeURIComponent(publish.command.id)}/ack`,
    {
      method: "POST",
      body: JSON.stringify({
        status: "ACKED",
        appliedRevision: publish.revision.revision,
        output: {
          smoke: true,
          appliedKeys: [settingKey]
        }
      })
    },
    nodeHeaders
  );

  const logs = await requestJson<CommandLogsResponse>(
    `/cloud/commands/${encodeURIComponent(publish.command.id)}/logs?limit=10`,
    { method: "GET" },
    authHeaders
  );

  const storeCommands = await requestJson<NodeCommandResponse>(
    `/cloud/stores/${encodeURIComponent(store.id)}/commands?status=ACKED,FAILED,PENDING&limit=20`,
    { method: "GET" },
    authHeaders
  );

  const resolved = storeCommands.commands.find((entry) => entry.id === publish.command.id);
  if (!resolved || resolved.status !== "ACKED") {
    throw new Error("Command is not ACKED after ack call.");
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        store: { id: store.id, code: store.code, name: store.name },
        node: { id: registration.nodeId, key: registration.nodeKey },
        revision: { id: publish.revision.id, revision: publish.revision.revision, domain: publish.revision.domain },
        command: { id: publish.command.id, type: publish.command.commandType, status: ack.status },
        logs: logs.logs.slice(0, 3)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Cloud smoke test failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
