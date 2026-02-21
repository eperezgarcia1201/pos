import { promises as fs } from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

type AgentConfig = {
  cloudApiUrl: string;
  edgeApiUrl: string;
  edgeRestartEndpoint: string;
  storeId: string;
  bootstrapToken: string;
  nodeId: string;
  nodeToken: string;
  nodeLabel: string;
  softwareVersion: string;
  pollIntervalMs: number;
  stateFile: string;
  edgeAuthBearer: string;
  edgeUserId: string;
  edgePin: string;
  edgeUsername: string;
  edgePassword: string;
};

type NodeRegistration = {
  nodeId: string;
  nodeToken: string;
  storeId: string;
  nodeKey: string;
};

type CloudCommand = {
  id: string;
  storeId: string;
  nodeId: string | null;
  domain: string;
  commandType: string;
  payload: unknown;
  status: string;
  issuedAt: string;
  revisionRef?: {
    id: string;
    domain: string;
    revision: number;
    createdAt: string;
  } | null;
};

type LoginResponse = {
  token: string;
  user: {
    id: string;
    username: string;
  };
};

type SettingsPatchItem = {
  key: string;
  value: unknown;
};

type RemoteActionCode =
  | "HEARTBEAT_NOW"
  | "SYNC_PULL"
  | "RUN_DIAGNOSTICS"
  | "RESTART_BACKEND"
  | "RESTART_AGENT"
  | "RELOAD_SETTINGS";

type RemoteActionPayload = {
  action: RemoteActionCode | string;
  parameters: Record<string, unknown>;
  note: string | null;
};

type ApplyResult = {
  output?: unknown;
  restartAgent?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(value: string, fallback = "") {
  const trimmed = (value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return fallback;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function toInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getConfig(): AgentConfig {
  return {
    cloudApiUrl: normalizeUrl(process.env.CLOUD_API_URL || "http://localhost:8080"),
    edgeApiUrl: normalizeUrl(process.env.EDGE_API_URL || "http://localhost:8080"),
    edgeRestartEndpoint: String(process.env.EDGE_RESTART_ENDPOINT || "").trim(),
    storeId: String(process.env.STORE_ID || "").trim(),
    bootstrapToken: String(process.env.BOOTSTRAP_TOKEN || "").trim(),
    nodeId: String(process.env.NODE_ID || "").trim(),
    nodeToken: String(process.env.NODE_TOKEN || "").trim(),
    nodeLabel: String(process.env.NODE_LABEL || "Store Edge Node").trim(),
    softwareVersion: String(process.env.SOFTWARE_VERSION || "0.1.0").trim(),
    pollIntervalMs: toInt(process.env.POLL_INTERVAL_MS, 5000),
    stateFile: String(process.env.AGENT_STATE_FILE || "./agent-state.json").trim(),
    edgeAuthBearer: String(process.env.EDGE_AUTH_BEARER || "").trim(),
    edgeUserId: String(process.env.EDGE_USER_ID || "").trim(),
    edgePin: String(process.env.EDGE_PIN || "").trim(),
    edgeUsername: String(process.env.EDGE_USERNAME || "").trim(),
    edgePassword: String(process.env.EDGE_PASSWORD || "").trim()
  };
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 12000
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    const isJson = (response.headers.get("content-type") || "").includes("application/json");
    const payload = isJson && text ? (JSON.parse(text) as unknown) : text;

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const maybe = payload as Record<string, unknown>;
        const detail = maybe.message || maybe.error;
        if (typeof detail === "string" && detail.trim().length > 0) {
          message = detail;
        }
      } else if (typeof payload === "string" && payload.trim().length > 0) {
        message = payload;
      }
      throw new Error(message);
    }

    return payload as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out calling ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function maybeJsonString(value: unknown) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function logInfo(message: string, details?: unknown) {
  const stamp = new Date().toISOString();
  if (typeof details === "undefined") {
    // eslint-disable-next-line no-console
    console.log(`[${stamp}] [store-agent] ${message}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[${stamp}] [store-agent] ${message}`, details);
  }
}

function logError(message: string, err: unknown) {
  const stamp = new Date().toISOString();
  const detail = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[${stamp}] [store-agent] ${message}: ${detail}`);
}

async function ensureDirForFile(filePath: string) {
  const dir = path.dirname(path.resolve(filePath));
  await fs.mkdir(dir, { recursive: true });
}

async function readStateFile(filePath: string) {
  try {
    const raw = await fs.readFile(path.resolve(filePath), "utf8");
    if (!raw.trim()) return {} as JsonRecord;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : ({} as JsonRecord);
  } catch {
    return {} as JsonRecord;
  }
}

async function writeStateFile(filePath: string, data: JsonRecord) {
  await ensureDirForFile(filePath);
  await fs.writeFile(path.resolve(filePath), JSON.stringify(data, null, 2), "utf8");
}

class EdgeAuthClient {
  private token: string | null = null;

  private userId: string | null = null;

  constructor(private readonly config: AgentConfig) {}

  private async login() {
    if (this.config.edgeAuthBearer) {
      this.token = this.config.edgeAuthBearer;
      this.userId = this.config.edgeUserId || null;
      return;
    }

    if (this.config.edgePin) {
      const result = await requestJson<LoginResponse>(`${this.config.edgeApiUrl}/auth/pin`, {
        method: "POST",
        body: JSON.stringify({ pin: this.config.edgePin })
      });
      this.token = result.token;
      this.userId = result.user?.id || null;
      return;
    }

    if (this.config.edgeUsername && this.config.edgePassword) {
      const result = await requestJson<LoginResponse>(`${this.config.edgeApiUrl}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ username: this.config.edgeUsername, password: this.config.edgePassword })
      });
      this.token = result.token;
      this.userId = result.user?.id || null;
      return;
    }

    this.token = null;
    this.userId = null;
  }

  async headers(forceRefresh = false) {
    if (forceRefresh || !this.token) {
      await this.login();
    }

    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.userId) headers["x-user-id"] = this.userId;
    return headers;
  }
}

function commandLooksLikeSettingsPatch(command: CloudCommand) {
  const type = (command.commandType || "").toUpperCase();
  const domain = (command.domain || "").toUpperCase();
  return type.endsWith("SETTINGS_PATCH") || type === "SETTINGS_PATCH" || domain === "SETTINGS";
}

function commandLooksLikeRemoteAction(command: CloudCommand) {
  const type = (command.commandType || "").toUpperCase();
  const domain = (command.domain || "").toUpperCase();
  return domain === "REMOTE_ACTION" || type.startsWith("REMOTE_ACTION_");
}

function parseRemoteAction(command: CloudCommand): RemoteActionPayload {
  const type = (command.commandType || "").toUpperCase();
  const inferredAction = type.startsWith("REMOTE_ACTION_")
    ? type.slice("REMOTE_ACTION_".length)
    : "";
  const payload = isRecord(command.payload) ? command.payload : {};
  const payloadAction = typeof payload.action === "string" ? payload.action.toUpperCase().trim() : "";
  const resolvedAction = payloadAction || inferredAction;
  if (!resolvedAction) {
    throw new Error("Remote action payload is missing action.");
  }
  return {
    action: resolvedAction,
    parameters: isRecord(payload.parameters) ? payload.parameters : {},
    note: typeof payload.note === "string" ? payload.note : null
  };
}

async function withEdgeAuth<T>(edgeAuth: EdgeAuthClient, fn: (headers: Record<string, string>) => Promise<T>) {
  let headers = await edgeAuth.headers();
  try {
    return await fn(headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lowered = message.toLowerCase();
    if (lowered.includes("access code required") || lowered.includes("unauthorized")) {
      headers = await edgeAuth.headers(true);
      return fn(headers);
    }
    throw err;
  }
}

function normalizeEdgePath(rawPath: string) {
  const trimmed = rawPath.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error("Restart endpoint must be a relative path, not a full URL.");
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function extractSettingsPatches(payload: unknown): SettingsPatchItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid SETTINGS_PATCH payload.");
  }
  const objectPayload = payload as Record<string, unknown>;

  const settings = objectPayload.settings;
  if (Array.isArray(settings)) {
    const patches = settings
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        key: String(entry.key || "").trim(),
        value: entry.value
      }))
      .filter((entry) => entry.key.length > 0);
    if (patches.length === 0) throw new Error("SETTINGS_PATCH settings array is empty.");
    return patches;
  }

  const key = String(objectPayload.key || "").trim();
  if (!key) {
    throw new Error("SETTINGS_PATCH payload must contain key or settings[].");
  }
  return [{ key, value: objectPayload.value }];
}

async function applySettingsPatch(command: CloudCommand, config: AgentConfig, edgeAuth: EdgeAuthClient) {
  const patches = extractSettingsPatches(command.payload);

  const applyOnce = async (headers: Record<string, string>) => {
    for (const patch of patches) {
      await requestJson(`${config.edgeApiUrl}/settings/${encodeURIComponent(patch.key)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ value: patch.value })
      });
    }
  };

  await withEdgeAuth(edgeAuth, applyOnce);

  return { patched: patches.map((entry) => entry.key) };
}

async function applyRemoteAction(
  command: CloudCommand,
  config: AgentConfig,
  edgeAuth: EdgeAuthClient,
  nodeId: string,
  nodeToken: string
): Promise<ApplyResult> {
  const action = parseRemoteAction(command);
  const actionCode = String(action.action || "").toUpperCase();

  if (actionCode === "HEARTBEAT_NOW") {
    await sendHeartbeat(config, nodeId, nodeToken);
    return {
      output: {
        action: actionCode,
        status: "HEARTBEAT_SENT",
        at: new Date().toISOString()
      }
    };
  }

  if (actionCode === "SYNC_PULL") {
    return {
      output: {
        action: actionCode,
        status: "SYNC_PULL_CONFIRMED",
        detail: "Agent polls continuously; next loop will pull any pending sync commands."
      }
    };
  }

  if (actionCode === "RUN_DIAGNOSTICS") {
    const now = new Date();
    const health = await requestJson<{ ok?: boolean }>(`${config.edgeApiUrl}/health`, {
      method: "GET"
    }).catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }));

    const identity = await withEdgeAuth(edgeAuth, async (headers) => {
      return requestJson(`${config.edgeApiUrl}/onsite/identity`, { method: "GET", headers });
    }).catch((err) => ({ error: err instanceof Error ? err.message : String(err) }));

    const storeSettings = await withEdgeAuth(edgeAuth, async (headers) => {
      return requestJson(`${config.edgeApiUrl}/settings/store`, { method: "GET", headers });
    }).catch((err) => ({ error: err instanceof Error ? err.message : String(err) }));

    return {
      output: {
        action: actionCode,
        generatedAt: now.toISOString(),
        process: {
          pid: process.pid,
          uptimeSeconds: Math.round(process.uptime()),
          memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024)
        },
        edge: {
          health: maybeJsonString(health),
          identity: maybeJsonString(identity),
          storeSettings: maybeJsonString(storeSettings)
        }
      }
    };
  }

  if (actionCode === "RELOAD_SETTINGS") {
    const keys = ["services", "store", "taxes", "print"];
    const checks: Record<string, unknown> = {};

    await withEdgeAuth(edgeAuth, async (headers) => {
      for (const key of keys) {
        try {
          checks[key] = await requestJson(`${config.edgeApiUrl}/settings/${encodeURIComponent(key)}`, {
            method: "GET",
            headers
          });
        } catch (err) {
          checks[key] = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      return true;
    });

    return {
      output: {
        action: actionCode,
        status: "SETTINGS_RELOADED",
        checkedKeys: keys,
        checks: maybeJsonString(checks)
      }
    };
  }

  if (actionCode === "RESTART_BACKEND") {
    const parameterEndpoint = typeof action.parameters.endpoint === "string" ? action.parameters.endpoint : "";
    const endpoint = normalizeEdgePath(parameterEndpoint || config.edgeRestartEndpoint);
    if (!endpoint) {
      throw new Error("RESTART_BACKEND requires parameters.endpoint or EDGE_RESTART_ENDPOINT.");
    }

    const requestBody = isRecord(action.parameters.body) ? action.parameters.body : {};
    const responsePayload = await withEdgeAuth(edgeAuth, async (headers) => {
      return requestJson(`${config.edgeApiUrl}${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
    });

    return {
      output: {
        action: actionCode,
        status: "BACKEND_RESTART_REQUESTED",
        endpoint,
        response: maybeJsonString(responsePayload)
      }
    };
  }

  if (actionCode === "RESTART_AGENT") {
    return {
      output: {
        action: actionCode,
        status: "AGENT_RESTART_REQUESTED",
        note: action.note
      },
      restartAgent: true
    };
  }

  throw new Error(`Unsupported remote action: ${actionCode}`);
}

async function applyCommand(
  command: CloudCommand,
  config: AgentConfig,
  edgeAuth: EdgeAuthClient,
  nodeId: string,
  nodeToken: string
): Promise<ApplyResult> {
  if (commandLooksLikeSettingsPatch(command)) {
    return { output: await applySettingsPatch(command, config, edgeAuth) };
  }
  if (commandLooksLikeRemoteAction(command)) {
    return applyRemoteAction(command, config, edgeAuth, nodeId, nodeToken);
  }
  throw new Error(`Unsupported command type: ${command.commandType}`);
}

async function registerNode(config: AgentConfig): Promise<NodeRegistration> {
  const payload = {
    storeId: config.storeId,
    bootstrapToken: config.bootstrapToken,
    label: config.nodeLabel,
    softwareVersion: config.softwareVersion,
    metadata: {
      agent: "websys-store-agent",
      startedAt: new Date().toISOString()
    }
  };

  return requestJson<NodeRegistration>(`${config.cloudApiUrl}/cloud/nodes/register`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function nodeHeaders(nodeId: string, nodeToken: string) {
  return {
    "x-node-id": nodeId,
    "x-node-token": nodeToken
  };
}

async function pollCommands(config: AgentConfig, nodeId: string, nodeToken: string) {
  const result = await requestJson<{ commands: CloudCommand[] }>(
    `${config.cloudApiUrl}/cloud/nodes/${encodeURIComponent(nodeId)}/commands?status=PENDING&limit=50`,
    {
      method: "GET",
      headers: nodeHeaders(nodeId, nodeToken)
    }
  );
  return Array.isArray(result.commands) ? result.commands : [];
}

async function sendAck(
  config: AgentConfig,
  nodeId: string,
  nodeToken: string,
  commandId: string,
  body: {
    status: "ACKED" | "FAILED";
    appliedRevision?: number;
    errorCode?: string;
    errorDetail?: string;
    output?: unknown;
  }
) {
  await requestJson(`${config.cloudApiUrl}/cloud/commands/${encodeURIComponent(commandId)}/ack`, {
    method: "POST",
    headers: nodeHeaders(nodeId, nodeToken),
    body: JSON.stringify(body)
  });
}

async function sendHeartbeat(config: AgentConfig, nodeId: string, nodeToken: string) {
  await requestJson(`${config.cloudApiUrl}/cloud/nodes/${encodeURIComponent(nodeId)}/heartbeat`, {
    method: "POST",
    headers: nodeHeaders(nodeId, nodeToken),
    body: JSON.stringify({ softwareVersion: config.softwareVersion })
  });
}

async function main() {
  const config = getConfig();
  logInfo("Starting agent", {
    cloudApiUrl: config.cloudApiUrl,
    edgeApiUrl: config.edgeApiUrl,
    pollIntervalMs: config.pollIntervalMs,
    stateFile: config.stateFile
  });

  const persisted = await readStateFile(config.stateFile);
  let nodeId = config.nodeId || String(persisted.nodeId || "");
  let nodeToken = config.nodeToken || String(persisted.nodeToken || "");
  let storeId = config.storeId || String(persisted.storeId || "");

  if (!nodeId || !nodeToken) {
    if (!config.storeId || !config.bootstrapToken) {
      throw new Error(
        "Node credentials are missing. Provide NODE_ID/NODE_TOKEN or STORE_ID/BOOTSTRAP_TOKEN."
      );
    }

    const registered = await registerNode(config);
    nodeId = registered.nodeId;
    nodeToken = registered.nodeToken;
    storeId = registered.storeId;

    await writeStateFile(config.stateFile, {
      nodeId,
      nodeToken,
      storeId,
      registeredAt: new Date().toISOString()
    });

    logInfo("Node registered", { nodeId, storeId, nodeKey: registered.nodeKey });
  }

  const edgeAuth = new EdgeAuthClient(config);
  let lastHeartbeatMs = 0;
  let restartAgentRequested = false;

  while (!restartAgentRequested) {
    try {
      const now = Date.now();
      if (now - lastHeartbeatMs > 30000) {
        await sendHeartbeat(config, nodeId, nodeToken);
        lastHeartbeatMs = now;
      }

      const commands = await pollCommands(config, nodeId, nodeToken);
      if (commands.length > 0) {
        logInfo(`Fetched ${commands.length} command(s).`);
      }

      for (const command of commands) {
        try {
          const applied = await applyCommand(command, config, edgeAuth, nodeId, nodeToken);

          await sendAck(config, nodeId, nodeToken, command.id, {
            status: "ACKED",
            appliedRevision: command.revisionRef?.revision,
            output: applied.output
          });
          logInfo(`ACKED command ${command.id}`, { commandType: command.commandType });

          if (applied.restartAgent) {
            restartAgentRequested = true;
            break;
          }
        } catch (err) {
          const errorDetail = err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000);
          await sendAck(config, nodeId, nodeToken, command.id, {
            status: "FAILED",
            appliedRevision: command.revisionRef?.revision,
            errorCode: "APPLY_ERROR",
            errorDetail
          });
          logError(`FAILED command ${command.id}`, err);
        }
      }
    } catch (err) {
      logError("Polling cycle failed", err);
    }

    if (restartAgentRequested) {
      break;
    }

    await sleep(config.pollIntervalMs);
  }

  if (restartAgentRequested) {
    logInfo("Restart action received. Exiting process so supervisor can restart the agent.");
    process.exit(0);
  }
}

main().catch((err) => {
  logError("Fatal startup failure", err);
  process.exit(1);
});
