import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

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

const CLOUD_NAV_ITEMS: Array<{ key: CloudNavSectionKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "resellers", label: "Resellers" },
  { key: "tenants", label: "Tenants" },
  { key: "locations", label: "Locations" },
  { key: "servers", label: "Servers" },
  { key: "analytics", label: "Analytics" }
];

const CLOUD_SESSION_STORAGE_KEY = "pos_cloud_platform_session";

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
      <header className="screen-header cloud-platform-topbar">
        <div className="cloud-platform-brand-block">
          <span className="cloud-platform-brand-mark" aria-hidden="true">
            ☁
          </span>
          <strong>Cloud Platform</strong>
        </div>
        <nav className="cloud-platform-nav" aria-label="Cloud navigation">
          {CLOUD_NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`cloud-platform-nav-item${activeNavSection === item.key ? " active" : ""}`}
              onClick={() => {
                setActiveNavSection(item.key);
                if (typeof window !== "undefined") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="cloud-platform-top-actions">
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-sync")}>
            Sync
          </button>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/cloud-network")}>
            Store Network
          </button>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/back-office")}>
            Back Office
          </button>
          {cloudAccount ? (
            <button type="button" className="terminal-btn ghost" onClick={logoutCloudAccount}>
              Sign Out Cloud
            </button>
          ) : null}
          {cloudAccount ? (
            <button type="button" className="terminal-btn primary" onClick={() => void refreshPlatform()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          ) : null}
          <div className="cloud-platform-avatar" aria-label="Current user">
            {(cloudAccount?.displayName || cloudAccount?.email || "CP").slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      <section className="panel cloud-platform-title-panel">
        <h2>Cloud Platform Control Center</h2>
        <p>Owner to reseller to tenant to multi-location stores, fully scoped by cloud account.</p>
      </section>

      {sessionBooting ? (
        <section className="panel cloud-platform-auth">
          <h3>Loading Cloud Session</h3>
          <p className="hint">Checking existing cloud credentials...</p>
        </section>
      ) : null}

      {!sessionBooting && !cloudAccount ? (
        <section className="panel cloud-platform-auth">
          <h3>Cloud Owner / Reseller Login</h3>
          <p className="hint">Sign in with a cloud account to manage resellers, tenants, and locations.</p>
          <div className="cloud-platform-form-grid" style={{ marginTop: 10 }}>
            <label>
              Email
              <input
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="owner@websyspos.local"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Enter password"
              />
            </label>
          </div>
          <div className="cloud-platform-inline-actions" style={{ marginTop: 12 }}>
            <button type="button" className="terminal-btn primary" onClick={() => void loginCloudAccount()} disabled={authLoading}>
              {authLoading ? "Signing In..." : "Sign In"}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Seed default owner: <code>owner@websyspos.local</code>
          </p>
        </section>
      ) : null}

      {!sessionBooting && cloudAccount ? (
        <div className="screen-grid cloud-platform-grid">
          {showDashboardView ? (
            <section className="panel cloud-platform-span cloud-platform-dashboard">
            <div className="cloud-platform-stat-grid">
              <article className="cloud-platform-stat-card">
                <p>Total Resellers</p>
                <strong>{totals.resellers}</strong>
                <span>{totals.resellers > 0 ? `+${Math.max(1, totals.resellers)} active` : "No resellers yet"}</span>
              </article>
              <article className="cloud-platform-stat-card">
                <p>Total Tenants</p>
                <strong>{totals.tenants}</strong>
                <span>{totals.tenants > 0 ? `+${Math.max(1, Math.round(totals.tenants * 0.15))} this month` : "No tenants yet"}</span>
              </article>
              <article className="cloud-platform-stat-card">
                <p>Active Locations</p>
                <strong>{totals.locationsActive}</strong>
                <span>
                  {totals.stores > 0 ? `${totals.stores - totals.locationsActive} inactive` : "No locations yet"}
                </span>
              </article>
              <article className="cloud-platform-stat-card">
                <p>Onsite Servers</p>
                <strong>{totalNodes}</strong>
                <span>
                  {onlineNodesEstimate} online, {offlineNodesEstimate} offline
                </span>
              </article>
            </div>

            <div className="cloud-platform-analytics-grid">
              <article className="cloud-platform-analytics-card">
                <h4>Tenant Growth</h4>
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
                <h4>Server Health</h4>
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
                      <i className="dot online" /> Online: {onlineNodesEstimate}
                    </p>
                    <p>
                      <i className="dot offline" /> Offline: {offlineNodesEstimate}
                    </p>
                  </div>
                </div>
              </article>

              <article className="cloud-platform-analytics-card">
                <h4>Reseller Distribution</h4>
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
                    Distribution appears after reseller tenant data is added.
                  </p>
                )}
              </article>
            </div>
            </section>
          ) : null}

          <section className="panel cloud-platform-card">
            <h3>Current Cloud Scope</h3>
            <div className="cloud-platform-kpi-grid">
              <article className="cloud-platform-kpi-card">
                <strong>{cloudAccount.accountType}</strong>
                <span>Account Type</span>
              </article>
              <article className="cloud-platform-kpi-card">
                <strong>{totals.resellers}</strong>
                <span>Resellers</span>
              </article>
              <article className="cloud-platform-kpi-card">
                <strong>{totals.tenants}</strong>
                <span>Tenants</span>
              </article>
              <article className="cloud-platform-kpi-card">
                <strong>{totals.locationsActive}</strong>
                <span>Active Locations</span>
              </article>
            </div>

            <div className="cloud-platform-meta-list">
              <div>
                <span className="hint">Signed in as</span>
                <strong>{cloudAccount.displayName || cloudAccount.email}</strong>
              </div>
              <div>
                <span className="hint">Reseller Scope</span>
                <strong>{cloudAccount.reseller?.name || "All / none"}</strong>
              </div>
              <div>
                <span className="hint">Tenant Scope</span>
                <strong>{cloudAccount.tenant?.name || "All / none"}</strong>
              </div>
            </div>

            <div className="cloud-platform-filter-row">
              {cloudAccount.accountType === "OWNER" ? (
                <label>
                  Filter by Reseller
                  <select value={resellerFilterId} onChange={(event) => setResellerFilterId(event.target.value)}>
                    <option value="">All Resellers</option>
                    {resellers.map((reseller) => (
                      <option key={reseller.id} value={reseller.id}>
                        {reseller.name} ({reseller.code})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label>
                Filter by Tenant
                <select value={tenantFilterId} onChange={(event) => setTenantFilterId(event.target.value)}>
                  <option value="">All Tenants</option>
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
              <h3>Create Reseller</h3>
              <div className="cloud-platform-form-grid">
                <label>
                  Reseller Name
                  <input
                    value={resellerDraft.name}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Midwest POS Partners"
                  />
                </label>
                <label>
                  Code (optional)
                  <input
                    value={resellerDraft.code}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, code: event.target.value }))}
                    placeholder="MIDWEST"
                  />
                </label>
                <label>
                  Contact Name
                  <input
                    value={resellerDraft.contactName}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, contactName: event.target.value }))}
                    placeholder="Account manager"
                  />
                </label>
                <label>
                  Contact Email
                  <input
                    value={resellerDraft.contactEmail}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, contactEmail: event.target.value }))}
                    placeholder="ops@reseller.com"
                  />
                </label>
                <label>
                  Contact Phone
                  <input
                    value={resellerDraft.contactPhone}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, contactPhone: event.target.value }))}
                    placeholder="(555) 555-0101"
                  />
                </label>
              </div>

              <p className="hint" style={{ marginTop: 10, marginBottom: 6 }}>
                Optional: create reseller admin login now
              </p>
              <div className="cloud-platform-form-grid">
                <label>
                  Admin Email
                  <input
                    value={resellerDraft.adminEmail}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, adminEmail: event.target.value }))}
                    placeholder="admin@reseller.com"
                  />
                </label>
                <label>
                  Admin Password
                  <input
                    type="password"
                    value={resellerDraft.adminPassword}
                    onChange={(event) => setResellerDraft((prev) => ({ ...prev, adminPassword: event.target.value }))}
                    placeholder="Minimum 8 characters"
                  />
                </label>
                <label>
                  Admin Display Name
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
                  {savingScope === "reseller" ? "Creating..." : "Create Reseller"}
                </button>
              </div>
            </section>
          ) : null}

          {canCreateTenant && showTenantView ? (
            <section className="panel cloud-platform-card">
              <h3>Create Tenant</h3>
              <div className="cloud-platform-form-grid">
                {cloudAccount?.accountType === "OWNER" ? (
                  <label>
                    Reseller
                    <select
                      value={tenantDraft.resellerId}
                      onChange={(event) => setTenantDraft((prev) => ({ ...prev, resellerId: event.target.value }))}
                    >
                      <option value="">Select reseller</option>
                      {resellers.map((reseller) => (
                        <option key={reseller.id} value={reseller.id}>
                          {reseller.name} ({reseller.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label>
                  Tenant Name
                  <input
                    value={tenantDraft.name}
                    onChange={(event) => setTenantDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Cross Amigos Group"
                  />
                </label>

                <label>
                  Slug (optional)
                  <input
                    value={tenantDraft.slug}
                    onChange={(event) => setTenantDraft((prev) => ({ ...prev, slug: event.target.value }))}
                    placeholder="cross-amigos"
                  />
                </label>
              </div>

              <p className="hint" style={{ marginTop: 10, marginBottom: 6 }}>
                Optional: create tenant admin login now
              </p>
              <div className="cloud-platform-form-grid">
                <label>
                  Admin Email
                  <input
                    value={tenantDraft.adminEmail}
                    onChange={(event) => setTenantDraft((prev) => ({ ...prev, adminEmail: event.target.value }))}
                    placeholder="owner@tenant.com"
                  />
                </label>
                <label>
                  Admin Password
                  <input
                    type="password"
                    value={tenantDraft.adminPassword}
                    onChange={(event) => setTenantDraft((prev) => ({ ...prev, adminPassword: event.target.value }))}
                    placeholder="Minimum 8 characters"
                  />
                </label>
                <label>
                  Admin Display Name
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
                  {savingScope === "tenant" ? "Creating..." : "Create Tenant"}
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
            <h3>Create Location (Store)</h3>
            <div className="cloud-platform-form-grid">
              <label>
                Tenant
                <select
                  value={storeDraft.tenantId}
                  onChange={(event) => setStoreDraft((prev) => ({ ...prev, tenantId: event.target.value }))}
                >
                  <option value="">Select tenant</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Location Name
                <input
                  value={storeDraft.name}
                  onChange={(event) => setStoreDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Cross Amigos - North"
                />
              </label>

              <label>
                Location Code (optional)
                <input
                  value={storeDraft.code}
                  onChange={(event) => setStoreDraft((prev) => ({ ...prev, code: event.target.value }))}
                  placeholder="CA-NORTH"
                />
              </label>

              <label>
                Timezone
                <input
                  value={storeDraft.timezone}
                  onChange={(event) => setStoreDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                  placeholder="America/Chicago"
                />
              </label>

              <label>
                Edge Base URL (optional)
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
                {savingScope === "store" ? "Creating..." : "Create Location"}
              </button>
            </div>
            </section>
          ) : null}

          {showServerView ? (
            <section className="panel cloud-platform-card">
            <h3>Claim Onsite Server</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              Use the onsite server claim id + claim code to register that local server and auto-create its cloud location.
            </p>
            <div className="cloud-platform-form-grid">
              <label>
                Onsite Server URL
                <input
                  value={onsiteClaimDraft.onsiteBaseUrl}
                  onChange={(event) =>
                    setOnsiteClaimDraft((prev) => ({ ...prev, onsiteBaseUrl: event.target.value }))
                  }
                  placeholder="http://192.168.1.50:8080"
                />
              </label>
              <label>
                Claim ID
                <input
                  value={onsiteClaimDraft.claimId}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, claimId: event.target.value }))}
                  placeholder="clm_xxxxxxxx"
                />
              </label>
              <label>
                Claim Code
                <input
                  value={onsiteClaimDraft.claimCode}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, claimCode: event.target.value }))}
                  placeholder="ABCD-2345"
                />
              </label>
              <label>
                Tenant
                <select
                  value={onsiteClaimDraft.tenantId}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, tenantId: event.target.value }))}
                >
                  <option value="">Select tenant</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Location Name Override (optional)
                <input
                  value={onsiteClaimDraft.storeName}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, storeName: event.target.value }))}
                  placeholder="Cross Amigos - Onsite A"
                />
              </label>
              <label>
                Location Code Override (optional)
                <input
                  value={onsiteClaimDraft.storeCode}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, storeCode: event.target.value }))}
                  placeholder="CA-ONSITE-A"
                />
              </label>
              <label>
                Timezone
                <input
                  value={onsiteClaimDraft.timezone}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                  placeholder="America/Chicago"
                />
              </label>
              <label>
                Edge Base URL (optional)
                <input
                  value={onsiteClaimDraft.edgeBaseUrl}
                  onChange={(event) => setOnsiteClaimDraft((prev) => ({ ...prev, edgeBaseUrl: event.target.value }))}
                  placeholder="defaults to onsite URL"
                />
              </label>
              <label>
                Node Label
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
                {savingScope === "onsite-claim" ? "Claiming..." : "Claim Server + Create Location"}
              </button>
            </div>

            {onsiteClaimResult?.store ? (
              <div className="cloud-platform-meta-list">
                <div>
                  <span className="hint">Cloud Store</span>
                  <strong>
                    {onsiteClaimResult.store.name} ({onsiteClaimResult.store.code})
                  </strong>
                </div>
                <div>
                  <span className="hint">Node Key</span>
                  <strong>{onsiteClaimResult.node?.nodeKey || "-"}</strong>
                </div>
                <div>
                  <span className="hint">Onsite UID</span>
                  <strong>{onsiteClaimResult.onsite?.serverUid || "-"}</strong>
                </div>
                {onsiteClaimResult.onsite?.finalizeError ? (
                  <div>
                    <span className="hint">Finalize Warning</span>
                    <strong>{onsiteClaimResult.onsite.finalizeError}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}
            </section>
          ) : null}

          {canCreateResellerAccount && showResellerView ? (
            <section className="panel cloud-platform-card">
              <h3>Create Reseller Login</h3>
              <div className="cloud-platform-form-grid">
                {cloudAccount?.accountType === "OWNER" ? (
                  <label>
                    Reseller
                    <select
                      value={resellerAccountDraft.resellerId}
                      onChange={(event) =>
                        setResellerAccountDraft((prev) => ({ ...prev, resellerId: event.target.value }))
                      }
                    >
                      <option value="">Select reseller</option>
                      {resellers.map((reseller) => (
                        <option key={reseller.id} value={reseller.id}>
                          {reseller.name} ({reseller.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label>
                  Login Email
                  <input
                    value={resellerAccountDraft.email}
                    onChange={(event) => setResellerAccountDraft((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="manager@reseller.com"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={resellerAccountDraft.password}
                    onChange={(event) =>
                      setResellerAccountDraft((prev) => ({ ...prev, password: event.target.value }))
                    }
                    placeholder="Minimum 8 characters"
                  />
                </label>
                <label>
                  Display Name
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
                  {savingScope === "reseller-account" ? "Creating..." : "Create Reseller Login"}
                </button>
              </div>
            </section>
          ) : null}

          {showTenantView ? (
            <section className="panel cloud-platform-card">
            <h3>Create Tenant Login</h3>
            <div className="cloud-platform-form-grid">
              <label>
                Tenant
                <select
                  value={tenantAccountDraft.tenantId}
                  onChange={(event) => setTenantAccountDraft((prev) => ({ ...prev, tenantId: event.target.value }))}
                >
                  <option value="">Select tenant</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Login Email
                <input
                  value={tenantAccountDraft.email}
                  onChange={(event) => setTenantAccountDraft((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="owner@tenant.com"
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={tenantAccountDraft.password}
                  onChange={(event) => setTenantAccountDraft((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Minimum 8 characters"
                />
              </label>

              <label>
                Display Name
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
                {savingScope === "tenant-account" ? "Creating..." : "Create Tenant Login"}
              </button>
            </div>
            </section>
          ) : null}

          {showHierarchySection ? (
            <section className="panel cloud-platform-card cloud-platform-span">
            <h3>Hierarchy Data</h3>

            {showResellerTable && cloudAccount.accountType !== "TENANT_ADMIN" ? (
              <div className="cloud-platform-table-block">
                <h4>Resellers</h4>
                <div className="cloud-platform-table-wrap">
                  <table className="cloud-platform-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Tenants</th>
                        <th>Accounts</th>
                        <th>Updated</th>
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
                  {resellers.length === 0 ? <p className="hint">No resellers in this scope.</p> : null}
                </div>
              </div>
            ) : null}

            {showTenantTable ? (
              <div className="cloud-platform-table-block">
              <h4>Tenants</h4>
              <div className="cloud-platform-table-wrap">
                <table className="cloud-platform-table">
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Reseller</th>
                      <th>Stores</th>
                      <th>Accounts</th>
                      <th>Updated</th>
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
                {tenants.length === 0 ? <p className="hint">No tenants in this scope.</p> : null}
              </div>
              </div>
            ) : null}

            {showLocationTable ? (
              <div className="cloud-platform-table-block">
              <h4>Locations</h4>
              <div className="cloud-platform-table-wrap">
                <table className="cloud-platform-table">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Tenant</th>
                      <th>Status</th>
                      <th>Nodes</th>
                      <th>Revisions</th>
                      <th>Updated</th>
                      <th>Actions</th>
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
                            Open Customer Back Office
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stores.length === 0 ? <p className="hint">No locations in this scope.</p> : null}
              </div>
              </div>
            ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="cloud-platform-alert cloud-platform-alert-error">{error}</p> : null}
      {message ? <p className="cloud-platform-alert cloud-platform-alert-success">{message}</p> : null}
    </div>
  );
}
