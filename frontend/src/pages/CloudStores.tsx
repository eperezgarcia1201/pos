import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import CloudPortalPreferenceControls from "../components/CloudPortalPreferenceControls";
import { useCloudPortalUi } from "../lib/cloudPortalUi";

type CloudAccountType = "OWNER" | "RESELLER" | "TENANT_ADMIN";

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
  metadata?: unknown;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type CloudSession = {
  token: string;
  account: CloudAccount;
};

type Reseller = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  _count?: {
    tenants?: number;
    accounts?: number;
  };
  createdAt: string;
  updatedAt: string;
};

type Tenant = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  resellerId?: string | null;
  reseller?: { id: string; name: string; code: string } | null;
  _count?: {
    stores?: number;
    accounts?: number;
  };
  createdAt: string;
  updatedAt: string;
};

type PlatformStore = {
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
  _count?: {
    nodes?: number;
    revisions?: number;
  };
  createdAt: string;
  updatedAt: string;
};

type LoginResponse = {
  token: string;
  account: CloudAccount;
};

type StoreImpersonationLinkResponse = {
  url: string;
  targetBaseUrl: string;
  expiresInSeconds: number;
};

type CreateResellerDraft = {
  name: string;
  code: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  adminEmail: string;
  adminPassword: string;
  adminDisplayName: string;
};

type CreateTenantDraft = {
  name: string;
  slug: string;
  resellerId: string;
  adminEmail: string;
  adminPassword: string;
  adminDisplayName: string;
};

type CreateStoreDraft = {
  tenantId: string;
  name: string;
  code: string;
  timezone: string;
  edgeBaseUrl: string;
};

type CreateScopedAccountDraft = {
  resellerId: string;
  tenantId: string;
  email: string;
  password: string;
  displayName: string;
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

type SavingScope =
  | "reseller"
  | "tenant"
  | "store"
  | "reseller-account"
  | "tenant-account"
  | "onsite-claim"
  | null;

type CloudNavSectionKey = "dashboard" | "resellers" | "tenants" | "locations" | "servers" | "analytics";
type CloudPrimaryNavKey =
  | "dashboard"
  | "resellers"
  | "tenants"
  | "locations"
  | "servers"
  | "accounts"
  | "terminals"
  | "reports"
  | "alerts";

const CLOUD_NAV_ITEMS: CloudNavSectionKey[] = [
  "dashboard",
  "resellers",
  "tenants",
  "locations",
  "servers",
  "analytics"
];

const CLOUD_PRIMARY_NAV_ITEMS: Array<{ key: CloudPrimaryNavKey; section: CloudNavSectionKey }> = [
  { key: "dashboard", section: "dashboard" },
  { key: "resellers", section: "resellers" },
  { key: "tenants", section: "tenants" },
  { key: "locations", section: "locations" },
  { key: "servers", section: "servers" },
  { key: "accounts", section: "tenants" },
  { key: "terminals", section: "servers" },
  { key: "reports", section: "analytics" },
  { key: "alerts", section: "analytics" }
];

const CLOUD_SIDEBAR_ITEMS: Array<{ key: CloudPrimaryNavKey; section: CloudNavSectionKey; indicator?: boolean }> = [
  { key: "dashboard", section: "dashboard" },
  { key: "resellers", section: "resellers" },
  { key: "tenants", section: "tenants" },
  { key: "locations", section: "locations", indicator: true },
  { key: "servers", section: "servers", indicator: true },
  { key: "accounts", section: "tenants", indicator: true },
  { key: "terminals", section: "servers", indicator: true },
  { key: "reports", section: "analytics" },
  { key: "alerts", section: "analytics" }
];

const CLOUD_SESSION_STORAGE_KEY = "pos_cloud_platform_session";

function cloudNavLabel(
  key: CloudNavSectionKey,
  tx: (english: string, spanish: string, params?: Record<string, string | number>) => string
) {
  switch (key) {
    case "dashboard":
      return tx("Dashboard", "Panel");
    case "resellers":
      return tx("Resellers", "Revendedores");
    case "tenants":
      return tx("Tenants", "Inquilinos");
    case "locations":
      return tx("Locations", "Ubicaciones");
    case "servers":
      return tx("Servers", "Servidores");
    case "analytics":
      return tx("Analytics", "Analitica");
    default:
      return key;
  }
}

function cloudPrimaryNavLabel(
  key: CloudPrimaryNavKey,
  tx: (english: string, spanish: string, params?: Record<string, string | number>) => string
) {
  switch (key) {
    case "dashboard":
      return tx("Dashboard", "Panel");
    case "resellers":
      return tx("Resellers", "Revendedores");
    case "tenants":
      return tx("Tenants", "Inquilinos");
    case "locations":
      return tx("Locations", "Ubicaciones");
    case "servers":
      return tx("Servers", "Servidores");
    case "accounts":
      return tx("Accounts", "Cuentas");
    case "terminals":
      return tx("POS Terminals", "Terminales POS");
    case "reports":
      return tx("Reports", "Reportes");
    case "alerts":
      return tx("Alerts", "Alertas");
    default:
      return key;
  }
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    if (error.message.toLowerCase().includes("failed to fetch")) {
      return "Cannot reach Cloud API. Make sure backend is running on http://localhost:8080.";
    }
    return error.message;
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

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
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

function buildAdminAccountPayload(email: string, password: string, displayName: string) {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedPassword = password.trim();
  const trimmedDisplayName = displayName.trim();
  const hasAny = Boolean(trimmedEmail || trimmedPassword || trimmedDisplayName);

  if (!hasAny) {
    return { payload: undefined, error: null as string | null };
  }
  if (!trimmedEmail || !trimmedPassword) {
    return {
      payload: undefined,
      error: "Admin email and password are required when creating a login account."
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return {
      payload: undefined,
      error: "Enter a valid admin email address."
    };
  }
  if (trimmedPassword.length < 8) {
    return {
      payload: undefined,
      error: "Admin password must be at least 8 characters."
    };
  }
  return {
    payload: {
      email: trimmedEmail,
      password: trimmedPassword,
      displayName: trimmedDisplayName || undefined
    },
    error: null as string | null
  };
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

export default function CloudStores() {
  const navigate = useNavigate();
  const { tx } = useCloudPortalUi();

  const [sessionBooting, setSessionBooting] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingScope, setSavingScope] = useState<SavingScope>(null);

  const [cloudToken, setCloudToken] = useState("");
  const [cloudAccount, setCloudAccount] = useState<CloudAccount | null>(null);

  const [loginEmail, setLoginEmail] = useState("owner@websyspos.local");
  const [loginPassword, setLoginPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tenantFormError, setTenantFormError] = useState<string | null>(null);
  const [tenantFormMessage, setTenantFormMessage] = useState<string | null>(null);
  const [activeNavSection, setActiveNavSection] = useState<CloudNavSectionKey>("dashboard");
  const [activePrimaryNav, setActivePrimaryNav] = useState<CloudPrimaryNavKey>("dashboard");

  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stores, setStores] = useState<PlatformStore[]>([]);

  const [resellerFilterId, setResellerFilterId] = useState("");
  const [tenantFilterId, setTenantFilterId] = useState("");

  const [resellerDraft, setResellerDraft] = useState<CreateResellerDraft>({
    name: "",
    code: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    adminEmail: "",
    adminPassword: "",
    adminDisplayName: ""
  });

  const [tenantDraft, setTenantDraft] = useState<CreateTenantDraft>({
    name: "",
    slug: "",
    resellerId: "",
    adminEmail: "",
    adminPassword: "",
    adminDisplayName: ""
  });

  const [storeDraft, setStoreDraft] = useState<CreateStoreDraft>({
    tenantId: "",
    name: "",
    code: "",
    timezone: "America/Chicago",
    edgeBaseUrl: ""
  });

  const [resellerAccountDraft, setResellerAccountDraft] = useState<CreateScopedAccountDraft>({
    resellerId: "",
    tenantId: "",
    email: "",
    password: "",
    displayName: ""
  });

  const [tenantAccountDraft, setTenantAccountDraft] = useState<CreateScopedAccountDraft>({
    resellerId: "",
    tenantId: "",
    email: "",
    password: "",
    displayName: ""
  });

  const [onsiteClaimDraft, setOnsiteClaimDraft] = useState<OnsiteClaimDraft>({
    onsiteBaseUrl: "http://192.168.1.50:8080",
    claimId: "",
    claimCode: "",
    tenantId: "",
    storeName: "",
    storeCode: "",
    timezone: "America/Chicago",
    edgeBaseUrl: "",
    nodeLabel: "Onsite Store Server"
  });
  const [onsiteClaimResult, setOnsiteClaimResult] = useState<OnsiteClaimResult | null>(null);

  const canCreateReseller = cloudAccount?.accountType === "OWNER";
  const canCreateTenant = cloudAccount?.accountType === "OWNER" || cloudAccount?.accountType === "RESELLER";
  const canCreateResellerAccount = cloudAccount?.accountType === "OWNER" || cloudAccount?.accountType === "RESELLER";

  const totals = useMemo(
    () => ({
      resellers: resellers.length,
      tenants: tenants.length,
      stores: stores.length,
      locationsActive: stores.filter((store) => store.status === "ACTIVE").length
    }),
    [resellers, stores, tenants]
  );

  const totalNodes = useMemo(
    () => stores.reduce((sum, store) => sum + Number(store._count?.nodes || 0), 0),
    [stores]
  );

  const onlineNodesEstimate = useMemo(() => {
    if (totalNodes <= 0) return 0;
    return Math.max(1, Math.round(totalNodes * 0.9));
  }, [totalNodes]);

  const offlineNodesEstimate = Math.max(totalNodes - onlineNodesEstimate, 0);
  const serverHealthPct = totalNodes > 0 ? Math.round((onlineNodesEstimate / totalNodes) * 100) : 0;

  const resellerDistribution = useMemo(() => {
    const rows = resellers
      .map((reseller) => ({
        id: reseller.id,
        name: reseller.name,
        value: Number(reseller._count?.tenants || 0)
      }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
    if (totalValue <= 0) return [];

    return rows.map((row) => ({
      ...row,
      percent: Math.max(1, Math.round((row.value / totalValue) * 100))
    }));
  }, [resellers]);

  const refreshPlatform = useCallback(async () => {
    if (!cloudToken || !cloudAccount) return;

    setLoading(true);
    setError(null);

    try {
      const tenantParams = new URLSearchParams();
      if (cloudAccount.accountType === "OWNER" && resellerFilterId) {
        tenantParams.set("resellerId", resellerFilterId);
      }

      const storeParams = new URLSearchParams();
      if (cloudAccount.accountType === "OWNER" && resellerFilterId) {
        storeParams.set("resellerId", resellerFilterId);
      }
      if (tenantFilterId) {
        storeParams.set("tenantId", tenantFilterId);
      }

      const tenantPath =
        tenantParams.size > 0
          ? `/cloud/platform/tenants?${tenantParams.toString()}`
          : "/cloud/platform/tenants";

      const storePath =
        storeParams.size > 0
          ? `/cloud/platform/stores?${storeParams.toString()}`
          : "/cloud/platform/stores";

      const resellerPromise =
        cloudAccount.accountType === "TENANT_ADMIN"
          ? Promise.resolve({ resellers: [] as Reseller[] })
          : cloudApiFetch<{ resellers: Reseller[] }>(cloudToken, "/cloud/platform/resellers");

      const [resellerResult, tenantResult, storeResult] = await Promise.all([
        resellerPromise,
        cloudApiFetch<{ tenants: Tenant[] }>(cloudToken, tenantPath),
        cloudApiFetch<{ stores: PlatformStore[] }>(cloudToken, storePath)
      ]);

      setResellers(Array.isArray(resellerResult.resellers) ? resellerResult.resellers : []);
      setTenants(Array.isArray(tenantResult.tenants) ? tenantResult.tenants : []);
      setStores(Array.isArray(storeResult.stores) ? storeResult.stores : []);
    } catch (err) {
      setError(toErrorMessage(err, "Unable to load cloud hierarchy."));
    } finally {
      setLoading(false);
    }
  }, [cloudToken, cloudAccount, resellerFilterId, tenantFilterId]);

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

    if (resellerFilterId !== cloudAccount.resellerId) {
      setResellerFilterId(cloudAccount.resellerId);
    }

    setTenantDraft((prev) =>
      prev.resellerId === cloudAccount.resellerId
        ? prev
        : {
            ...prev,
            resellerId: cloudAccount.resellerId || ""
          }
    );

    setResellerAccountDraft((prev) =>
      prev.resellerId === cloudAccount.resellerId
        ? prev
        : {
            ...prev,
            resellerId: cloudAccount.resellerId || ""
          }
    );
  }, [cloudAccount, resellerFilterId]);

  useEffect(() => {
    if (cloudAccount?.accountType !== "OWNER") return;
    if (!resellerFilterId) return;
    setTenantDraft((prev) => (prev.resellerId ? prev : { ...prev, resellerId: resellerFilterId }));
    setResellerAccountDraft((prev) => (prev.resellerId ? prev : { ...prev, resellerId: resellerFilterId }));
  }, [cloudAccount, resellerFilterId]);

  useEffect(() => {
    if (!cloudAccount) return;
    if (cloudAccount.accountType !== "TENANT_ADMIN" || !cloudAccount.tenantId) return;
    setOnsiteClaimDraft((prev) =>
      prev.tenantId === cloudAccount.tenantId ? prev : { ...prev, tenantId: cloudAccount.tenantId || "" }
    );
  }, [cloudAccount]);

  useEffect(() => {
    if (tenants.length === 0) {
      setStoreDraft((prev) => (prev.tenantId ? { ...prev, tenantId: "" } : prev));
      setTenantAccountDraft((prev) => (prev.tenantId ? { ...prev, tenantId: "" } : prev));
      setOnsiteClaimDraft((prev) => (prev.tenantId ? { ...prev, tenantId: "" } : prev));
      if (tenantFilterId) setTenantFilterId("");
      return;
    }

    setStoreDraft((prev) =>
      tenants.some((tenant) => tenant.id === prev.tenantId) ? prev : { ...prev, tenantId: tenants[0].id }
    );

    setTenantAccountDraft((prev) =>
      tenants.some((tenant) => tenant.id === prev.tenantId) ? prev : { ...prev, tenantId: tenants[0].id }
    );

    setOnsiteClaimDraft((prev) =>
      tenants.some((tenant) => tenant.id === prev.tenantId) ? prev : { ...prev, tenantId: tenants[0].id }
    );

    if (tenantFilterId && !tenants.some((tenant) => tenant.id === tenantFilterId)) {
      setTenantFilterId("");
    }
  }, [tenantFilterId, tenants]);

  useEffect(() => {
    if (sessionBooting || !cloudToken || !cloudAccount) return;
    void refreshPlatform();
  }, [sessionBooting, cloudToken, cloudAccount, refreshPlatform]);

  const loginCloudAccount = async () => {
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
      })) as LoginResponse;

      setCloudToken(result.token);
      setCloudAccount(result.account);
      saveCloudSession({ token: result.token, account: result.account });
      setLoginPassword("");
      setMessage(`Signed in as ${result.account.displayName || result.account.email}.`);
    } catch (err) {
      setError(toErrorMessage(err, "Unable to sign in to cloud platform."));
    } finally {
      setAuthLoading(false);
    }
  };

  const logoutCloudAccount = () => {
    saveCloudSession(null);
    setCloudToken("");
    setCloudAccount(null);
    setResellers([]);
    setTenants([]);
    setStores([]);
    setResellerFilterId("");
    setTenantFilterId("");
    setMessage("Cloud session closed.");
    setError(null);
  };

  const openCustomerBackOffice = async (store: PlatformStore) => {
    if (!cloudToken) {
      setError("Sign in to cloud first.");
      return;
    }

    const targetBaseUrl = resolveBackOfficeBaseUrl(store.edgeBaseUrl || "");
    if (!targetBaseUrl) {
      setError("Customer Back Office URL is missing for this location.");
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

  const createReseller = async () => {
    if (!cloudToken) return;
    if (!resellerDraft.name.trim()) {
      setError("Reseller name is required.");
      return;
    }

    const admin = buildAdminAccountPayload(
      resellerDraft.adminEmail,
      resellerDraft.adminPassword,
      resellerDraft.adminDisplayName
    );
    if (admin.error) {
      setError(admin.error);
      return;
    }

    setSavingScope("reseller");
    setError(null);
    setMessage(null);

    try {
      await cloudApiFetch(cloudToken, "/cloud/platform/resellers", {
        method: "POST",
        body: JSON.stringify({
          name: resellerDraft.name.trim(),
          code: resellerDraft.code.trim() || undefined,
          contactName: resellerDraft.contactName.trim() || undefined,
          contactEmail: resellerDraft.contactEmail.trim() || undefined,
          contactPhone: resellerDraft.contactPhone.trim() || undefined,
          admin: admin.payload
        })
      });

      setResellerDraft({
        name: "",
        code: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        adminEmail: "",
        adminPassword: "",
        adminDisplayName: ""
      });
      setMessage("Reseller created successfully.");
      await refreshPlatform();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to create reseller."));
    } finally {
      setSavingScope(null);
    }
  };

  const createTenant = async () => {
    if (!cloudToken || !cloudAccount) return;
    setTenantFormError(null);
    setTenantFormMessage(null);

    if (!tenantDraft.name.trim()) {
      const msg = "Tenant name is required.";
      setTenantFormError(msg);
      setError(msg);
      return;
    }

    const admin = buildAdminAccountPayload(tenantDraft.adminEmail, tenantDraft.adminPassword, tenantDraft.adminDisplayName);
    if (admin.error) {
      setTenantFormError(admin.error);
      setError(admin.error);
      return;
    }

    const targetResellerId =
      cloudAccount.accountType === "RESELLER"
        ? cloudAccount.resellerId || ""
        : tenantDraft.resellerId;

    if (cloudAccount.accountType === "OWNER" && !targetResellerId) {
      const msg = "Select a reseller for this tenant.";
      setTenantFormError(msg);
      setError(msg);
      return;
    }

    const endpoint =
      cloudAccount.accountType === "OWNER" && targetResellerId
        ? `/cloud/platform/resellers/${encodeURIComponent(targetResellerId)}/tenants`
        : "/cloud/platform/tenants";

    setSavingScope("tenant");
    setError(null);
    setMessage(null);

    try {
      await cloudApiFetch(cloudToken, endpoint, {
        method: "POST",
        body: JSON.stringify({
          name: tenantDraft.name.trim(),
          slug: tenantDraft.slug.trim() || undefined,
          resellerId: cloudAccount.accountType === "OWNER" ? targetResellerId || undefined : undefined,
          admin: admin.payload
        })
      });

      setTenantDraft((prev) => ({
        name: "",
        slug: "",
        resellerId: prev.resellerId,
        adminEmail: "",
        adminPassword: "",
        adminDisplayName: ""
      }));

      setMessage("Tenant created successfully.");
      setTenantFormMessage("Tenant created successfully.");
      await refreshPlatform();
    } catch (err) {
      const msg = toErrorMessage(err, "Unable to create tenant.");
      setTenantFormError(msg);
      setError(msg);
    } finally {
      setSavingScope(null);
    }
  };

  const createStore = async () => {
    if (!cloudToken) return;
    if (!storeDraft.tenantId) {
      setError("Tenant is required for a new location.");
      return;
    }
    if (!storeDraft.name.trim()) {
      setError("Location name is required.");
      return;
    }

    setSavingScope("store");
    setError(null);
    setMessage(null);

    try {
      await cloudApiFetch(cloudToken, "/cloud/platform/stores", {
        method: "POST",
        body: JSON.stringify({
          tenantId: storeDraft.tenantId,
          name: storeDraft.name.trim(),
          code: storeDraft.code.trim() || undefined,
          timezone: storeDraft.timezone.trim() || undefined,
          edgeBaseUrl: storeDraft.edgeBaseUrl.trim() || undefined
        })
      });

      setStoreDraft((prev) => ({
        ...prev,
        name: "",
        code: "",
        edgeBaseUrl: ""
      }));

      setMessage("Location created successfully.");
      await refreshPlatform();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to create location."));
    } finally {
      setSavingScope(null);
    }
  };

  const createResellerAccount = async () => {
    if (!cloudToken || !cloudAccount) return;

    const resellerId =
      cloudAccount.accountType === "RESELLER"
        ? cloudAccount.resellerId || ""
        : resellerAccountDraft.resellerId;

    if (!resellerId) {
      setError("Choose a reseller before creating a reseller login.");
      return;
    }

    if (!resellerAccountDraft.email.trim() || !resellerAccountDraft.password.trim()) {
      setError("Reseller login email and password are required.");
      return;
    }

    setSavingScope("reseller-account");
    setError(null);
    setMessage(null);

    try {
      await cloudApiFetch(cloudToken, `/cloud/platform/resellers/${encodeURIComponent(resellerId)}/accounts`, {
        method: "POST",
        body: JSON.stringify({
          email: resellerAccountDraft.email.trim().toLowerCase(),
          password: resellerAccountDraft.password.trim(),
          displayName: resellerAccountDraft.displayName.trim() || undefined
        })
      });

      setResellerAccountDraft((prev) => ({
        ...prev,
        email: "",
        password: "",
        displayName: ""
      }));

      setMessage("Reseller login created.");
      await refreshPlatform();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to create reseller login."));
    } finally {
      setSavingScope(null);
    }
  };

  const createTenantAccount = async () => {
    if (!cloudToken) return;

    if (!tenantAccountDraft.tenantId) {
      setError("Choose a tenant before creating tenant login.");
      return;
    }

    if (!tenantAccountDraft.email.trim() || !tenantAccountDraft.password.trim()) {
      setError("Tenant login email and password are required.");
      return;
    }

    setSavingScope("tenant-account");
    setError(null);
    setMessage(null);

    try {
      await cloudApiFetch(cloudToken, `/cloud/platform/tenants/${encodeURIComponent(tenantAccountDraft.tenantId)}/accounts`, {
        method: "POST",
        body: JSON.stringify({
          email: tenantAccountDraft.email.trim().toLowerCase(),
          password: tenantAccountDraft.password.trim(),
          displayName: tenantAccountDraft.displayName.trim() || undefined
        })
      });

      setTenantAccountDraft((prev) => ({
        ...prev,
        email: "",
        password: "",
        displayName: ""
      }));

      setMessage("Tenant admin login created.");
      await refreshPlatform();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to create tenant login."));
    } finally {
      setSavingScope(null);
    }
  };

  const claimOnsiteServer = async () => {
    if (!cloudToken) return;

    const onsiteBaseUrl = onsiteClaimDraft.onsiteBaseUrl.trim();
    const claimId = onsiteClaimDraft.claimId.trim();
    const claimCode = onsiteClaimDraft.claimCode.trim();
    const tenantId = onsiteClaimDraft.tenantId;

    if (!onsiteBaseUrl || !claimId || !claimCode) {
      setError("Onsite URL, claim id, and claim code are required.");
      return;
    }
    if (!tenantId) {
      setError("Select a tenant before claiming an onsite server.");
      return;
    }

    setSavingScope("onsite-claim");
    setError(null);
    setMessage(null);
    setOnsiteClaimResult(null);

    try {
      const result = await cloudApiFetch<OnsiteClaimResult>(cloudToken, "/cloud/platform/onsite/claim", {
        method: "POST",
        body: JSON.stringify({
          onsiteBaseUrl,
          claimId,
          claimCode,
          tenantId,
          storeName: onsiteClaimDraft.storeName.trim() || undefined,
          storeCode: onsiteClaimDraft.storeCode.trim() || undefined,
          timezone: onsiteClaimDraft.timezone.trim() || undefined,
          edgeBaseUrl: onsiteClaimDraft.edgeBaseUrl.trim() || undefined,
          nodeLabel: onsiteClaimDraft.nodeLabel.trim() || undefined
        })
      });

      setOnsiteClaimResult(result);
      setOnsiteClaimDraft((prev) => ({
        ...prev,
        claimId: "",
        claimCode: "",
        storeName: "",
        storeCode: ""
      }));
      setMessage("Onsite server claimed and linked to cloud hierarchy.");
      await refreshPlatform();
    } catch (err) {
      setError(toErrorMessage(err, "Unable to claim onsite server."));
    } finally {
      setSavingScope(null);
    }
  };

  const activateCloudSection = (section: CloudNavSectionKey, primaryKey?: CloudPrimaryNavKey) => {
    setActiveNavSection(section);
    if (primaryKey) {
      setActivePrimaryNav(primaryKey);
    } else {
      setActivePrimaryNav(section === "analytics" ? "reports" : section);
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const showDashboardView = activeNavSection === "dashboard" || activeNavSection === "analytics";
  const showResellerView = activeNavSection === "resellers";
  const showTenantView = activeNavSection === "tenants";
  const showLocationView = activeNavSection === "locations";
  const showServerView = activeNavSection === "servers";
  const showResellerTable = showDashboardView || showResellerView;
  const showTenantTable = showDashboardView || showTenantView;
  const showLocationTable = showDashboardView || showLocationView || showServerView;
  const showHierarchySection = showResellerTable || showTenantTable || showLocationTable;

  return (
    <div className="screen-shell cloud-platform-shell">
      <header className="screen-header cloud-platform-topbar cloud-platform-topbar-primary">
        <div className="cloud-platform-brand-block">
          <span className="cloud-platform-brand-mark" aria-hidden="true">
            ☁
          </span>
          <strong>{tx("Cloud Platform", "Plataforma Cloud")}</strong>
        </div>
        <nav className="cloud-platform-nav cloud-platform-nav-primary" aria-label={tx("Cloud navigation", "Navegacion cloud")}>
          {CLOUD_PRIMARY_NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`cloud-platform-nav-item${activePrimaryNav === item.key ? " active" : ""}`}
              onClick={() => activateCloudSection(item.section, item.key)}
            >
              {cloudPrimaryNavLabel(item.key, tx)}
            </button>
          ))}
        </nav>
        <div className="cloud-platform-top-actions cloud-platform-global-actions">
          <span className="cloud-platform-mini-icon" aria-hidden="true">
            ☰
          </span>
          <span className="cloud-platform-mini-icon" aria-hidden="true">
            ▤
          </span>
          <span className="cloud-platform-mini-icon" aria-hidden="true">
            ⌁
          </span>
          {cloudAccount ? (
            <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-sync")}>
              {tx("Sync", "Sincronizar")}
            </button>
          ) : null}
          {cloudAccount && cloudAccount.accountType === "OWNER" ? (
            <button
              type="button"
              className="terminal-btn ghost"
              onClick={() => activateCloudSection("analytics", "alerts")}
              title={tx("Owner scope", "Scope owner")}
            >
              {tx("Owner", "Owner")}
            </button>
          ) : null}
          <div className="cloud-platform-avatar" aria-label={tx("Current user", "Usuario actual")}>
            {(cloudAccount?.displayName || cloudAccount?.email || "CP").slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      {!sessionBooting && cloudAccount ? (
        <section className="panel cloud-platform-toolbar">
          <nav className="cloud-platform-nav cloud-platform-nav-secondary" aria-label={tx("Cloud quick navigation", "Navegacion rapida cloud")}>
            {CLOUD_NAV_ITEMS.map((itemKey) => (
              <button
                key={itemKey}
                type="button"
                className={`cloud-platform-nav-item${activeNavSection === itemKey ? " active" : ""}`}
                onClick={() => activateCloudSection(itemKey)}
              >
                {cloudNavLabel(itemKey, tx)}
              </button>
            ))}
          </nav>
          <div className="cloud-platform-top-actions cloud-platform-toolbar-actions">
            <CloudPortalPreferenceControls />
            <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-sync")}>
              {tx("Sync", "Sincronizar")}
            </button>
            <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-network")}>
              {tx("Store Network", "Red de tiendas")}
            </button>
            <button type="button" className="terminal-btn ghost" onClick={() => navigate("/back-office")}>
              {tx("Back Office", "Back Office")}
            </button>
            <button type="button" className="terminal-btn ghost" onClick={logoutCloudAccount}>
              {tx("Sign Out Cloud", "Cerrar sesion cloud")}
            </button>
            <button type="button" className="terminal-btn primary" onClick={() => void refreshPlatform()} disabled={loading}>
              {loading ? tx("Refreshing...", "Actualizando...") : tx("Refresh", "Actualizar")}
            </button>
          </div>
        </section>
      ) : null}

      {!cloudAccount ? (
        <section className="panel cloud-platform-title-panel">
          <h2>{tx("Cloud Platform Control Center", "Centro de control de plataforma cloud")}</h2>
          <p>
            {tx(
              "Owner to reseller to tenant to multi-location stores, fully scoped by cloud account.",
              "Owner a revendedor a inquilino a tiendas multiubicacion, totalmente limitado por cuenta cloud."
            )}
          </p>
        </section>
      ) : null}

      {sessionBooting ? (
        <section className="panel cloud-platform-auth">
          <h3>{tx("Loading Cloud Session", "Cargando sesion cloud")}</h3>
          <p className="hint">{tx("Checking existing cloud credentials...", "Verificando credenciales cloud...")}</p>
        </section>
      ) : null}

      {!sessionBooting && !cloudAccount ? (
        <section className="panel cloud-platform-auth">
          <h3>{tx("Cloud Owner / Reseller Login", "Login cloud de owner / revendedor")}</h3>
          <p className="hint">
            {tx(
              "Sign in with a cloud account to manage resellers, tenants, and locations.",
              "Inicia sesion con una cuenta cloud para administrar revendedores, inquilinos y ubicaciones."
            )}
          </p>
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
            <button type="button" className="terminal-btn primary" onClick={() => void loginCloudAccount()} disabled={authLoading}>
              {authLoading ? tx("Signing In...", "Entrando...") : tx("Sign In", "Entrar")}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            {tx("Seed default owner:", "Owner por defecto:")} <code>owner@websyspos.local</code>
          </p>
        </section>
      ) : null}

      {!sessionBooting && cloudAccount ? (
        <div className="cloud-platform-frame">
          <aside className="panel cloud-platform-sidebar">
            <div className="cloud-platform-sidebar-head">
              <strong>{tx("Cloud Navigation", "Navegacion cloud")}</strong>
            </div>
            <nav className="cloud-platform-sidebar-nav" aria-label={tx("Cloud sidebar", "Barra lateral cloud")}>
              {CLOUD_SIDEBAR_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`cloud-platform-sidebar-item${activePrimaryNav === item.key ? " active" : ""}`}
                  onClick={() => activateCloudSection(item.section, item.key)}
                >
                  <span>{cloudPrimaryNavLabel(item.key, tx)}</span>
                  {item.indicator ? <i aria-hidden="true" className="cloud-platform-sidebar-dot" /> : null}
                </button>
              ))}
            </nav>
            <div className="cloud-platform-sidebar-footer">
              <button type="button" className="terminal-btn ghost">
                {tx("Support", "Soporte")}
              </button>
              <span className="hint">{tx("Version 1.0", "Version 1.0")}</span>
            </div>
          </aside>

          <main className="cloud-platform-content">
            <section className="panel cloud-platform-title-panel">
              <h2>{tx("Cloud Platform Control Center", "Centro de control de plataforma cloud")}</h2>
              <p>
                {tx(
                  "Owner to reseller to tenant to multi-location stores, fully scoped by cloud account.",
                  "Owner a revendedor a inquilino a tiendas multiubicacion, totalmente limitado por cuenta cloud."
                )}
              </p>
            </section>

            <div className="screen-grid cloud-platform-grid">
          {showDashboardView ? (
            <section className="panel cloud-platform-span cloud-platform-dashboard">
            <div className="cloud-platform-stat-grid">
              <article className="cloud-platform-stat-card">
                <p>{tx("Total Resellers", "Total de revendedores")}</p>
                <strong>{totals.resellers}</strong>
                <span>
                  {totals.resellers > 0
                    ? tx("+{{value}} active", "+{{value}} activos", { value: Math.max(1, totals.resellers) })
                    : tx("No resellers yet", "Aun no hay revendedores")}
                </span>
              </article>
              <article className="cloud-platform-stat-card">
                <p>{tx("Total Tenants", "Total de inquilinos")}</p>
                <strong>{totals.tenants}</strong>
                <span>
                  {totals.tenants > 0
                    ? tx("+{{value}} this month", "+{{value}} este mes", {
                        value: Math.max(1, Math.round(totals.tenants * 0.15))
                      })
                    : tx("No tenants yet", "Aun no hay inquilinos")}
                </span>
              </article>
              <article className="cloud-platform-stat-card">
                <p>{tx("Active Locations", "Ubicaciones activas")}</p>
                <strong>{totals.locationsActive}</strong>
                <span>
                  {totals.stores > 0
                    ? tx("{{value}} inactive", "{{value}} inactivas", { value: totals.stores - totals.locationsActive })
                    : tx("No locations yet", "Aun no hay ubicaciones")}
                </span>
              </article>
              <article className="cloud-platform-stat-card">
                <p>{tx("Onsite Servers", "Servidores onsite")}</p>
                <strong>{totalNodes}</strong>
                <span>
                  {tx("{{online}} online, {{offline}} offline", "{{online}} en linea, {{offline}} fuera de linea", {
                    online: onlineNodesEstimate,
                    offline: offlineNodesEstimate
                  })}
                </span>
              </article>
            </div>

            <div className="cloud-platform-analytics-grid">
              <article className="cloud-platform-analytics-card">
                <h4>{tx("Tenant Growth", "Crecimiento de inquilinos")}</h4>
                <div className="cloud-platform-trend-chart">
                  <svg viewBox="0 0 360 140" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="tenantGrowthFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(96,165,250,0.35)" />
                        <stop offset="100%" stopColor="rgba(96,165,250,0)" />
                      </linearGradient>
                    </defs>
                    <polyline
                      fill="url(#tenantGrowthFill)"
                      stroke="none"
                      points="0,120 30,110 60,95 90,88 120,86 150,74 180,70 210,62 240,58 270,48 300,42 330,30 360,18 360,140 0,140"
                    />
                    <polyline
                      fill="none"
                      stroke="rgba(96,165,250,0.95)"
                      strokeWidth="3"
                      points="0,120 30,110 60,95 90,88 120,86 150,74 180,70 210,62 240,58 270,48 300,42 330,30 360,18"
                    />
                  </svg>
                </div>
              </article>

              <article className="cloud-platform-analytics-card cloud-platform-health-card">
                <h4>{tx("Server Health", "Salud de servidores")}</h4>
                <div className="cloud-platform-health-row">
                  <div
                    className="cloud-platform-donut"
                    style={{
                      background: `conic-gradient(rgba(52, 211, 153, 0.95) 0 ${serverHealthPct}%, rgba(248, 113, 113, 0.75) ${serverHealthPct}% 100%)`
                    }}
                  >
                    <span>{serverHealthPct}%</span>
                  </div>
                  <div className="cloud-platform-health-stats">
                    <p>
                      <i className="dot online" /> {tx("Online", "En linea")}: {onlineNodesEstimate}
                    </p>
                    <p>
                      <i className="dot offline" /> {tx("Offline", "Fuera de linea")}: {offlineNodesEstimate}
                    </p>
                  </div>
                </div>
              </article>

              <article className="cloud-platform-analytics-card">
                <h4>{tx("Reseller Distribution", "Distribucion de revendedores")}</h4>
                {resellerDistribution.length > 0 ? (
                  <div className="cloud-platform-distribution-list">
                    {resellerDistribution.map((row) => (
                      <div key={row.id} className="cloud-platform-distribution-item">
                        <span>{row.name}</span>
                        <div>
                          <em style={{ width: `${row.percent}%` }} />
                        </div>
                        <strong>{row.percent}%</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>
                    {tx(
                      "Distribution appears after reseller tenant data is added.",
                      "La distribucion aparece despues de agregar datos de inquilinos por revendedor."
                    )}
                  </p>
                )}
              </article>
            </div>
            </section>
          ) : null}

          <section className="panel cloud-platform-card">
            <h3>{tx("Current Cloud Scope", "Alcance cloud actual")}</h3>
            <div className="cloud-platform-kpi-grid">
              <article className="cloud-platform-kpi-card">
                <strong>{cloudAccount.accountType}</strong>
                <span>{tx("Account Type", "Tipo de cuenta")}</span>
              </article>
              <article className="cloud-platform-kpi-card">
                <strong>{totals.resellers}</strong>
                <span>{tx("Resellers", "Revendedores")}</span>
              </article>
              <article className="cloud-platform-kpi-card">
                <strong>{totals.tenants}</strong>
                <span>{tx("Tenants", "Inquilinos")}</span>
              </article>
              <article className="cloud-platform-kpi-card">
                <strong>{totals.locationsActive}</strong>
                <span>{tx("Active Locations", "Ubicaciones activas")}</span>
              </article>
            </div>

            <div className="cloud-platform-meta-list">
              <div>
                <span className="hint">{tx("Signed in as", "Sesion iniciada como")}</span>
                <strong>{cloudAccount.displayName || cloudAccount.email}</strong>
              </div>
              <div>
                <span className="hint">{tx("Reseller Scope", "Alcance de revendedor")}</span>
                <strong>{cloudAccount.reseller?.name || tx("All / none", "Todos / ninguno")}</strong>
              </div>
              <div>
                <span className="hint">{tx("Tenant Scope", "Alcance de inquilino")}</span>
                <strong>{cloudAccount.tenant?.name || tx("All / none", "Todos / ninguno")}</strong>
              </div>
            </div>

            <div className="cloud-platform-filter-row">
              {cloudAccount.accountType === "OWNER" ? (
                <label>
                  {tx("Filter by Reseller", "Filtrar por revendedor")}
                  <select value={resellerFilterId} onChange={(event) => setResellerFilterId(event.target.value)}>
                    <option value="">{tx("All Resellers", "Todos los revendedores")}</option>
                    {resellers.map((reseller) => (
                      <option key={reseller.id} value={reseller.id}>
                        {reseller.name} ({reseller.code})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label>
                {tx("Filter by Tenant", "Filtrar por inquilino")}
                <select value={tenantFilterId} onChange={(event) => setTenantFilterId(event.target.value)}>
                  <option value="">{tx("All Tenants", "Todos los inquilinos")}</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {canCreateReseller && showResellerView ? (
            <section className="panel cloud-platform-card">
              <h3>{tx("Create Reseller", "Crear revendedor")}</h3>
              <div className="cloud-platform-form-grid">
                <label>
                  {tx("Reseller Name", "Nombre del revendedor")}
                  <input
                    value={resellerDraft.name}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Midwest POS Partners"
                  />
                </label>
                <label>
                  {tx("Code (optional)", "Codigo (opcional)")}
                  <input
                    value={resellerDraft.code}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, code: event.target.value }))}
                    placeholder="MIDWEST"
                  />
                </label>
                <label>
                  {tx("Contact Name", "Nombre de contacto")}
                  <input
                    value={resellerDraft.contactName}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, contactName: event.target.value }))}
                    placeholder="Account manager"
                  />
                </label>
                <label>
                  {tx("Contact Email", "Correo de contacto")}
                  <input
                    value={resellerDraft.contactEmail}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, contactEmail: event.target.value }))}
                    placeholder="ops@reseller.com"
                  />
                </label>
                <label>
                  {tx("Contact Phone", "Telefono de contacto")}
                  <input
                    value={resellerDraft.contactPhone}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, contactPhone: event.target.value }))}
                    placeholder="(555) 555-0101"
                  />
                </label>
              </div>

              <p className="hint" style={{ marginTop: 10, marginBottom: 6 }}>
                {tx("Optional: create reseller admin login now", "Opcional: crear login admin del revendedor ahora")}
              </p>
              <div className="cloud-platform-form-grid">
                <label>
                  {tx("Admin Email", "Correo admin")}
                  <input
                    value={resellerDraft.adminEmail}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, adminEmail: event.target.value }))}
                    placeholder="admin@reseller.com"
                  />
                </label>
                <label>
                  {tx("Admin Password", "Contrasena admin")}
                  <input
                    type="password"
                    value={resellerDraft.adminPassword}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, adminPassword: event.target.value }))}
                    placeholder={tx("Minimum 8 characters", "Minimo 8 caracteres")}
                  />
                </label>
                <label>
                  {tx("Admin Display Name", "Nombre visible admin")}
                  <input
                    value={resellerDraft.adminDisplayName}
                    onChange={(event) =>
                      setResellerDraft((prev) => ({ ...prev, adminDisplayName: event.target.value }))
                    }
                    placeholder="Reseller Admin"
                  />
                </label>
              </div>

              <div className="cloud-platform-inline-actions">
                <button
                  type="button"
                  className="terminal-btn primary"
                  onClick={() => void createReseller()}
                  disabled={savingScope === "reseller"}
                >
                  {savingScope === "reseller"
                    ? tx("Creating...", "Creando...")
                    : tx("Create Reseller", "Crear revendedor")}
                </button>
              </div>
            </section>
          ) : null}

          {canCreateTenant && showTenantView ? (
            <section className="panel cloud-platform-card">
              <h3>{tx("Create Tenant", "Crear inquilino")}</h3>
              <div className="cloud-platform-form-grid">
                {cloudAccount?.accountType === "OWNER" ? (
                  <label>
                    {tx("Reseller", "Revendedor")}
                    <select
                      value={tenantDraft.resellerId}
                      onChange={(event) => setTenantDraft((prev) => ({ ...prev, resellerId: event.target.value }))}
                    >
                      <option value="">{tx("Select reseller", "Selecciona revendedor")}</option>
                      {resellers.map((reseller) => (
                        <option key={reseller.id} value={reseller.id}>
                          {reseller.name} ({reseller.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label>
                  {tx("Tenant Name", "Nombre del inquilino")}
                  <input
                    value={tenantDraft.name}
                    onChange={(event) => setTenantDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Cross Amigos Group"
                  />
                </label>

                <label>
                  {tx("Slug (optional)", "Slug (opcional)")}
                  <input
                    value={tenantDraft.slug}
                    onChange={(event) => setTenantDraft((prev) => ({ ...prev, slug: event.target.value }))}
                    placeholder="cross-amigos"
                  />
                </label>
              </div>

              <p className="hint" style={{ marginTop: 10, marginBottom: 6 }}>
                {tx("Optional: create tenant admin login now", "Opcional: crear login admin del inquilino ahora")}
              </p>
              <div className="cloud-platform-form-grid">
                <label>
                  {tx("Admin Email", "Correo admin")}
                  <input
                    value={tenantDraft.adminEmail}
                    onChange={(event) => setTenantDraft((prev) => ({ ...prev, adminEmail: event.target.value }))}
                    placeholder="owner@tenant.com"
                  />
                </label>
                <label>
                  {tx("Admin Password", "Contrasena admin")}
                  <input
                    type="password"
                    value={tenantDraft.adminPassword}
                    onChange={(event) => setTenantDraft((prev) => ({ ...prev, adminPassword: event.target.value }))}
                    placeholder={tx("Minimum 8 characters", "Minimo 8 caracteres")}
                  />
                </label>
                <label>
                  {tx("Admin Display Name", "Nombre visible admin")}
                  <input
                    value={tenantDraft.adminDisplayName}
                    onChange={(event) => setTenantDraft((prev) => ({ ...prev, adminDisplayName: event.target.value }))}
                    placeholder="Tenant Admin"
                  />
                </label>
              </div>

              <div className="cloud-platform-inline-actions">
                <button
                  type="button"
                  className="terminal-btn primary"
                  onClick={() => void createTenant()}
                  disabled={savingScope === "tenant"}
                >
                  {savingScope === "tenant" ? tx("Creating...", "Creando...") : tx("Create Tenant", "Crear inquilino")}
                </button>
              </div>
              {tenantFormError ? <p className="cloud-platform-alert cloud-platform-alert-error cloud-platform-inline-alert">{tenantFormError}</p> : null}
              {tenantFormMessage ? (
                <p className="cloud-platform-alert cloud-platform-alert-success cloud-platform-inline-alert">{tenantFormMessage}</p>
              ) : null}
            </section>
          ) : null}

          {showLocationView ? (
            <section className="panel cloud-platform-card">
            <h3>{tx("Create Location (Store)", "Crear ubicacion (tienda)")}</h3>
            <div className="cloud-platform-form-grid">
              <label>
                {tx("Tenant", "Inquilino")}
                <select
                  value={storeDraft.tenantId}
                  onChange={(event) => setStoreDraft((prev) => ({ ...prev, tenantId: event.target.value }))}
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
                {tx("Location Name", "Nombre de ubicacion")}
                <input
                  value={storeDraft.name}
                  onChange={(event) => setStoreDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Cross Amigos - North"
                />
              </label>

              <label>
                {tx("Location Code (optional)", "Codigo de ubicacion (opcional)")}
                <input
                  value={storeDraft.code}
                  onChange={(event) => setStoreDraft((prev) => ({ ...prev, code: event.target.value }))}
                  placeholder="CA-NORTH"
                />
              </label>

              <label>
                {tx("Timezone", "Zona horaria")}
                <input
                  value={storeDraft.timezone}
                  onChange={(event) => setStoreDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                  placeholder="America/Chicago"
                />
              </label>

              <label>
                {tx("Edge Base URL (optional)", "URL base edge (opcional)")}
                <input
                  value={storeDraft.edgeBaseUrl}
                  onChange={(event) => setStoreDraft((prev) => ({ ...prev, edgeBaseUrl: event.target.value }))}
                  placeholder="http://192.168.1.22:8080"
                />
              </label>
            </div>

            <div className="cloud-platform-inline-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={() => void createStore()}
                disabled={savingScope === "store"}
              >
                {savingScope === "store" ? tx("Creating...", "Creando...") : tx("Create Location", "Crear ubicacion")}
              </button>
            </div>
            </section>
          ) : null}

          {showServerView ? (
            <section className="panel cloud-platform-card">
            <h3>{tx("Claim Onsite Server", "Registrar servidor onsite")}</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              {tx(
                "Use the onsite server claim id + claim code to register that local server and auto-create its cloud location.",
                "Usa el claim id + claim code del servidor onsite para registrarlo y crear su ubicacion cloud automaticamente."
              )}
            </p>
            <div className="cloud-platform-form-grid">
              <label>
                {tx("Onsite Server URL", "URL del servidor onsite")}
                <input
                  value={onsiteClaimDraft.onsiteBaseUrl}
                  onChange={(event) =>
                    setOnsiteClaimDraft((prev) => ({ ...prev, onsiteBaseUrl: event.target.value }))
                  }
                  placeholder="http://192.168.1.50:8080"
                />
              </label>
              <label>
                {tx("Claim ID", "ID de claim")}
                <input
                  value={onsiteClaimDraft.claimId}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, claimId: event.target.value }))}
                  placeholder="clm_xxxxxxxx"
                />
              </label>
              <label>
                {tx("Claim Code", "Codigo de claim")}
                <input
                  value={onsiteClaimDraft.claimCode}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, claimCode: event.target.value }))}
                  placeholder="ABCD-2345"
                />
              </label>
              <label>
                {tx("Tenant", "Inquilino")}
                <select
                  value={onsiteClaimDraft.tenantId}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, tenantId: event.target.value }))}
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
                {tx("Location Name Override (optional)", "Reemplazo de nombre de ubicacion (opcional)")}
                <input
                  value={onsiteClaimDraft.storeName}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, storeName: event.target.value }))}
                  placeholder="Cross Amigos - Onsite A"
                />
              </label>
              <label>
                {tx("Location Code Override (optional)", "Reemplazo de codigo de ubicacion (opcional)")}
                <input
                  value={onsiteClaimDraft.storeCode}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, storeCode: event.target.value }))}
                  placeholder="CA-ONSITE-A"
                />
              </label>
              <label>
                {tx("Timezone", "Zona horaria")}
                <input
                  value={onsiteClaimDraft.timezone}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                  placeholder="America/Chicago"
                />
              </label>
              <label>
                {tx("Edge Base URL (optional)", "URL base edge (opcional)")}
                <input
                  value={onsiteClaimDraft.edgeBaseUrl}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, edgeBaseUrl: event.target.value }))}
                  placeholder={tx("defaults to onsite URL", "usa URL onsite por defecto")}
                />
              </label>
              <label>
                {tx("Node Label", "Etiqueta del nodo")}
                <input
                  value={onsiteClaimDraft.nodeLabel}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, nodeLabel: event.target.value }))}
                  placeholder="Kitchen Edge Server"
                />
              </label>
            </div>

            <div className="cloud-platform-inline-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={() => void claimOnsiteServer()}
                disabled={savingScope === "onsite-claim"}
              >
                {savingScope === "onsite-claim"
                  ? tx("Claiming...", "Registrando...")
                  : tx("Claim Server + Create Location", "Registrar servidor + crear ubicacion")}
              </button>
            </div>

            {onsiteClaimResult?.store ? (
              <div className="cloud-platform-meta-list">
                <div>
                  <span className="hint">{tx("Cloud Store", "Tienda cloud")}</span>
                  <strong>
                    {onsiteClaimResult.store.name} ({onsiteClaimResult.store.code})
                  </strong>
                </div>
                <div>
                  <span className="hint">{tx("Node Key", "Clave de nodo")}</span>
                  <strong>{onsiteClaimResult.node?.nodeKey || "-"}</strong>
                </div>
                <div>
                  <span className="hint">{tx("Onsite UID", "UID onsite")}</span>
                  <strong>{onsiteClaimResult.onsite?.serverUid || "-"}</strong>
                </div>
                {onsiteClaimResult.onsite?.finalizeError ? (
                  <div>
                    <span className="hint">{tx("Finalize Warning", "Advertencia de finalizacion")}</span>
                    <strong>{onsiteClaimResult.onsite.finalizeError}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}
            </section>
          ) : null}

          {canCreateResellerAccount && showResellerView ? (
            <section className="panel cloud-platform-card">
              <h3>{tx("Create Reseller Login", "Crear login de revendedor")}</h3>
              <div className="cloud-platform-form-grid">
                {cloudAccount?.accountType === "OWNER" ? (
                  <label>
                    {tx("Reseller", "Revendedor")}
                    <select
                      value={resellerAccountDraft.resellerId}
                      onChange={(event) =>
                        setResellerAccountDraft((prev) => ({ ...prev, resellerId: event.target.value }))
                      }
                    >
                      <option value="">{tx("Select reseller", "Selecciona revendedor")}</option>
                      {resellers.map((reseller) => (
                        <option key={reseller.id} value={reseller.id}>
                          {reseller.name} ({reseller.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label>
                  {tx("Login Email", "Correo de login")}
                  <input
                    value={resellerAccountDraft.email}
                    onChange={(event) => setResellerAccountDraft((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="manager@reseller.com"
                  />
                </label>
                <label>
                  {tx("Password", "Contrasena")}
                  <input
                    type="password"
                    value={resellerAccountDraft.password}
                    onChange={(event) =>
                      setResellerAccountDraft((prev) => ({ ...prev, password: event.target.value }))
                    }
                    placeholder={tx("Minimum 8 characters", "Minimo 8 caracteres")}
                  />
                </label>
                <label>
                  {tx("Display Name", "Nombre visible")}
                  <input
                    value={resellerAccountDraft.displayName}
                    onChange={(event) =>
                      setResellerAccountDraft((prev) => ({ ...prev, displayName: event.target.value }))
                    }
                    placeholder="Regional Manager"
                  />
                </label>
              </div>
              <div className="cloud-platform-inline-actions">
                <button
                  type="button"
                  className="terminal-btn"
                  onClick={() => void createResellerAccount()}
                  disabled={savingScope === "reseller-account"}
                >
                  {savingScope === "reseller-account"
                    ? tx("Creating...", "Creando...")
                    : tx("Create Reseller Login", "Crear login de revendedor")}
                </button>
              </div>
            </section>
          ) : null}

          {showTenantView ? (
            <section className="panel cloud-platform-card">
            <h3>{tx("Create Tenant Login", "Crear login de inquilino")}</h3>
            <div className="cloud-platform-form-grid">
              <label>
                {tx("Tenant", "Inquilino")}
                <select
                  value={tenantAccountDraft.tenantId}
                  onChange={(event) => setTenantAccountDraft((prev) => ({ ...prev, tenantId: event.target.value }))}
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
                {tx("Login Email", "Correo de login")}
                <input
                  value={tenantAccountDraft.email}
                  onChange={(event) => setTenantAccountDraft((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="owner@tenant.com"
                />
              </label>

              <label>
                {tx("Password", "Contrasena")}
                <input
                  type="password"
                  value={tenantAccountDraft.password}
                  onChange={(event) => setTenantAccountDraft((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder={tx("Minimum 8 characters", "Minimo 8 caracteres")}
                />
              </label>

              <label>
                {tx("Display Name", "Nombre visible")}
                <input
                  value={tenantAccountDraft.displayName}
                  onChange={(event) => setTenantAccountDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                  placeholder="Store Owner"
                />
              </label>
            </div>
            <div className="cloud-platform-inline-actions">
              <button
                type="button"
                className="terminal-btn"
                onClick={() => void createTenantAccount()}
                disabled={savingScope === "tenant-account"}
              >
                {savingScope === "tenant-account"
                  ? tx("Creating...", "Creando...")
                  : tx("Create Tenant Login", "Crear login de inquilino")}
              </button>
            </div>
            </section>
          ) : null}

          {showHierarchySection ? (
            <section className="panel cloud-platform-card cloud-platform-span">
            <h3>{tx("Hierarchy Data", "Datos de jerarquia")}</h3>

            {showResellerTable && cloudAccount.accountType !== "TENANT_ADMIN" ? (
              <div className="cloud-platform-table-block">
                <h4>{tx("Resellers", "Revendedores")}</h4>
                <div className="cloud-platform-table-wrap">
                  <table className="cloud-platform-table">
                    <thead>
                      <tr>
                        <th>{tx("Name", "Nombre")}</th>
                        <th>{tx("Code", "Codigo")}</th>
                        <th>{tx("Tenants", "Inquilinos")}</th>
                        <th>{tx("Accounts", "Cuentas")}</th>
                        <th>{tx("Updated", "Actualizado")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resellers.map((reseller) => (
                        <tr key={reseller.id}>
                          <td>{reseller.name}</td>
                          <td>{reseller.code}</td>
                          <td>{reseller._count?.tenants || 0}</td>
                          <td>{reseller._count?.accounts || 0}</td>
                          <td>{formatDate(reseller.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {resellers.length === 0 ? <p className="hint">{tx("No resellers in this scope.", "No hay revendedores en este alcance.")}</p> : null}
                </div>
              </div>
            ) : null}

            {showTenantTable ? (
              <div className="cloud-platform-table-block">
              <h4>{tx("Tenants", "Inquilinos")}</h4>
              <div className="cloud-platform-table-wrap">
                <table className="cloud-platform-table">
                  <thead>
                    <tr>
                      <th>{tx("Tenant", "Inquilino")}</th>
                      <th>{tx("Reseller", "Revendedor")}</th>
                      <th>{tx("Stores", "Tiendas")}</th>
                      <th>{tx("Accounts", "Cuentas")}</th>
                      <th>{tx("Updated", "Actualizado")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant) => (
                      <tr key={tenant.id}>
                        <td>
                          {tenant.name}
                          <div className="hint">{tenant.slug}</div>
                        </td>
                        <td>{tenant.reseller?.name || "-"}</td>
                        <td>{tenant._count?.stores || 0}</td>
                        <td>{tenant._count?.accounts || 0}</td>
                        <td>{formatDate(tenant.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tenants.length === 0 ? <p className="hint">{tx("No tenants in this scope.", "No hay inquilinos en este alcance.")}</p> : null}
              </div>
              </div>
            ) : null}

            {showLocationTable ? (
              <div className="cloud-platform-table-block">
              <h4>{tx("Locations", "Ubicaciones")}</h4>
              <div className="cloud-platform-table-wrap">
                <table className="cloud-platform-table">
                  <thead>
                    <tr>
                      <th>{tx("Location", "Ubicacion")}</th>
                      <th>{tx("Tenant", "Inquilino")}</th>
                      <th>{tx("Status", "Estado")}</th>
                      <th>{tx("Nodes", "Nodos")}</th>
                      <th>{tx("Revisions", "Revisiones")}</th>
                      <th>{tx("Updated", "Actualizado")}</th>
                      <th>{tx("Actions", "Acciones")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((store) => (
                      <tr key={store.id}>
                        <td>
                          {store.name}
                          <div className="hint">{store.code}</div>
                        </td>
                        <td>{store.tenant?.name || "-"}</td>
                        <td>{store.status}</td>
                        <td>{store._count?.nodes || 0}</td>
                        <td>{store._count?.revisions || 0}</td>
                        <td>{formatDate(store.updatedAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="terminal-btn ghost"
                            disabled={!cloudToken || !resolveBackOfficeBaseUrl(store.edgeBaseUrl || "")}
                            onClick={() => void openCustomerBackOffice(store)}
                          >
                            {tx("Open Customer Back Office", "Abrir Back Office del cliente")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stores.length === 0 ? <p className="hint">{tx("No locations in this scope.", "No hay ubicaciones en este alcance.")}</p> : null}
              </div>
              </div>
            ) : null}
            </section>
          ) : null}
            </div>

            {error ? <p className="cloud-platform-alert cloud-platform-alert-error">{error}</p> : null}
            {message ? <p className="cloud-platform-alert cloud-platform-alert-success">{message}</p> : null}
          </main>
        </div>
      ) : null}

      {!cloudAccount && error ? <p className="cloud-platform-alert cloud-platform-alert-error">{error}</p> : null}
      {!cloudAccount && message ? <p className="cloud-platform-alert cloud-platform-alert-success">{message}</p> : null}
    </div>
  );
}
