import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import CloudPortalPreferenceControls from "../components/CloudPortalPreferenceControls";
import { useCloudPortalUi } from "../lib/cloudPortalUi";

type CloudAccountType = "OWNER" | "RESELLER" | "TENANT_ADMIN";
type NodeHealth = "ONLINE" | "STALE" | "OFFLINE";

type CloudAccount = {
  id: string;
  email: string;
  displayName?: string | null;
  accountType: CloudAccountType;
  status: string;
  resellerId?: string | null;
  tenantId?: string | null;
  reseller?: { id: string; name: string; code: string } | null;
  tenant?: { id: string; name: string; slug: string } | null;
};

type CloudSession = {
  token: string;
  account: CloudAccount;
};

type Reseller = {
  id: string;
  name: string;
  code: string;
};

type Tenant = {
  id: string;
  name: string;
  slug: string;
  reseller?: { id: string; name: string; code: string } | null;
};

type NetworkNode = {
  id: string;
  label: string;
  nodeKey: string;
  status: NodeHealth;
  rawStatus: string;
  softwareVersion?: string | null;
  onsiteServerUid?: string | null;
  onsiteBaseUrl?: string | null;
  heartbeatAgeSeconds?: number | null;
  lastSeenAt?: string | null;
  updatedAt?: string | null;
};

type NetworkStore = {
  id: string;
  name: string;
  code: string;
  status: string;
  timezone: string;
  edgeBaseUrl?: string | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    resellerId?: string | null;
    reseller?: { id: string; name: string; code: string } | null;
  };
  linkedServerUids?: string[];
  nodeCount: number;
  nodes: NetworkNode[];
  updatedAt?: string;
};

type NetworkSummary = {
  storesTotal: number;
  storesLinked: number;
  nodesTotal: number;
  nodesOnline: number;
  nodesStale: number;
  nodesOffline: number;
};

type NetworkResponse = {
  summary: NetworkSummary;
  stores: NetworkStore[];
};

type OnsiteClaimDraft = {
  onsiteBaseUrl: string;
  claimId: string;
  claimCode: string;
  tenantId: string;
  storeName: string;
  storeCode: string;
  timezone: string;
  edgeBaseUrl: string;
  cloudBaseUrl: string;
  nodeLabel: string;
};

type OnsiteClaimResult = {
  store?: { id: string; name: string; code: string };
  node?: { id: string; nodeKey: string; nodeToken?: string };
  onsite?: {
    serverUid?: string;
    serverLabel?: string | null;
    finalized?: boolean;
    finalizeError?: string | null;
  };
};

type RemoteActionCode =
  | "HEARTBEAT_NOW"
  | "SYNC_PULL"
  | "RUN_DIAGNOSTICS"
  | "RESTART_BACKEND"
  | "RESTART_AGENT"
  | "RELOAD_SETTINGS";

type RemoteActionRecord = {
  id: string;
  storeId: string;
  nodeId?: string | null;
  status: string;
  domain: string;
  commandType: string;
  payload?: unknown;
  errorCode?: string | null;
  errorDetail?: string | null;
  issuedAt: string;
  acknowledgedAt?: string | null;
  action?: string | null;
  _count?: { logs?: number };
  node?: { id: string; label: string; nodeKey: string } | null;
  store?: {
    id: string;
    name: string;
    code: string;
    tenant?: {
      id: string;
      name: string;
      slug: string;
      reseller?: { id: string; name: string; code: string } | null;
    } | null;
  } | null;
};

type RemoteActionDraft = {
  storeId: string;
  nodeId: string;
  targetAllNodes: boolean;
  action: RemoteActionCode;
  note: string;
  parametersJson: string;
};

type StoreImpersonationLinkResponse = {
  url: string;
  targetBaseUrl: string;
  expiresInSeconds: number;
};

const CLOUD_SESSION_STORAGE_KEY = "pos_cloud_platform_session";

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    const message = error.message.trim();
    const lower = message.toLowerCase();
    if (lower.includes("failed to fetch")) {
      return "Cannot reach Cloud API. Make sure backend is running on http://localhost:8080.";
    }
    if (lower.includes("onsite server did not respond in time") || lower.includes("cloud cannot reach this onsite url")) {
      return "Cloud server cannot reach your onsite URL. Use a public URL, VPN, or tunnel from cloud to onsite server.";
    }
    if (lower.includes("crypto.randomuuid is not a function")) {
      return "Onsite server is running an old backend build. Pull latest code on onsite server and restart backend.";
    }
    return message;
  }
  return fallback;
}

function loadCloudSession(): CloudSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(CLOUD_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CloudSession>;
    if (!parsed.token || !parsed.account) return null;
    return {
      token: String(parsed.token),
      account: parsed.account as CloudAccount
    };
  } catch {
    return null;
  }
}

function saveCloudSession(session: CloudSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    localStorage.removeItem(CLOUD_SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(CLOUD_SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function cloudApiFetch<T>(cloudToken: string, path: string, options: RequestInit = {}) {
  const headerMap: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${cloudToken}`
  };
  return (await apiFetch(path, {
    ...options,
    headers: headerMap
  })) as T;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function formatAge(seconds?: number | null) {
  if (seconds == null) return "-";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function resolveBackOfficeBaseUrl(rawBaseUrl: string | null | undefined) {
  const source = String(rawBaseUrl || "").trim();
  if (!source) return null;
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }

  // Local/dev default: backend is often 8080 while UI runs on 5173.
  if (parsed.port === "8080") {
    const uiUrl = new URL(parsed.toString());
    uiUrl.port = "5173";
    uiUrl.pathname = "/";
    uiUrl.search = "";
    uiUrl.hash = "";
    return uiUrl.toString().replace(/\/+$/, "");
  }

  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

export default function CloudStoreNetwork() {
  const navigate = useNavigate();
  const { tx } = useCloudPortalUi();
  const [sessionBooting, setSessionBooting] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [dispatchingAction, setDispatchingAction] = useState(false);
  const [rotatingNodeId, setRotatingNodeId] = useState("");
  const [retryingActionId, setRetryingActionId] = useState("");
  const [cancellingActionId, setCancellingActionId] = useState("");

  const [cloudToken, setCloudToken] = useState("");
  const [cloudAccount, setCloudAccount] = useState<CloudAccount | null>(null);

  const [loginEmail, setLoginEmail] = useState("owner@websyspos.local");
  const [loginPassword, setLoginPassword] = useState("");

  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [summary, setSummary] = useState<NetworkSummary>({
    storesTotal: 0,
    storesLinked: 0,
    nodesTotal: 0,
    nodesOnline: 0,
    nodesStale: 0,
    nodesOffline: 0
  });
  const [stores, setStores] = useState<NetworkStore[]>([]);

  const [filterResellerId, setFilterResellerId] = useState("");
  const [filterTenantId, setFilterTenantId] = useState("");
  const [filterNodeStatus, setFilterNodeStatus] = useState<NodeHealth | "">("");
  const [includeUnlinked, setIncludeUnlinked] = useState(true);

  const [claimDraft, setClaimDraft] = useState<OnsiteClaimDraft>({
    onsiteBaseUrl: "http://192.168.1.50:8080",
    claimId: "",
    claimCode: "",
    tenantId: "",
    storeName: "",
    storeCode: "",
    timezone: "America/Chicago",
    edgeBaseUrl: "",
    cloudBaseUrl: "",
    nodeLabel: "Onsite Store Server"
  });
  const [claimResult, setClaimResult] = useState<OnsiteClaimResult | null>(null);
  const [rotatedNodeToken, setRotatedNodeToken] = useState<{ nodeKey: string; token: string } | null>(null);
  const [remoteActions, setRemoteActions] = useState<RemoteActionRecord[]>([]);
  const [actionStatusFilter, setActionStatusFilter] = useState("PENDING,FAILED,ACKED");
  const [remoteActionDraft, setRemoteActionDraft] = useState<RemoteActionDraft>({
    storeId: "",
    nodeId: "",
    targetAllNodes: false,
    action: "HEARTBEAT_NOW",
    note: "",
    parametersJson: "{}"
  });

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const flattenedRows = useMemo(
    () =>
      stores.flatMap((store) =>
        store.nodes.map((node) => ({
          store,
          node
        }))
      ),
    [stores]
  );

  const unlinkedStores = useMemo(() => stores.filter((store) => store.nodes.length === 0), [stores]);
  const actionableStores = useMemo(() => stores.filter((store) => store.nodes.length > 0), [stores]);
  const dispatchStore = useMemo(
    () => stores.find((store) => store.id === remoteActionDraft.storeId) || null,
    [stores, remoteActionDraft.storeId]
  );
  const remoteActionNeedsParameters = remoteActionDraft.action === "RESTART_BACKEND";

  const refreshData = useCallback(async () => {
    if (!cloudToken || !cloudAccount) return;

    setLoading(true);
    setError(null);

    try {
      const tenantParams = new URLSearchParams();
      if (cloudAccount.accountType === "OWNER" && filterResellerId) {
        tenantParams.set("resellerId", filterResellerId);
      }
      const tenantPath =
        tenantParams.size > 0
          ? `/cloud/platform/tenants?${tenantParams.toString()}`
          : "/cloud/platform/tenants";

      const networkParams = new URLSearchParams();
      if (cloudAccount.accountType === "OWNER" && filterResellerId) {
        networkParams.set("resellerId", filterResellerId);
      }
      if (filterTenantId) {
        networkParams.set("tenantId", filterTenantId);
      }
      if (filterNodeStatus) {
        networkParams.set("nodeStatus", filterNodeStatus);
      }
      networkParams.set("includeUnlinked", String(includeUnlinked));

      const networkPath = `/cloud/platform/network?${networkParams.toString()}`;
      const actionParams = new URLSearchParams();
      if (cloudAccount.accountType === "OWNER" && filterResellerId) {
        actionParams.set("resellerId", filterResellerId);
      }
      if (filterTenantId) {
        actionParams.set("tenantId", filterTenantId);
      }
      if (actionStatusFilter.trim()) {
        actionParams.set("status", actionStatusFilter.trim());
      }
      actionParams.set("limit", "120");
      const actionPath = `/cloud/platform/network/actions?${actionParams.toString()}`;

      const resellerPromise =
        cloudAccount.accountType === "TENANT_ADMIN"
          ? Promise.resolve({ resellers: [] as Reseller[] })
          : cloudApiFetch<{ resellers: Reseller[] }>(cloudToken, "/cloud/platform/resellers");

      const [resellerResult, tenantResult, networkResult, actionResult] = await Promise.all([
        resellerPromise,
        cloudApiFetch<{ tenants: Tenant[] }>(cloudToken, tenantPath),
        cloudApiFetch<NetworkResponse>(cloudToken, networkPath),
        cloudApiFetch<{ actions: RemoteActionRecord[] }>(cloudToken, actionPath)
      ]);

      setResellers(Array.isArray(resellerResult.resellers) ? resellerResult.resellers : []);
      setTenants(Array.isArray(tenantResult.tenants) ? tenantResult.tenants : []);
      setSummary(networkResult.summary);
      setStores(Array.isArray(networkResult.stores) ? networkResult.stores : []);
      setRemoteActions(Array.isArray(actionResult.actions) ? actionResult.actions : []);
    } catch (err) {
      setError(toErrorMessage(err, "Unable to load cloud store network."));
    } finally {
      setLoading(false);
    }
  }, [actionStatusFilter, cloudAccount, cloudToken, filterNodeStatus, filterResellerId, filterTenantId, includeUnlinked]);

  useEffect(() => {
    const restore = async () => {
      const session = loadCloudSession();
      if (!session) {
        setSessionBooting(false);
        return;
      }

      setCloudToken(session.token);
      setCloudAccount(session.account);

      try {
        const me = await cloudApiFetch<{ account: CloudAccount }>(session.token, "/cloud/auth/me");
        setCloudAccount(me.account);
        saveCloudSession({ token: session.token, account: me.account });
      } catch {
        saveCloudSession(null);
        setCloudToken("");
        setCloudAccount(null);
      } finally {
        setSessionBooting(false);
      }
    };

    void restore();
  }, []);

  useEffect(() => {
    if (!cloudAccount || cloudAccount.accountType !== "RESELLER" || !cloudAccount.resellerId) return;
    if (filterResellerId !== cloudAccount.resellerId) {
      setFilterResellerId(cloudAccount.resellerId);
    }
  }, [cloudAccount, filterResellerId]);

  useEffect(() => {
    if (!cloudAccount || cloudAccount.accountType !== "TENANT_ADMIN" || !cloudAccount.tenantId) return;
    if (filterTenantId !== cloudAccount.tenantId) {
      setFilterTenantId(cloudAccount.tenantId);
    }
    setClaimDraft((prev) => (prev.tenantId === cloudAccount.tenantId ? prev : { ...prev, tenantId: cloudAccount.tenantId || "" }));
  }, [cloudAccount, filterTenantId]);

  useEffect(() => {
    if (tenants.length === 0) {
      if (filterTenantId) setFilterTenantId("");
      setClaimDraft((prev) => (prev.tenantId ? { ...prev, tenantId: "" } : prev));
      return;
    }

    if (filterTenantId && !tenants.some((tenant) => tenant.id === filterTenantId)) {
      setFilterTenantId("");
    }
    setClaimDraft((prev) =>
      tenants.some((tenant) => tenant.id === prev.tenantId) ? prev : { ...prev, tenantId: tenants[0].id }
    );
  }, [filterTenantId, tenants]);

  useEffect(() => {
    if (actionableStores.length === 0) {
      setRemoteActionDraft((prev) =>
        prev.storeId || prev.nodeId ? { ...prev, storeId: "", nodeId: "", targetAllNodes: false } : prev
      );
      return;
    }

    setRemoteActionDraft((prev) => {
      const storeStillValid = actionableStores.some((store) => store.id === prev.storeId);
      const nextStoreId = storeStillValid ? prev.storeId : actionableStores[0].id;
      const selectedStore = actionableStores.find((store) => store.id === nextStoreId) || null;
      const nodeStillValid = Boolean(selectedStore?.nodes.some((node) => node.id === prev.nodeId));
      const nextNodeId = prev.targetAllNodes ? "" : nodeStillValid ? prev.nodeId : selectedStore?.nodes[0]?.id || "";
      return {
        ...prev,
        storeId: nextStoreId,
        nodeId: nextNodeId
      };
    });
  }, [actionableStores]);

  useEffect(() => {
    if (sessionBooting || !cloudToken || !cloudAccount) return;
    void refreshData();
  }, [sessionBooting, cloudAccount, cloudToken, refreshData]);

  const signIn = async () => {
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword.trim();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setAuthLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = (await apiFetch("/cloud/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      })) as { token: string; account: CloudAccount };

      setCloudToken(result.token);
      setCloudAccount(result.account);
      saveCloudSession({ token: result.token, account: result.account });
      setLoginPassword("");
      setMessage(`Signed in as ${result.account.displayName || result.account.email}.`);
    } catch (err) {
      setError(toErrorMessage(err, "Unable to sign in."));
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = () => {
    saveCloudSession(null);
    setCloudToken("");
    setCloudAccount(null);
    setResellers([]);
    setTenants([]);
    setStores([]);
    setRemoteActions([]);
    setSummary({
      storesTotal: 0,
      storesLinked: 0,
      nodesTotal: 0,
      nodesOnline: 0,
      nodesStale: 0,
      nodesOffline: 0
    });
    setFilterResellerId("");
    setFilterTenantId("");
    setFilterNodeStatus("");
    setActionStatusFilter("PENDING,FAILED,ACKED");
    setRotatedNodeToken(null);
    setMessage("Cloud session closed.");
    setError(null);
  };

  const claimOnsiteServer = async () => {
    if (!cloudToken) return;
    const onsiteBaseUrl = claimDraft.onsiteBaseUrl.trim();
    const claimId = claimDraft.claimId.trim();
    const claimCode = claimDraft.claimCode.trim();
    const tenantId = claimDraft.tenantId;

    if (!onsiteBaseUrl || !claimId || !claimCode || !tenantId) {
      setError("Onsite URL, claim id, claim code, and tenant are required.");
      return;
    }

    setClaiming(true);
    setError(null);
    setMessage(null);
    setClaimResult(null);

    try {
      const result = await cloudApiFetch<OnsiteClaimResult>(cloudToken, "/cloud/platform/onsite/claim", {
        method: "POST",
        body: JSON.stringify({
          onsiteBaseUrl,
          claimId,
          claimCode,
          tenantId,
          storeName: claimDraft.storeName.trim() || undefined,
          storeCode: claimDraft.storeCode.trim() || undefined,
          timezone: claimDraft.timezone.trim() || undefined,
          edgeBaseUrl: claimDraft.edgeBaseUrl.trim() || undefined,
          cloudBaseUrl: claimDraft.cloudBaseUrl.trim() || undefined,
          nodeLabel: claimDraft.nodeLabel.trim() || undefined
        })
      });

      setClaimResult(result);
      setClaimDraft((prev) => ({
        ...prev,
        claimId: "",
        claimCode: "",
        storeName: "",
        storeCode: ""
      }));
      setMessage("Onsite server linked successfully.");
      await refreshData();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to claim onsite server."));
    } finally {
      setClaiming(false);
    }
  };

  const rotateNodeToken = async (nodeId: string, nodeKey: string) => {
    if (!cloudToken) return;
    setRotatingNodeId(nodeId);
    setError(null);
    setMessage(null);
    setRotatedNodeToken(null);

    try {
      const result = await cloudApiFetch<{ nodeToken: string }>(cloudToken, `/cloud/platform/network/nodes/${encodeURIComponent(nodeId)}/rotate-token`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setRotatedNodeToken({ nodeKey, token: result.nodeToken });
      setMessage(`Node token rotated for ${nodeKey}. Update onsite link if needed.`);
      await refreshData();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to rotate node token."));
    } finally {
      setRotatingNodeId("");
    }
  };

  const dispatchRemoteAction = async (override?: Partial<RemoteActionDraft>) => {
    if (!cloudToken) return;

    const draft: RemoteActionDraft = {
      ...remoteActionDraft,
      ...override
    };

    const storeId = draft.storeId;
    if (!storeId) {
      setError("Select a store for the remote action.");
      return;
    }

    let parsedParameters: unknown = {};
    const trimmedParameters = draft.parametersJson.trim();
    if (trimmedParameters) {
      try {
        parsedParameters = JSON.parse(trimmedParameters);
      } catch {
        setError("Parameters JSON is invalid.");
        return;
      }
    }

    if (!draft.targetAllNodes && !draft.nodeId) {
      setError("Select a target node, or enable all nodes.");
      return;
    }

    setDispatchingAction(true);
    setError(null);
    setMessage(null);

    try {
      await cloudApiFetch(cloudToken, "/cloud/platform/network/actions", {
        method: "POST",
        body: JSON.stringify({
          storeId,
          nodeId: draft.targetAllNodes ? undefined : draft.nodeId || undefined,
          targetAllNodes: draft.targetAllNodes,
          action: draft.action,
          note: draft.note.trim() || undefined,
          parameters: parsedParameters
        })
      });

      setRemoteActionDraft((prev) => ({
        ...prev,
        note: override ? prev.note : "",
        parametersJson: override ? prev.parametersJson : "{}"
      }));
      setMessage(`Remote action ${draft.action} queued.`);
      await refreshData();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to queue remote action."));
    } finally {
      setDispatchingAction(false);
    }
  };

  const retryRemoteAction = async (actionId: string) => {
    if (!cloudToken) return;
    setRetryingActionId(actionId);
    setError(null);
    setMessage(null);
    try {
      await cloudApiFetch(cloudToken, `/cloud/platform/network/actions/${encodeURIComponent(actionId)}/retry`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage("Remote action queued again.");
      await refreshData();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to retry remote action."));
    } finally {
      setRetryingActionId("");
    }
  };

  const cancelRemoteAction = async (actionId: string) => {
    if (!cloudToken) return;
    setCancellingActionId(actionId);
    setError(null);
    setMessage(null);
    try {
      await cloudApiFetch(cloudToken, `/cloud/platform/network/actions/${encodeURIComponent(actionId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage("Remote action cancelled.");
      await refreshData();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to cancel remote action."));
    } finally {
      setCancellingActionId("");
    }
  };

  const quickDispatch = async (
    storeId: string,
    nodeId: string,
    action: RemoteActionCode,
    note: string,
    parametersJson = "{}"
  ) => {
    await dispatchRemoteAction({
      storeId,
      nodeId,
      targetAllNodes: false,
      action,
      note,
      parametersJson
    });
  };

  const copyRotatedToken = async () => {
    if (!rotatedNodeToken?.token || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(rotatedNodeToken.token);
    setMessage(`Copied token for ${rotatedNodeToken.nodeKey}.`);
  };

  const openCustomerBackOffice = async (store: NetworkStore, node: NetworkNode) => {
    if (!cloudToken) {
      setError("Sign in to cloud first.");
      return;
    }

    const targetBaseUrl = resolveBackOfficeBaseUrl(node.onsiteBaseUrl || store.edgeBaseUrl || "");
    if (!targetBaseUrl) {
      setError("Customer Back Office URL is missing or invalid for this store/node.");
      return;
    }

    setError(null);
    setMessage(null);
    try {
      const result = await cloudApiFetch<StoreImpersonationLinkResponse>(
        cloudToken,
        `/cloud/platform/stores/${encodeURIComponent(store.id)}/impersonation-link`,
        {
          method: "POST",
          body: JSON.stringify({ targetBaseUrl })
        }
      );
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(toErrorMessage(err, "Unable to open customer back office."));
    }
  };

  return (
    <div className="screen-shell cloud-platform-shell cloud-network-shell">
      <header className="screen-header cloud-platform-topbar">
        <div>
          <h2>{tx("Cloud Store Network", "Red de tiendas cloud")}</h2>
          <p>
            {tx(
              "Dedicated onsite server map for owner, reseller, and tenant operations.",
              "Mapa dedicado de servidores onsite para operaciones de owner, revendedor e inquilino."
            )}
          </p>
        </div>
        <div className="terminal-actions">
          <CloudPortalPreferenceControls />
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-stores")}>
            {tx("Hierarchy", "Jerarquia")}
          </button>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-sync")}>
            {tx("Sync Console", "Consola de sincronizacion")}
          </button>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/back-office")}>
            {tx("Back Office", "Back Office")}
          </button>
          {cloudAccount ? (
            <>
              <button type="button" className="terminal-btn" onClick={signOut}>
                {tx("Sign Out Cloud", "Cerrar sesion cloud")}
              </button>
              <button type="button" className="terminal-btn primary" onClick={() => void refreshData()} disabled={loading}>
                {loading ? tx("Refreshing...", "Actualizando...") : tx("Refresh", "Actualizar")}
              </button>
            </>
          ) : null}
        </div>
      </header>

      {sessionBooting ? (
        <section className="panel cloud-platform-auth">
          <h3>{tx("Loading Cloud Session", "Cargando sesion cloud")}</h3>
          <p className="hint">{tx("Checking existing cloud credentials...", "Verificando credenciales cloud...")}</p>
        </section>
      ) : null}

      {!sessionBooting && !cloudAccount ? (
        <section className="panel cloud-platform-auth">
          <h3>{tx("Cloud Login", "Login cloud")}</h3>
          <p className="hint">{tx("Sign in to access store network controls.", "Inicia sesion para acceder a los controles de red de tiendas.")}</p>
          <div className="cloud-platform-form-grid" style={{ marginTop: 10 }}>
            <label>
              {tx("Email", "Correo")}
              <input
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="owner@websyspos.local"
              />
            </label>
            <label>
              {tx("Password", "Contrasena")}
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder={tx("Enter password", "Ingresa contrasena")}
              />
            </label>
          </div>
          <div className="cloud-platform-inline-actions" style={{ marginTop: 12 }}>
            <button type="button" className="terminal-btn primary" onClick={() => void signIn()} disabled={authLoading}>
              {authLoading ? tx("Signing In...", "Entrando...") : tx("Sign In", "Entrar")}
            </button>
          </div>
        </section>
      ) : null}

      {!sessionBooting && cloudAccount ? (
        <div className="screen-grid cloud-network-grid">
          <section className="panel cloud-network-summary-panel">
            <h3>{tx("Network Scope", "Alcance de red")}</h3>
            <div className="cloud-network-summary">
              <article className="cloud-network-chip">
                <strong>{summary.storesTotal}</strong>
                <span>{tx("Stores", "Tiendas")}</span>
              </article>
              <article className="cloud-network-chip">
                <strong>{summary.storesLinked}</strong>
                <span>{tx("Linked Stores", "Tiendas enlazadas")}</span>
              </article>
              <article className="cloud-network-chip">
                <strong>{summary.nodesOnline}</strong>
                <span>{tx("Online Nodes", "Nodos en linea")}</span>
              </article>
              <article className="cloud-network-chip">
                <strong>{summary.nodesStale}</strong>
                <span>{tx("Stale Nodes", "Nodos atrasados")}</span>
              </article>
              <article className="cloud-network-chip">
                <strong>{summary.nodesOffline}</strong>
                <span>{tx("Offline Nodes", "Nodos fuera de linea")}</span>
              </article>
            </div>

            <div className="cloud-platform-filter-row">
              {cloudAccount.accountType === "OWNER" ? (
                <label>
                  {tx("Reseller", "Revendedor")}
                  <select value={filterResellerId} onChange={(event) => setFilterResellerId(event.target.value)}>
                    <option value="">{tx("All resellers", "Todos los revendedores")}</option>
                    {resellers.map((reseller) => (
                      <option key={reseller.id} value={reseller.id}>
                        {reseller.name} ({reseller.code})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label>
                {tx("Tenant", "Inquilino")}
                <select value={filterTenantId} onChange={(event) => setFilterTenantId(event.target.value)}>
                  <option value="">{tx("All tenants", "Todos los inquilinos")}</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {tx("Node Status", "Estado del nodo")}
                <select value={filterNodeStatus} onChange={(event) => setFilterNodeStatus(event.target.value as NodeHealth | "")}>
                  <option value="">{tx("All nodes", "Todos los nodos")}</option>
                  <option value="ONLINE">ONLINE</option>
                  <option value="STALE">STALE</option>
                  <option value="OFFLINE">OFFLINE</option>
                </select>
              </label>
            </div>

            <label className="cloud-network-checkbox">
              <input
                type="checkbox"
                checked={includeUnlinked}
                onChange={(event) => setIncludeUnlinked(event.target.checked)}
              />
              {tx("Include stores that are not linked to onsite yet", "Incluir tiendas que aun no estan enlazadas con onsite")}
            </label>

            {unlinkedStores.length > 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                {tx("Unlinked stores", "Tiendas no enlazadas")}:{" "}
                {unlinkedStores.map((store) => `${store.name} (${store.code})`).join(", ")}
              </p>
            ) : null}
          </section>

          <section className="panel cloud-network-claim-panel">
            <h3>{tx("Claim Onsite Server", "Registrar servidor onsite")}</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              {tx(
                "Pair local server UID and add it into the reseller/tenant dashboard.",
                "Vincula el UID del servidor local y agregalo al panel de revendedor/inquilino."
              )}
            </p>
            <div className="cloud-platform-form-grid">
              <label>
                {tx("Onsite URL", "URL onsite")}
                <input
                  value={claimDraft.onsiteBaseUrl}
                  onChange={(event) => setClaimDraft((prev) => ({ ...prev, onsiteBaseUrl: event.target.value }))}
                  placeholder="http://192.168.1.50:8080"
                />
              </label>
              <label>
                {tx("Claim ID", "ID de claim")}
                <input
                  value={claimDraft.claimId}
                  onChange={(event) => setClaimDraft((prev) => ({ ...prev, claimId: event.target.value }))}
                  placeholder="clm_xxxxxxxx"
                />
              </label>
              <label>
                {tx("Claim Code", "Codigo de claim")}
                <input
                  value={claimDraft.claimCode}
                  onChange={(event) => setClaimDraft((prev) => ({ ...prev, claimCode: event.target.value }))}
                  placeholder="ABCD-2345"
                />
              </label>
              <label>
                {tx("Tenant", "Inquilino")}
                <select
                  value={claimDraft.tenantId}
                  onChange={(event) => setClaimDraft((prev) => ({ ...prev, tenantId: event.target.value }))}
                >
                  <option value="">{tx("Select tenant", "Selecciona inquilino")}</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx("Store Name Override (optional)", "Reemplazo nombre de tienda (opcional)")}
                <input
                  value={claimDraft.storeName}
                  onChange={(event) => setClaimDraft((prev) => ({ ...prev, storeName: event.target.value }))}
                  placeholder="Cross Amigos - New Site"
                />
              </label>
              <label>
                {tx("Store Code Override (optional)", "Reemplazo codigo de tienda (opcional)")}
                <input
                  value={claimDraft.storeCode}
                  onChange={(event) => setClaimDraft((prev) => ({ ...prev, storeCode: event.target.value }))}
                  placeholder="CA-SITE-A"
                />
              </label>
              <label>
                {tx("Timezone", "Zona horaria")}
                <input
                  value={claimDraft.timezone}
                  onChange={(event) => setClaimDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                  placeholder="America/Chicago"
                />
              </label>
              <label>
                {tx("Node Label", "Etiqueta del nodo")}
                <input
                  value={claimDraft.nodeLabel}
                  onChange={(event) => setClaimDraft((prev) => ({ ...prev, nodeLabel: event.target.value }))}
                  placeholder="Kitchen Edge Server"
                />
              </label>
              <label>
                {tx("Cloud Base URL (optional)", "URL base cloud (opcional)")}
                <input
                  value={claimDraft.cloudBaseUrl}
                  onChange={(event) => setClaimDraft((prev) => ({ ...prev, cloudBaseUrl: event.target.value }))}
                  placeholder="https://api.yourcloud.com"
                />
              </label>
            </div>
            <div className="cloud-platform-inline-actions">
              <button type="button" className="terminal-btn primary" onClick={() => void claimOnsiteServer()} disabled={claiming}>
                {claiming ? tx("Claiming...", "Registrando...") : tx("Claim + Link", "Registrar + enlazar")}
              </button>
            </div>
            {claimResult?.store ? (
              <div className="cloud-platform-meta-list">
                <div>
                  <span className="hint">{tx("Cloud Store", "Tienda cloud")}</span>
                  <strong>
                    {claimResult.store.name} ({claimResult.store.code})
                  </strong>
                </div>
                <div>
                  <span className="hint">{tx("Node Key", "Clave de nodo")}</span>
                  <strong>{claimResult.node?.nodeKey || "-"}</strong>
                </div>
                <div>
                  <span className="hint">{tx("Onsite UID", "UID onsite")}</span>
                  <strong>{claimResult.onsite?.serverUid || "-"}</strong>
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel cloud-network-remote-panel">
            <h3>{tx("Reseller Remote Actions", "Acciones remotas de revendedor")}</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              {tx(
                "Queue remote commands for onsite servers without direct SSH/remote desktop.",
                "Cola de comandos remotos para servidores onsite sin SSH/escritorio remoto."
              )}
            </p>
            <div className="cloud-platform-form-grid">
              <label>
                {tx("Store", "Tienda")}
                <select
                  value={remoteActionDraft.storeId}
                  onChange={(event) =>
                    setRemoteActionDraft((prev) => ({
                      ...prev,
                      storeId: event.target.value,
                      nodeId: ""
                    }))
                  }
                >
                  <option value="">{tx("Select store", "Selecciona tienda")}</option>
                  {actionableStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.code})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {tx("Action", "Accion")}
                <select
                  value={remoteActionDraft.action}
                  onChange={(event) =>
                    setRemoteActionDraft((prev) => {
                      const nextAction = event.target.value as RemoteActionCode;
                      return {
                        ...prev,
                        action: nextAction,
                        parametersJson:
                          nextAction === "RESTART_BACKEND"
                            ? prev.parametersJson.trim() === "{}"
                              ? '{\n  "endpoint": "/maintenance/restart"\n}'
                              : prev.parametersJson
                            : "{}"
                      };
                    })
                  }
                >
                  <option value="HEARTBEAT_NOW">{tx("Heartbeat now", "Latido ahora")}</option>
                  <option value="SYNC_PULL">{tx("Sync pull", "Sincronizar pull")}</option>
                  <option value="RUN_DIAGNOSTICS">{tx("Run diagnostics", "Ejecutar diagnosticos")}</option>
                  <option value="RELOAD_SETTINGS">{tx("Reload settings", "Recargar configuracion")}</option>
                  <option value="RESTART_BACKEND">{tx("Restart backend", "Reiniciar backend")}</option>
                  <option value="RESTART_AGENT">{tx("Restart agent", "Reiniciar agente")}</option>
                </select>
              </label>

              <label>
                {tx("Node", "Nodo")}
                <select
                  value={remoteActionDraft.nodeId}
                  onChange={(event) =>
                    setRemoteActionDraft((prev) => ({
                      ...prev,
                      nodeId: event.target.value
                    }))
                  }
                  disabled={remoteActionDraft.targetAllNodes}
                >
                  <option value="">{tx("Select node", "Selecciona nodo")}</option>
                  {(dispatchStore?.nodes || []).map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label} ({node.nodeKey})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {tx("Note (optional)", "Nota (opcional)")}
                <input
                  value={remoteActionDraft.note}
                  onChange={(event) =>
                    setRemoteActionDraft((prev) => ({
                      ...prev,
                      note: event.target.value
                    }))
                  }
                  placeholder="Reason or context"
                />
              </label>

              {remoteActionNeedsParameters ? (
                <label style={{ gridColumn: "1 / -1" }}>
                  {tx("Restart Parameters", "Parametros de reinicio")}
                  <textarea
                    value={remoteActionDraft.parametersJson}
                    onChange={(event) =>
                      setRemoteActionDraft((prev) => ({
                        ...prev,
                        parametersJson: event.target.value
                      }))
                    }
                    rows={4}
                    placeholder='{\n  "endpoint": "/maintenance/restart"\n}'
                    style={{
                      background: "rgba(8, 13, 24, 0.94)",
                      border: "1px solid rgba(163, 191, 229, 0.3)",
                      color: "#ebf2ff",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
                    }}
                  />
                </label>
              ) : null}
            </div>

            <label className="cloud-network-checkbox">
              <input
                type="checkbox"
                checked={remoteActionDraft.targetAllNodes}
                onChange={(event) =>
                  setRemoteActionDraft((prev) => ({
                    ...prev,
                    targetAllNodes: event.target.checked,
                    nodeId: event.target.checked ? "" : prev.nodeId
                  }))
                }
              />
              {tx("Send to all nodes in selected store", "Enviar a todos los nodos de la tienda seleccionada")}
            </label>

            <div className="cloud-platform-inline-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={() => void dispatchRemoteAction()}
                disabled={dispatchingAction}
              >
                {dispatchingAction
                  ? tx("Queueing...", "Encolando...")
                  : tx("Queue Remote Action", "Encolar accion remota")}
              </button>
            </div>
          </section>

          <section className="panel cloud-network-table-panel">
            <h3>{tx("Onsite Linked Stores", "Tiendas onsite enlazadas")}</h3>
            <div className="cloud-network-table-wrap">
              <table className="cloud-network-table">
                <thead>
                  <tr>
                    <th>{tx("Reseller", "Revendedor")}</th>
                    <th>{tx("Tenant", "Inquilino")}</th>
                    <th>{tx("Store", "Tienda")}</th>
                    <th>{tx("Node", "Nodo")}</th>
                    <th>{tx("Server UID", "UID servidor")}</th>
                    <th>{tx("Onsite URL", "URL onsite")}</th>
                    <th>{tx("Status", "Estado")}</th>
                    <th>{tx("Heartbeat", "Latido")}</th>
                    <th>{tx("Updated", "Actualizado")}</th>
                    <th>{tx("Actions", "Acciones")}</th>
                  </tr>
                </thead>
                <tbody>
                  {flattenedRows.map(({ store, node }) => (
                    <tr key={node.id}>
                      <td>{store.tenant?.reseller?.name || "-"}</td>
                      <td>{store.tenant?.name || "-"}</td>
                      <td>
                        <strong>{store.name}</strong>
                        <div className="hint">{store.code}</div>
                      </td>
                      <td>
                        <strong>{node.label}</strong>
                        <div className="hint">{node.nodeKey}</div>
                      </td>
                      <td>{node.onsiteServerUid || "-"}</td>
                      <td>{node.onsiteBaseUrl || store.edgeBaseUrl || "-"}</td>
                      <td>
                        <span className={`cloud-node-status ${node.status.toLowerCase()}`}>{node.status}</span>
                      </td>
                      <td>{formatAge(node.heartbeatAgeSeconds)}</td>
                      <td>{formatDate(node.updatedAt || node.lastSeenAt || store.updatedAt)}</td>
                      <td>
                        <div className="cloud-network-action-row">
                          <button
                            type="button"
                            className="terminal-btn ghost"
                            onClick={() => void quickDispatch(store.id, node.id, "HEARTBEAT_NOW", "Quick heartbeat")}
                            disabled={dispatchingAction}
                          >
                            {tx("Heartbeat", "Latido")}
                          </button>
                          <button
                            type="button"
                            className="terminal-btn ghost"
                            onClick={() => void quickDispatch(store.id, node.id, "SYNC_PULL", "Quick sync pull")}
                            disabled={dispatchingAction}
                          >
                            {tx("Sync", "Sincronizar")}
                          </button>
                          <button
                            type="button"
                            className="terminal-btn ghost"
                            onClick={() => void quickDispatch(store.id, node.id, "RUN_DIAGNOSTICS", "Quick diagnostics")}
                            disabled={dispatchingAction}
                          >
                            {tx("Diagnostics", "Diagnosticos")}
                          </button>
                          <button
                            type="button"
                            className="terminal-btn ghost"
                            disabled={!cloudToken || !resolveBackOfficeBaseUrl(node.onsiteBaseUrl || store.edgeBaseUrl || "")}
                            onClick={() => void openCustomerBackOffice(store, node)}
                          >
                            {tx("Open Customer Back Office", "Abrir Back Office del cliente")}
                          </button>
                          <button
                            type="button"
                            className="terminal-btn"
                            disabled={rotatingNodeId === node.id}
                            onClick={() => void rotateNodeToken(node.id, node.nodeKey)}
                          >
                            {rotatingNodeId === node.id ? tx("Rotating...", "Rotando...") : tx("Rotate Token", "Rotar token")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {flattenedRows.length === 0 ? (
                <p className="hint" style={{ padding: "10px 2px", margin: 0 }}>
                  {tx("No onsite nodes found in this scope.", "No se encontraron nodos onsite en este alcance.")}
                </p>
              ) : null}
            </div>
          </section>

          <section className="panel cloud-network-activity-panel">
            <h3>{tx("Recent Remote Actions", "Acciones remotas recientes")}</h3>
            <div className="cloud-platform-filter-row">
              <label>
                {tx("Action Status Filter", "Filtro de estado de accion")}
                <input
                  value={actionStatusFilter}
                  onChange={(event) => setActionStatusFilter(event.target.value.toUpperCase())}
                  placeholder="PENDING,FAILED,ACKED"
                />
              </label>
            </div>
            <div className="cloud-network-table-wrap">
              <table className="cloud-network-table cloud-network-action-table">
                <thead>
                  <tr>
                    <th>{tx("Status", "Estado")}</th>
                    <th>{tx("Action", "Accion")}</th>
                    <th>{tx("Store", "Tienda")}</th>
                    <th>{tx("Node", "Nodo")}</th>
                    <th>{tx("Issued", "Emitido")}</th>
                    <th>{tx("Ack", "Ack")}</th>
                    <th>{tx("Error", "Error")}</th>
                    <th>{tx("Logs", "Logs")}</th>
                    <th>{tx("Manage", "Gestionar")}</th>
                  </tr>
                </thead>
                <tbody>
                  {remoteActions.map((action) => (
                    <tr key={action.id}>
                      <td>
                        <span className={`cloud-node-status ${String(action.status || "").toLowerCase()}`}>
                          {action.status}
                        </span>
                      </td>
                      <td>{action.action || action.commandType}</td>
                      <td>
                        <strong>{action.store?.name || "-"}</strong>
                        <div className="hint">{action.store?.code || "-"}</div>
                      </td>
                      <td>{action.node?.label || tx("All nodes", "Todos los nodos")}</td>
                      <td>{formatDate(action.issuedAt)}</td>
                      <td>{formatDate(action.acknowledgedAt)}</td>
                      <td>{action.errorCode || "-"}</td>
                      <td>{action._count?.logs || 0}</td>
                      <td>
                        <div className="cloud-network-action-row">
                          {action.status === "FAILED" ? (
                            <button
                              type="button"
                              className="terminal-btn ghost"
                              onClick={() => void retryRemoteAction(action.id)}
                              disabled={retryingActionId === action.id}
                            >
                              {retryingActionId === action.id ? tx("Retrying...", "Reintentando...") : tx("Retry", "Reintentar")}
                            </button>
                          ) : null}
                          {action.status === "PENDING" ? (
                            <button
                              type="button"
                              className="terminal-btn ghost"
                              onClick={() => void cancelRemoteAction(action.id)}
                              disabled={cancellingActionId === action.id}
                            >
                              {cancellingActionId === action.id ? tx("Cancelling...", "Cancelando...") : tx("Cancel", "Cancelar")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {remoteActions.length === 0 ? (
                <p className="hint" style={{ padding: "10px 2px", margin: 0 }}>
                  {tx("No remote actions in this scope.", "No hay acciones remotas en este alcance.")}
                </p>
              ) : null}
            </div>
          </section>

          {rotatedNodeToken ? (
            <section className="panel cloud-network-token-panel">
              <h3>{tx("Rotated Node Token", "Token de nodo rotado")}</h3>
              <p className="hint">
                {tx(
                  "Save this token now. It is shown once and required for secure heartbeat/sync from onsite server.",
                  "Guarda este token ahora. Se muestra una sola vez y se requiere para latido/sync seguro desde onsite."
                )}
              </p>
              <div className="cloud-network-token-row">
                <code>{rotatedNodeToken.nodeKey}</code>
                <code>{rotatedNodeToken.token}</code>
              </div>
              <div className="cloud-platform-inline-actions">
                <button type="button" className="terminal-btn primary" onClick={() => void copyRotatedToken()}>
                  {tx("Copy Token", "Copiar token")}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {error ? <p style={{ color: "#fca5a5", margin: 0 }}>{error}</p> : null}
      {message ? <p style={{ color: "#93c5fd", margin: 0 }}>{message}</p> : null}
    </div>
  );
}
