import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";

type PermissionMap = Record<string, boolean>;

type SessionUser = {
  id: string;
  username: string;
  roleId: string;
  displayName?: string | null;
  language?: "en" | "es";
  permissions?: PermissionMap;
};

type SessionState = {
  token: string;
  user: SessionUser;
  issuedAt: string;
};

type LoginResponse = {
  token: string;
  user: SessionUser;
};

type AuthMode = "pin" | "password";
type ScreenMode = "home" | "recall" | "order";
type OrderType = "DINE_IN" | "TAKEOUT" | "DELIVERY";
type RecallScope = "mine" | "all";

type MenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
  color?: string | null;
  visible?: boolean;
};

type MenuGroup = {
  id: string;
  name: string;
  categoryId: string;
  sortOrder?: number | null;
  visible?: boolean;
};

type MenuItem = {
  id: string;
  name: string;
  price: string;
  categoryId: string | null;
  groupId: string | null;
  visible?: boolean;
};

type DiningTable = {
  id: string;
  name: string;
  status: string;
  areaId: string | null;
  posX?: number | null;
  posY?: number | null;
  shape?: string | null;
  capacity?: number | null;
};

type TableArea = {
  id: string;
  name: string;
  sortOrder: number;
};

type Discount = {
  id: string;
  name: string;
};

type Modifier = {
  id: string;
  name: string;
  price: string;
};

type ModifierGroupLink = {
  id: string;
  minRequired: number | null;
  maxAllowed: number | null;
  group: {
    id: string;
    name: string;
    modifiers: Modifier[];
  };
};

type OrderDetail = {
  id: string;
  ticketNumber?: number | null;
  orderNumber?: number | null;
  status: string;
  orderType: string;
  table: { id: string; name: string } | null;
  customerName: string | null;
  numberOfGuests: number | null;
  taxExempt: boolean | null;
  serviceCharge: number | string | null;
  deliveryCharge: number | string | null;
  subtotalAmount?: number | string | null;
  taxAmount?: number | string | null;
  totalAmount?: number | string | null;
  dueAmount?: number | string | null;
  legacyPayload?: unknown;
  items: Array<{
    id: string;
    menuItemId?: string | null;
    name: string | null;
    quantity: number;
    price: string;
    notes?: string | null;
    modifiers?: Array<{
      id: string;
      modifierId?: string;
      quantity: number;
      price: string;
      customName?: string | null;
      modifier: { name: string };
    }>;
  }>;
};

type ServiceFlags = {
  dineIn: boolean;
  takeOut: boolean;
  delivery: boolean;
};

type PaymentDraft = {
  method: string;
  amount: string;
  tenderAmount: string;
  tipAmount: string;
  printReceipt: boolean;
};

type OrderDraft = {
  customerName: string;
  numberOfGuests: string;
  taxExempt: boolean;
  serviceCharge: string;
  deliveryCharge: string;
};

type TableCheck = {
  id: string;
  table?: { id: string; name: string } | null;
  tableId?: string | null;
  ticketNumber?: number | null;
  orderNumber?: number | null;
  status: string;
  orderType: string;
  updatedAt?: string;
  items?: Array<{ id: string }>;
};

type DiscoveredServer = {
  url: string;
  host: string;
  port: number;
};

type ModifierDraftMode = "ADD" | "NO" | "NOTE";

type CustomModifierDraft = {
  id: string;
  label: string;
  price: number;
};

const STORAGE_SERVER_URL = "websys_server_mobile_url";
const STORAGE_SESSION = "websys_server_mobile_session";
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const EMPTY_TICKET_MESSAGE = "You cannot save a ticket without items. Add at least one item first.";
const CATEGORY_COLOR_FALLBACKS = [
  "#3b82f6",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#22c55e",
  "#ec4899",
  "#06b6d4"
];
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function isLoopbackHost(host: string) {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1";
}

function normalizeServerUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `http://${normalized}`;
}

function extractHostFromHostUri(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const base = withoutProtocol.split("/")[0] || "";
  const host = base.split(":")[0] || "";
  return host.trim() || null;
}

function inferExpoDevServerUrl() {
  const envUrl = normalizeServerUrl(
    process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_SERVER_URL || ""
  );
  if (envUrl) return envUrl;

  const scriptUrl =
    (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL ?? null;
  let host = extractHostFromHostUri(scriptUrl);
  if (!host && scriptUrl) {
    const match = scriptUrl.match(/^https?:\/\/([^/:]+)/i);
    host = match?.[1] ?? null;
  }
  if (!host) return "http://localhost:8080";

  if (isIpv4Address(host) && !isLoopbackHost(host)) {
    return `http://${host}:8080`;
  }
  return "http://localhost:8080";
}

const DEFAULT_SERVER_URL = inferExpoDevServerUrl();

function normalizeHexColor(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const shortMatch = trimmed.match(/^#([a-f0-9]{3})$/i);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const longMatch = trimmed.match(/^#([a-f0-9]{6})$/i);
  if (longMatch) return `#${longMatch[1].toLowerCase()}`;
  return null;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = normalizeHexColor(hex) ?? "#3b82f6";
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function categoryChipTone(category: MenuCategory, index: number, active: boolean) {
  const accent = normalizeHexColor(category.color) ?? CATEGORY_COLOR_FALLBACKS[index % CATEGORY_COLOR_FALLBACKS.length];
  if (active) {
    return {
      backgroundColor: accent,
      borderColor: hexToRgba(accent, 0.95),
      textColor: "#f8fbff"
    };
  }
  return {
    backgroundColor: hexToRgba(accent, 0.22),
    borderColor: hexToRgba(accent, 0.6),
    textColor: accent
  };
}

function toNumber(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return `$${toNumber(value).toFixed(2)}`;
}

function isSessionWithinWindow(issuedAt: string | null | undefined) {
  if (!issuedAt) return false;
  const issuedAtMs = Date.parse(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;
  return Date.now() - issuedAtMs < SESSION_WINDOW_MS;
}

function formatDateTime(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) return value;
  return parsed.toLocaleString();
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) return "Unknown";
  const diffMs = Date.now() - parsed.valueOf();
  if (diffMs < 45_000) return "Just now";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hr ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

function ticketLabel(order: { id: string; ticketNumber?: number | null; orderNumber?: number | null }) {
  if (typeof order.ticketNumber === "number") return `#${order.ticketNumber}`;
  if (typeof order.orderNumber === "number") return `Order ${order.orderNumber}`;
  return order.id.slice(0, 6);
}

function orderTypeLabel(orderType: string) {
  if (orderType === "DINE_IN") return "Dine In";
  if (orderType === "TAKEOUT") return "Take Out";
  if (orderType === "DELIVERY") return "Delivery";
  return orderType;
}

function getDueAmount(order: OrderDetail | null) {
  if (!order) return 0;
  const due = toNumber(order.dueAmount);
  if (due > 0) return due;
  return toNumber(order.totalAmount);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tableStatusTone(status: string) {
  if (status === "AVAILABLE") return "#1b68e4";
  if (status === "SEATED") return "#1e9447";
  if (status === "RESERVED") return "#a66a20";
  if (status === "DIRTY") return "#a83039";
  return "#4a5f86";
}

function recallStatusTone(status: string) {
  if (status === "OPEN") return "#83decc";
  if (status === "SENT") return "#9fb4db";
  if (status === "HOLD") return "#e2b670";
  return "#b8c8e8";
}

function recallBadgeLabel(entry: TableCheck) {
  const tableName = entry.table?.name?.trim();
  if (tableName) return tableName.slice(0, 3).toUpperCase();
  if (entry.orderType === "TAKEOUT") return "TO";
  if (entry.orderType === "DELIVERY") return "DL";
  return "TK";
}

function tableCheckItemCount(entry: TableCheck) {
  return Array.isArray(entry.items) ? entry.items.length : 0;
}

function extractSentItemIds(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [] as string[];
  const raw = (payload as { sentItemIds?: unknown }).sentItemIds;
  if (!Array.isArray(raw)) return [] as string[];
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function toLookup(ids: string[]) {
  return ids.reduce<Record<string, true>>((acc, id) => {
    acc[id] = true;
    return acc;
  }, {});
}

function requiredCount(value: number | null | undefined) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

function maxCount(value: number | null | undefined) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count) || count <= 0) return null;
  return Math.floor(count);
}

function isIpv4Address(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function subnetPrefixFromIpv4(value: string) {
  if (!isIpv4Address(value)) return null;
  const parts = value.split(".");
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function isPrivateIpv4(value: string) {
  if (!isIpv4Address(value)) return false;
  const [a, b] = value.split(".").map((entry) => Number(entry));
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function parseHostPort(value: string) {
  try {
    const parsed = new URL(normalizeServerUrl(value));
    const protocolPort = parsed.protocol === "https:" ? 443 : 80;
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : protocolPort
    };
  } catch {
    return null;
  }
}

async function probePosServer(baseUrl: string, timeoutMs = 850) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    if (!response.ok) return false;
    const payload = (await response.json().catch(() => null)) as { ok?: unknown } | null;
    return payload?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const maxWorkers = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  const workers = Array.from({ length: maxWorkers }, async () => {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      await worker(items[current]);
    }
  });
  await Promise.all(workers);
}

async function requestJson<T>(baseUrl: string, path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal
    });
    const raw = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    let parsed: unknown = raw;
    if (raw && isJson) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      if (typeof parsed === "string" && parsed.trim().length > 0) {
        message = parsed;
      } else if (parsed && typeof parsed === "object") {
        const maybe = parsed as Record<string, unknown>;
        const detail = maybe.message ?? maybe.error;
        if (typeof detail === "string" && detail.trim().length > 0) {
          message = detail;
        }
      }
      throw new Error(message);
    }

    if (isJson) {
      if (!raw) return {} as T;
      return JSON.parse(raw) as T;
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out. Check network and server URL.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function authHeaders(session: SessionState) {
  return {
    Authorization: `Bearer ${session.token}`,
    "x-user-id": session.user.id
  };
}

export default function App() {
  const occupiedBlink = useRef(new Animated.Value(1)).current;

  const [booting, setBooting] = useState(true);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [session, setSession] = useState<SessionState | null>(null);

  const [authMode, setAuthMode] = useState<AuthMode>("pin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [pinLockRequired, setPinLockRequired] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMessage, setDiscoverMessage] = useState<string | null>(null);
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);

  const [screen, setScreen] = useState<ScreenMode>("home");
  const [serviceFlags, setServiceFlags] = useState<ServiceFlags>({
    dineIn: true,
    takeOut: true,
    delivery: true
  });
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [tableAreas, setTableAreas] = useState<TableArea[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [modifierLinksByItem, setModifierLinksByItem] = useState<Record<string, ModifierGroupLink[]>>({});
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);

  const [terminalMode, setTerminalMode] = useState<OrderType>("DINE_IN");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string>("");
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);

  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [tableChecks, setTableChecks] = useState<TableCheck[]>([]);
  const [tableOpenItemCounts, setTableOpenItemCounts] = useState<Record<string, number>>({});
  const [lockedModifierItems, setLockedModifierItems] = useState<{
    orderId: string | null;
    itemIds: Record<string, true>;
  }>({ orderId: null, itemIds: {} });
  const [tablePickerMessage, setTablePickerMessage] = useState<string | null>(null);

  const [recallScope, setRecallScope] = useState<RecallScope>("all");
  const [recallSearch, setRecallSearch] = useState("");
  const [recallOrders, setRecallOrders] = useState<TableCheck[]>([]);
  const [recallLoading, setRecallLoading] = useState(false);
  const [lastDataSyncAt, setLastDataSyncAt] = useState<string | null>(null);
  const [lastRecallSyncAt, setLastRecallSyncAt] = useState<string | null>(null);

  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [selectedDiscountId, setSelectedDiscountId] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);

  const [splitSelection, setSplitSelection] = useState<Record<string, boolean>>({});
  const [voidReason, setVoidReason] = useState("");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const [orderDraft, setOrderDraft] = useState<OrderDraft>({
    customerName: "",
    numberOfGuests: "",
    taxExempt: false,
    serviceCharge: "",
    deliveryCharge: ""
  });

  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>({
    method: "CASH",
    amount: "",
    tenderAmount: "",
    tipAmount: "",
    printReceipt: true
  });

  const [modifierModal, setModifierModal] = useState<{
    orderItemId: string;
    itemName: string;
    links: ModifierGroupLink[];
    selected: Record<string, string[]>;
    initialSelected: Record<string, string[]>;
  } | null>(null);
  const [modifierValidationMessage, setModifierValidationMessage] = useState<string | null>(null);
  const [modifierItemNote, setModifierItemNote] = useState("");
  const [modifierDraftMode, setModifierDraftMode] = useState<ModifierDraftMode>("ADD");
  const [modifierDraftName, setModifierDraftName] = useState("");
  const [modifierDraftPrice, setModifierDraftPrice] = useState("");
  const [customModifierDrafts, setCustomModifierDrafts] = useState<CustomModifierDraft[]>([]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(occupiedBlink, {
          toValue: 0.45,
          duration: 620,
          useNativeDriver: true
        }),
        Animated.timing(occupiedBlink, {
          toValue: 1,
          duration: 620,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [occupiedBlink]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const values = await AsyncStorage.multiGet([STORAGE_SERVER_URL, STORAGE_SESSION]);
        if (!active) return;
        const storedUrlRaw = values.find(([key]) => key === STORAGE_SERVER_URL)?.[1];
        const storedSession = values.find(([key]) => key === STORAGE_SESSION)?.[1];
        const storedUrl = normalizeServerUrl(storedUrlRaw || "");
        const envPinnedUrl = normalizeServerUrl(
          process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_SERVER_URL || ""
        );

        let nextServerUrl = storedUrl || DEFAULT_SERVER_URL;
        if (envPinnedUrl) {
          nextServerUrl = envPinnedUrl;
        } else if (storedUrl) {
          const parsedStored = parseHostPort(storedUrl);
          if (
            parsedStored &&
            isLoopbackHost(parsedStored.host) &&
            DEFAULT_SERVER_URL &&
            DEFAULT_SERVER_URL !== storedUrl &&
            Platform.OS !== "web"
          ) {
            nextServerUrl = DEFAULT_SERVER_URL;
          }
        }

        if (nextServerUrl) {
          setServerUrl(nextServerUrl);
          if (!storedUrl || storedUrl !== nextServerUrl) {
            await AsyncStorage.setItem(STORAGE_SERVER_URL, nextServerUrl);
          }
        }
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession) as Partial<SessionState>;
            const hasToken = typeof parsed?.token === "string" && parsed.token.trim().length > 0;
            const hasUserId = typeof parsed?.user?.id === "string" && parsed.user.id.trim().length > 0;
            if (hasToken && hasUserId) {
              const issuedAt =
                typeof parsed.issuedAt === "string" && parsed.issuedAt.trim().length > 0
                  ? parsed.issuedAt
                  : new Date().toISOString();
              if (isSessionWithinWindow(issuedAt)) {
                const restoredSession: SessionState = {
                  token: parsed.token!,
                  user: parsed.user as SessionUser,
                  issuedAt
                };
                setSession(restoredSession);
                if (parsed.issuedAt !== issuedAt) {
                  await AsyncStorage.setItem(STORAGE_SESSION, JSON.stringify(restoredSession));
                }
              } else {
                await AsyncStorage.removeItem(STORAGE_SESSION);
                setPinLockRequired(true);
                setAuthMode("pin");
              }
            }
          } catch {
            await AsyncStorage.removeItem(STORAGE_SESSION);
          }
        }
      } finally {
        if (active) setBooting(false);
      }
    })().catch(() => {
      if (active) setBooting(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    if (!isSessionWithinWindow(session.issuedAt)) {
      setSession(null);
      setPinLockRequired(true);
      setAuthMode("pin");
      void AsyncStorage.removeItem(STORAGE_SESSION);
      return;
    }
    const issuedAtMs = Date.parse(session.issuedAt);
    if (!Number.isFinite(issuedAtMs)) return;
    const remainingMs = Math.max(0, SESSION_WINDOW_MS - (Date.now() - issuedAtMs));
    const timer = setTimeout(() => {
      setSession(null);
      setPinLockRequired(true);
      setAuthMode("pin");
      void AsyncStorage.removeItem(STORAGE_SESSION);
    }, remainingMs);
    return () => clearTimeout(timer);
  }, [session]);

  const loadBootstrapData = useCallback(async () => {
    if (!session) return;
    setLoadingBootstrap(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      const headers = authHeaders(session);
      const [cats, grp, menuItems, tableList, areaList, discountList, serviceSetting] = await Promise.all([
        requestJson<MenuCategory[]>(baseUrl, "/menu/categories", { headers }),
        requestJson<MenuGroup[]>(baseUrl, "/menu/groups", { headers }),
        requestJson<MenuItem[]>(baseUrl, "/menu/items", { headers }),
        requestJson<DiningTable[]>(baseUrl, "/tables", { headers }),
        requestJson<TableArea[]>(baseUrl, "/table-areas", { headers }),
        requestJson<Discount[]>(baseUrl, "/discounts", { headers }),
        requestJson<{ value?: ServiceFlags }>(baseUrl, "/settings/services", { headers }).catch(
          () => ({ value: undefined })
        )
      ]);

      setCategories(cats);
      setGroups(grp);
      setItems(menuItems);
      setTables(tableList);
      setTableAreas(areaList);
      setDiscounts(discountList);
      setSelectedDiscountId(discountList[0]?.id || "");
      setServiceFlags({
        dineIn: serviceSetting?.value?.dineIn !== false,
        takeOut: serviceSetting?.value?.takeOut !== false,
        delivery: serviceSetting?.value?.delivery !== false
      });
      const firstCat = cats.find((c) => c.visible !== false) ?? cats[0];
      setActiveCategoryId(firstCat?.id ?? null);
      if (firstCat) {
        const firstGroup = grp.find((entry) => entry.categoryId === firstCat.id && entry.visible !== false);
        setActiveGroupId(firstGroup?.id ?? "");
      }
      setLastDataSyncAt(new Date().toISOString());
      await AsyncStorage.setItem(STORAGE_SERVER_URL, baseUrl);
      if (baseUrl !== serverUrl) {
        setServerUrl(baseUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load menu and tables.";
      setAlertMessage(message);
    } finally {
      setLoadingBootstrap(false);
    }
  }, [serverUrl, session]);

  const loadOrder = useCallback(
    async (id: string) => {
      if (!session) return;
      setOrderLoading(true);
      try {
        const baseUrl = normalizeServerUrl(serverUrl);
        const next = await requestJson<OrderDetail>(baseUrl, `/orders/${id}`, { headers: authHeaders(session) });
        setLockedModifierItems((prev) => {
          const sentItemIds = extractSentItemIds(next.legacyPayload);
          if (prev.orderId !== id) {
            if (sentItemIds.length > 0) {
              return { orderId: id, itemIds: toLookup(sentItemIds) };
            }
            if (next.status === "SENT") {
              return { orderId: id, itemIds: toLookup(next.items.map((item) => item.id)) };
            }
            return { orderId: id, itemIds: {} };
          }
          if (Object.keys(prev.itemIds).length === 0) {
            if (sentItemIds.length > 0) {
              return { orderId: id, itemIds: toLookup(sentItemIds) };
            }
            if (next.status === "SENT") {
              return { orderId: id, itemIds: toLookup(next.items.map((item) => item.id)) };
            }
          }
          return { orderId: id, itemIds: prev.itemIds };
        });
        setOrder(next);
        setOrderId(id);
        setTerminalMode((next.orderType as OrderType) || "DINE_IN");
        setOrderDraft({
          customerName: next.customerName || "",
          numberOfGuests: next.numberOfGuests ? String(next.numberOfGuests) : "",
          taxExempt: Boolean(next.taxExempt),
          serviceCharge: next.serviceCharge ? String(next.serviceCharge) : "",
          deliveryCharge: next.deliveryCharge ? String(next.deliveryCharge) : ""
        });
        setScreen("order");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load order.";
        setAlertMessage(message);
      } finally {
        setOrderLoading(false);
      }
    },
    [serverUrl, session]
  );

  const clearOrderState = useCallback(() => {
    setOrderId(null);
    setOrder(null);
    setLockedModifierItems({ orderId: null, itemIds: {} });
    setSplitSelection({});
    setVoidReason("");
    setShowPaymentModal(false);
    setShowSplitModal(false);
    setShowVoidModal(false);
    setShowDiscountModal(false);
    setModifierModal(null);
    setModifierValidationMessage(null);
    setModifierItemNote("");
    setModifierDraftMode("ADD");
    setModifierDraftName("");
    setModifierDraftPrice("");
    setCustomModifierDrafts([]);
    setOrderDraft({
      customerName: "",
      numberOfGuests: "",
      taxExempt: false,
      serviceCharge: "",
      deliveryCharge: ""
    });
    setPaymentDraft({
      method: "CASH",
      amount: "",
      tenderAmount: "",
      tipAmount: "",
      printReceipt: true
    });
  }, []);

  const refreshRecallOrders = useCallback(async (scopeOverride?: RecallScope) => {
    if (!session) return;
    setRecallLoading(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      const scope = scopeOverride ?? recallScope;
      const scopeQuery = scope === "mine" ? `&serverId=${encodeURIComponent(session.user.id)}` : "";
      const orders = await requestJson<TableCheck[]>(
        baseUrl,
        `/orders/open?status=OPEN,SENT,HOLD${scopeQuery}`,
        { headers: authHeaders(session) }
      );
      setRecallOrders(orders);
      setLastRecallSyncAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load open orders.";
      setAlertMessage(message);
    } finally {
      setRecallLoading(false);
    }
  }, [recallScope, serverUrl, session]);

  const refreshTableOpenItemCounts = useCallback(async () => {
    if (!session) return;
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      const openOrders = await requestJson<TableCheck[]>(baseUrl, "/orders/open?status=OPEN,SENT,HOLD", {
        headers: authHeaders(session)
      });
      const counts = openOrders.reduce<Record<string, number>>((acc, entry) => {
        const tableId = entry.table?.id || entry.tableId;
        if (!tableId) return acc;
        const itemCount = tableCheckItemCount(entry);
        if (itemCount <= 0) return acc;
        acc[tableId] = (acc[tableId] || 0) + 1;
        return acc;
      }, {});
      setTableOpenItemCounts(counts);
    } catch {
      // Keep last known table map occupancy on network/API failures.
    }
  }, [serverUrl, session]);

  useEffect(() => {
    if (!session) return;
    void loadBootstrapData();
    void refreshRecallOrders();
    void refreshTableOpenItemCounts();
  }, [loadBootstrapData, refreshRecallOrders, refreshTableOpenItemCounts, session]);

  useEffect(() => {
    if (!activeCategoryId) return;
    const nextGroup = groups.find((entry) => entry.categoryId === activeCategoryId && entry.visible !== false);
    setActiveGroupId(nextGroup?.id ?? "");
  }, [activeCategoryId, groups]);

  const createOrder = useCallback(
    async (orderType: OrderType, tableId?: string) => {
      if (!session) return null;
      const baseUrl = normalizeServerUrl(serverUrl);
      const payload: Record<string, unknown> = {
        orderType,
        serverId: session.user.id
      };
      if (tableId) {
        payload.tableId = tableId;
      }
      if (orderType === "DELIVERY" && orderDraft.customerName.trim().length > 0) {
        payload.customerName = orderDraft.customerName.trim();
      }
      if (orderType === "DELIVERY" && orderDraft.numberOfGuests.trim().length > 0) {
        payload.numberOfGuests = Number(orderDraft.numberOfGuests);
      }
      if (orderDraft.taxExempt) {
        payload.taxExempt = true;
      }
      if (orderDraft.serviceCharge.trim().length > 0) {
        payload.serviceCharge = Number(orderDraft.serviceCharge);
      }
      if (orderDraft.deliveryCharge.trim().length > 0) {
        payload.deliveryCharge = Number(orderDraft.deliveryCharge);
      }

      const created = await requestJson<{ id: string }>(baseUrl, "/orders", {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      return created.id;
    },
    [orderDraft, serverUrl, session]
  );

  const startNewTicket = useCallback(
    async (mode: OrderType) => {
      if (busy || !session) return;
      if (mode === "DINE_IN" && !serviceFlags.dineIn) {
        setAlertMessage("Dine In service is disabled.");
        return;
      }
      if (mode === "TAKEOUT" && !serviceFlags.takeOut) {
        setAlertMessage("Take Out service is disabled.");
        return;
      }
      if (mode === "DELIVERY" && !serviceFlags.delivery) {
        setAlertMessage("Delivery service is disabled.");
        return;
      }

      clearOrderState();
      setSelectedTableId("");
      setTableChecks([]);
      setTablePickerMessage(null);
      setTerminalMode(mode);
      if (mode === "DINE_IN") {
        setTablePickerOpen(true);
        void refreshTableOpenItemCounts();
        setScreen("order");
        return;
      }
      setTablePickerOpen(false);
      setScreen("order");
    },
    [busy, clearOrderState, refreshTableOpenItemCounts, serviceFlags, session]
  );

  const onSelectTable = useCallback(
    async (tableId: string) => {
      setSelectedTableId(tableId);
      setTablePickerMessage(null);
      if (!session) return;
      try {
        const baseUrl = normalizeServerUrl(serverUrl);
        const openOrders = await requestJson<TableCheck[]>(baseUrl, "/orders/open?status=OPEN,SENT,HOLD", {
          headers: authHeaders(session)
        });
        const occupancy = openOrders.reduce<Record<string, number>>((acc, entry) => {
          const openTableId = entry.table?.id || entry.tableId;
          if (!openTableId) return acc;
          const itemCount = tableCheckItemCount(entry);
          if (itemCount <= 0) return acc;
          acc[openTableId] = (acc[openTableId] || 0) + 1;
          return acc;
        }, {});
        setTableOpenItemCounts(occupancy);
        const checks = openOrders
          .filter((entry) => tableCheckItemCount(entry) > 0)
          .filter((entry) => entry.table?.id === tableId || entry.tableId === tableId)
          .sort((a, b) => {
            const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
            const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
            return bt - at;
          });
        setTableChecks(checks);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load table checks.";
        setAlertMessage(message);
      }
    },
    [serverUrl, session]
  );

  const exitDineInTablePicker = useCallback((showMissingTableMessage: boolean) => {
    setTablePickerOpen(false);
    setTablePickerMessage(null);
    setSelectedTableId("");
    setTableChecks([]);
    clearOrderState();
    setScreen("home");
    if (showMissingTableMessage) {
      setAlertMessage("You need to first select a table.");
    }
  }, [clearOrderState]);

  const confirmTableForNewTicket = useCallback(() => {
    if (!selectedTableId) {
      exitDineInTablePicker(true);
      return;
    }
    setTablePickerOpen(false);
  }, [exitDineInTablePicker, selectedTableId]);

  const newCheckFromExisting = useCallback(async () => {
    if (!session || !selectedTableId || tableChecks.length === 0) return;
    setBusy(true);
    try {
      const baseOrderId = tableChecks[0].id;
      const baseUrl = normalizeServerUrl(serverUrl);
      const result = await requestJson<{ order: { id: string } }>(baseUrl, `/orders/${baseOrderId}/chain`, {
        method: "POST",
        headers: authHeaders(session)
      });
      setTablePickerOpen(false);
      await loadOrder(result.order.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create new check.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [loadOrder, selectedTableId, serverUrl, session, tableChecks]);

  const loadModifierLinks = useCallback(
    async (menuItemId: string) => {
      if (!session) return [] as ModifierGroupLink[];
      if (modifierLinksByItem[menuItemId]) {
        return modifierLinksByItem[menuItemId];
      }
      const baseUrl = normalizeServerUrl(serverUrl);
      const links = await requestJson<ModifierGroupLink[]>(baseUrl, `/menu/items/${menuItemId}/modifier-groups`, {
        headers: authHeaders(session)
      });
      setModifierLinksByItem((prev) => ({ ...prev, [menuItemId]: links }));
      return links;
    },
    [modifierLinksByItem, serverUrl, session]
  );

  const ensureOrderForAddItem = useCallback(async () => {
    if (orderId) return orderId;
    if (terminalMode === "DINE_IN") {
      if (!selectedTableId) {
        exitDineInTablePicker(true);
        throw new Error("Table required for dine-in");
      }
      const created = await createOrder("DINE_IN", selectedTableId);
      if (!created) throw new Error("Unable to create order");
      setOrderId(created);
      return created;
    }
    const created = await createOrder(terminalMode);
    if (!created) throw new Error("Unable to create order");
    setOrderId(created);
    return created;
  }, [createOrder, exitDineInTablePicker, orderId, selectedTableId, terminalMode]);

  const closeOrderScreen = useCallback(async () => {
    if (busy) return;
    const currentSession = session;
    const currentOrderId = orderId;
    const currentItemCount = order?.items?.length ?? 0;

    if (currentSession && currentOrderId && currentItemCount === 0) {
      setBusy(true);
      try {
        const baseUrl = normalizeServerUrl(serverUrl);
        await requestJson(baseUrl, `/orders/${currentOrderId}/void`, {
          method: "POST",
          headers: {
            ...authHeaders(currentSession),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ reason: "Discarded empty ticket from mobile app." })
        });
        await Promise.all([refreshRecallOrders().catch(() => null), refreshTableOpenItemCounts().catch(() => null)]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to discard empty ticket.";
        setAlertMessage(message);
        return;
      } finally {
        setBusy(false);
      }
    }

    clearOrderState();
    setScreen("home");
  }, [
    busy,
    clearOrderState,
    order?.items?.length,
    orderId,
    refreshRecallOrders,
    refreshTableOpenItemCounts,
    serverUrl,
    session
  ]);

  const addItemToTicket = useCallback(
    async (item: MenuItem) => {
      if (!session || busy) return;
      setBusy(true);
      try {
        const activeOrderId = await ensureOrderForAddItem();
        const baseUrl = normalizeServerUrl(serverUrl);
        const created = await requestJson<{ id: string }>(baseUrl, `/orders/${activeOrderId}/items`, {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            menuItemId: item.id,
            quantity: 1
          })
        });
        const links = await loadModifierLinks(item.id);
        if (links.length > 0) {
          const selected: Record<string, string[]> = {};
          for (const link of links) {
            selected[link.id] = [];
          }
          setModifierItemNote("");
          setModifierDraftMode("ADD");
          setModifierDraftName("");
          setModifierDraftPrice("");
          setCustomModifierDrafts([]);
          setModifierModal({
            orderItemId: created.id,
            itemName: item.name,
            links,
            selected,
            initialSelected: selected
          });
          setModifierValidationMessage(null);
        } else {
          await loadOrder(activeOrderId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to add item.";
        setAlertMessage(message);
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureOrderForAddItem, loadModifierLinks, loadOrder, serverUrl, session]
  );

  const openModifiersForExistingItem = useCallback(
    async (line: OrderDetail["items"][number]) => {
      if (!session || !orderId || busy) return;
      const isLockedFromSent =
        lockedModifierItems.orderId === orderId && Boolean(lockedModifierItems.itemIds[line.id]);
      if (isLockedFromSent) {
        setAlertMessage("This item was already sent to kitchen. Add a new item to modify it.");
        return;
      }
      if (!line.menuItemId) {
        setAlertMessage("This item does not have modifier options.");
        return;
      }
      setBusy(true);
      try {
        const links = await loadModifierLinks(line.menuItemId);
        const selected: Record<string, string[]> = {};
        for (const link of links) {
          const allowedIds = new Set(link.group.modifiers.map((mod) => mod.id));
          const existingIds = (line.modifiers || [])
            .map((mod) => mod.modifierId)
            .filter((id): id is string => typeof id === "string")
            .filter((id) => allowedIds.has(id));
          selected[link.id] = Array.from(new Set(existingIds));
        }
        setModifierItemNote(line.notes || "");
        setModifierDraftMode("ADD");
        setModifierDraftName("");
        setModifierDraftPrice("");
        setCustomModifierDrafts([]);
        setModifierValidationMessage(null);
        setModifierModal({
          orderItemId: line.id,
          itemName: line.name || "Item",
          links,
          selected,
          initialSelected: selected
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load modifiers.";
        setAlertMessage(message);
      } finally {
        setBusy(false);
      }
    },
    [busy, loadModifierLinks, lockedModifierItems.itemIds, lockedModifierItems.orderId, orderId, session]
  );

  const toggleModifierChoice = useCallback((link: ModifierGroupLink, modifierId: string) => {
    setModifierValidationMessage(null);
    setModifierModal((prev) => {
      if (!prev) return prev;
      const current = prev.selected[link.id] || [];
      const alreadySelected = current.includes(modifierId);
      const maxAllowed = maxCount(link.maxAllowed);

      if (!alreadySelected && maxAllowed !== null && current.length >= maxAllowed) {
        return prev;
      }

      const next = alreadySelected ? current.filter((id) => id !== modifierId) : [...current, modifierId];
      return {
        ...prev,
        selected: { ...prev.selected, [link.id]: next }
      };
    });
  }, []);

  const clearModifierGroupSelection = useCallback((linkId: string) => {
    setModifierValidationMessage(null);
    setModifierModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        selected: { ...prev.selected, [linkId]: [] }
      };
    });
  }, []);

  const addCustomModifierDraft = useCallback(() => {
    const name = modifierDraftName.trim();
    if (!name) {
      setModifierValidationMessage("Enter a modifier name first.");
      return;
    }

    let label = name;
    let price = 0;
    if (modifierDraftMode === "ADD") {
      const parsedPrice = modifierDraftPrice.trim().length === 0 ? 0 : Number(modifierDraftPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        setModifierValidationMessage("Manual modifier price must be 0 or greater.");
        return;
      }
      label = `Add ${name}`;
      price = Number(parsedPrice.toFixed(2));
    } else if (modifierDraftMode === "NO") {
      label = `NO ${name}`;
    } else {
      label = `Note: ${name}`;
    }

    setCustomModifierDrafts((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, label, price }
    ]);
    setModifierValidationMessage(null);
    setModifierDraftName("");
    if (modifierDraftMode === "ADD") {
      setModifierDraftPrice("");
    }
  }, [modifierDraftMode, modifierDraftName, modifierDraftPrice]);

  const removeCustomModifierDraft = useCallback((id: string) => {
    setCustomModifierDrafts((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const applyModifiers = useCallback(async () => {
    if (!modifierModal || !session || !orderId) return;
    const missingRequiredGroups = modifierModal.links.filter((link) => {
      const minRequired = requiredCount(link.minRequired);
      const selectedCount = (modifierModal.selected[link.id] || []).length;
      return selectedCount < minRequired;
    });
    if (missingRequiredGroups.length > 0) {
      const names = missingRequiredGroups.map((link) => link.group.name).join(", ");
      setModifierValidationMessage(`Select required modifiers for: ${names}.`);
      return;
    }

    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      await requestJson(baseUrl, `/orders/${orderId}/items/${modifierModal.orderItemId}`, {
        method: "PATCH",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          notes: modifierItemNote.trim()
        })
      });

      for (const link of modifierModal.links) {
        const selectedIds = modifierModal.selected[link.id] || [];
        const initialIds = new Set(modifierModal.initialSelected[link.id] || []);
        for (const modifierId of selectedIds) {
          if (initialIds.has(modifierId)) continue;
          await requestJson(baseUrl, `/orders/${orderId}/items/${modifierModal.orderItemId}/modifiers`, {
            method: "POST",
            headers: {
              ...authHeaders(session),
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ modifierId })
          });
        }
      }

      for (const draft of customModifierDrafts) {
        await requestJson(baseUrl, `/orders/${orderId}/items/${modifierModal.orderItemId}/modifiers`, {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            customName: draft.label,
            quantity: 1,
            price: draft.price
          })
        });
      }

      setModifierModal(null);
      setModifierValidationMessage(null);
      setModifierItemNote("");
      setModifierDraftMode("ADD");
      setModifierDraftName("");
      setModifierDraftPrice("");
      setCustomModifierDrafts([]);
      await loadOrder(orderId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to apply modifiers.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [customModifierDrafts, loadOrder, modifierItemNote, modifierModal, orderId, serverUrl, session]);

  const updateItemQuantity = useCallback(
    async (orderItemId: string, currentQty: number, nextQty: number) => {
      if (!session || !orderId || busy) return;
      if (nextQty < 0) return;
      setBusy(true);
      try {
        const baseUrl = normalizeServerUrl(serverUrl);
        if (nextQty === 0) {
          await requestJson(baseUrl, `/orders/${orderId}/items/${orderItemId}`, {
            method: "DELETE",
            headers: authHeaders(session)
          });
        } else if (nextQty !== currentQty) {
          await requestJson(baseUrl, `/orders/${orderId}/items/${orderItemId}`, {
            method: "PATCH",
            headers: {
              ...authHeaders(session),
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ quantity: nextQty })
          });
        }
        await loadOrder(orderId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to update item quantity.";
        setAlertMessage(message);
      } finally {
        setBusy(false);
      }
    },
    [busy, loadOrder, orderId, serverUrl, session]
  );

  const canPersistTicket = (order?.items?.length ?? 0) > 0;

  const holdTicket = useCallback(async () => {
    if (!session || !orderId || busy) return;
    if (!canPersistTicket) {
      setAlertMessage(EMPTY_TICKET_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      await requestJson(baseUrl, `/orders/${orderId}/hold`, {
        method: "POST",
        headers: authHeaders(session)
      });
      clearOrderState();
      setScreen("home");
      await refreshRecallOrders();
      setAlertMessage("Ticket placed on hold.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to hold ticket.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [busy, canPersistTicket, clearOrderState, orderId, refreshRecallOrders, serverUrl, session]);

  const markDone = useCallback(async () => {
    if (!session || !orderId || busy) return;
    if (!canPersistTicket) {
      setAlertMessage(EMPTY_TICKET_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      const patchPayload: Record<string, unknown> = {
        taxExempt: orderDraft.taxExempt,
        serviceCharge: orderDraft.serviceCharge ? Number(orderDraft.serviceCharge) : undefined,
        deliveryCharge: orderDraft.deliveryCharge ? Number(orderDraft.deliveryCharge) : undefined
      };
      if (terminalMode === "DELIVERY") {
        patchPayload.customerName = orderDraft.customerName || undefined;
        patchPayload.numberOfGuests = orderDraft.numberOfGuests ? Number(orderDraft.numberOfGuests) : undefined;
      }
      await requestJson(baseUrl, `/orders/${orderId}`, {
        method: "PATCH",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(patchPayload)
      });
      await requestJson(baseUrl, `/orders/${orderId}/send-kitchen`, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      clearOrderState();
      setScreen("home");
      await refreshRecallOrders();
      setAlertMessage("Ticket sent to kitchen.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to mark ticket done.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    canPersistTicket,
    clearOrderState,
    orderDraft,
    orderId,
    refreshRecallOrders,
    serverUrl,
    session,
    terminalMode
  ]);

  const printReceipt = useCallback(async () => {
    if (!session || !orderId || busy) return;
    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      await requestJson(baseUrl, `/orders/${orderId}/print-receipt`, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      setAlertMessage("Receipt print requested.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to print receipt.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [busy, orderId, serverUrl, session]);

  const submitPayment = useCallback(async () => {
    if (!session || !orderId || busy) return;
    const amount = toNumber(paymentDraft.amount);
    if (amount <= 0) {
      setAlertMessage("Payment amount must be greater than zero.");
      return;
    }
    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      await requestJson(baseUrl, `/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          method: paymentDraft.method.trim() || "CASH",
          amount,
          tenderAmount: paymentDraft.tenderAmount ? toNumber(paymentDraft.tenderAmount) : undefined,
          tipAmount: paymentDraft.tipAmount ? toNumber(paymentDraft.tipAmount) : undefined,
          status: "PAID"
        })
      });
      if (paymentDraft.printReceipt) {
        await requestJson(baseUrl, `/orders/${orderId}/print-receipt`, {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({})
        }).catch(() => null);
      }

      await loadOrder(orderId);
      await refreshRecallOrders();
      setShowPaymentModal(false);

      const latest = await requestJson<OrderDetail>(baseUrl, `/orders/${orderId}`, {
        headers: authHeaders(session)
      });
      if (latest.status === "PAID") {
        clearOrderState();
        setScreen("home");
        setAlertMessage("Payment completed.");
      } else {
        setOrder(latest);
        setAlertMessage("Payment added.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to process payment.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    clearOrderState,
    loadOrder,
    orderId,
    paymentDraft,
    refreshRecallOrders,
    serverUrl,
    session
  ]);

  const applyDiscount = useCallback(async () => {
    if (!session || !orderId || !selectedDiscountId || busy) return;
    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      await requestJson(baseUrl, `/orders/${orderId}/discounts`, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ discountId: selectedDiscountId })
      });
      await loadOrder(orderId);
      setShowDiscountModal(false);
      setAlertMessage("Discount applied.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to apply discount.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [busy, loadOrder, orderId, selectedDiscountId, serverUrl, session]);

  const splitTicket = useCallback(async () => {
    if (!session || !orderId || busy) return;
    const selectedItemIds = Object.entries(splitSelection)
      .filter(([, checked]) => checked)
      .map(([id]) => id);
    if (selectedItemIds.length === 0) {
      setAlertMessage("Select at least one item to split.");
      return;
    }
    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      const result = await requestJson<{ originalId: string; newOrderId: string }>(baseUrl, `/orders/${orderId}/split`, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ itemIds: selectedItemIds })
      });
      setShowSplitModal(false);
      setSplitSelection({});
      await loadOrder(result.newOrderId);
      await refreshRecallOrders();
      setAlertMessage("Split created. Showing new ticket.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to split ticket.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [busy, loadOrder, orderId, refreshRecallOrders, serverUrl, session, splitSelection]);

  const voidTicket = useCallback(async () => {
    if (!session || !orderId || busy) return;
    if (voidReason.trim().length < 2) {
      setAlertMessage("Void reason is required.");
      return;
    }
    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      await requestJson(baseUrl, `/orders/${orderId}/void`, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason: voidReason.trim() })
      });
      clearOrderState();
      setShowVoidModal(false);
      setScreen("home");
      await refreshRecallOrders();
      setAlertMessage("Ticket voided.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to void ticket.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [busy, clearOrderState, orderId, refreshRecallOrders, serverUrl, session, voidReason]);

  const addCheck = useCallback(async () => {
    if (!session || !orderId || busy || terminalMode !== "DINE_IN") return;
    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(serverUrl);
      const result = await requestJson<{ order: { id: string } }>(baseUrl, `/orders/${orderId}/chain`, {
        method: "POST",
        headers: authHeaders(session)
      });
      await loadOrder(result.order.id);
      await refreshRecallOrders();
      setAlertMessage("New check created.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create new check.";
      setAlertMessage(message);
    } finally {
      setBusy(false);
    }
  }, [busy, loadOrder, orderId, refreshRecallOrders, serverUrl, session, terminalMode]);

  const signIn = useCallback(async () => {
    const baseUrl = normalizeServerUrl(serverUrl);
    if (!baseUrl) {
      setLoginError("Server URL is required.");
      return;
    }
    setAuthLoading(true);
    setLoginError(null);
    try {
      let result: LoginResponse;
      const usePinMode = pinLockRequired || authMode === "pin";
      if (usePinMode) {
        if (!pin.trim()) throw new Error("PIN is required.");
        result = await requestJson<LoginResponse>(baseUrl, "/auth/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: pin.trim() })
        });
      } else {
        if (!username.trim() || !password) throw new Error("Username and password are required.");
        result = await requestJson<LoginResponse>(baseUrl, "/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password })
        });
      }

      const nextSession: SessionState = {
        token: result.token,
        user: result.user,
        issuedAt: new Date().toISOString()
      };
      setSession(nextSession);
      await AsyncStorage.multiSet([
        [STORAGE_SERVER_URL, baseUrl],
        [STORAGE_SESSION, JSON.stringify(nextSession)]
      ]);
      setPassword("");
      setPin("");
      setLoginError(null);
      setScreen("home");
      setPinLockRequired(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in.";
      setLoginError(message);
    } finally {
      setAuthLoading(false);
    }
  }, [authMode, password, pin, pinLockRequired, serverUrl, username]);

  const autoDiscoverServers = useCallback(async () => {
    if (discovering) return;

    setDiscovering(true);
    setDiscoverMessage("Scanning local network...");
    setDiscoveredServers([]);

    try {
      const current = parseHostPort(serverUrl);
      const preferredPort = current?.port ?? 8080;
      const localIp = await Network.getIpAddressAsync();
      const localPrefix = isPrivateIpv4(localIp) ? subnetPrefixFromIpv4(localIp) : null;
      const currentPrefix = current && isPrivateIpv4(current.host) ? subnetPrefixFromIpv4(current.host) : null;
      const subnetPrefix = localPrefix || currentPrefix;

      if (!subnetPrefix) {
        throw new Error("Unable to detect local subnet. Connect to Wi-Fi, then try Auto Discover.");
      }

      const candidateHosts: string[] = [];
      const localLastOctet =
        isPrivateIpv4(localIp) && subnetPrefixFromIpv4(localIp) === subnetPrefix
          ? Number(localIp.split(".")[3])
          : null;
      const currentLastOctet =
        current && isIpv4Address(current.host) && subnetPrefixFromIpv4(current.host) === subnetPrefix
          ? Number(current.host.split(".")[3])
          : null;

      if (currentLastOctet && currentLastOctet > 0 && currentLastOctet < 255) {
        candidateHosts.push(`${subnetPrefix}.${currentLastOctet}`);
      }

      for (let i = 1; i <= 254; i += 1) {
        if (localLastOctet && i === localLastOctet) continue;
        candidateHosts.push(`${subnetPrefix}.${i}`);
      }

      const ports = Array.from(new Set([preferredPort, 8080]));
      const candidates: DiscoveredServer[] = [];
      const candidateSeen = new Set<string>();

      for (const port of ports) {
        for (const host of candidateHosts) {
          const url = `http://${host}:${port}`;
          if (candidateSeen.has(url)) continue;
          candidateSeen.add(url);
          candidates.push({ url, host, port });
        }
      }

      setDiscoverMessage(`Scanning ${subnetPrefix}.x ...`);
      const found: DiscoveredServer[] = [];

      await runWithConcurrency(candidates, 30, async (candidate) => {
        const ok = await probePosServer(candidate.url);
        if (!ok) return;

        found.push(candidate);
        setDiscoveredServers((prev) => {
          if (prev.some((entry) => entry.url === candidate.url)) return prev;
          return [...prev, candidate];
        });
      });

      if (found.length === 0) {
        setDiscoverMessage("No Websys POS server found on this Wi-Fi network.");
        return;
      }

      const [selected] = found;
      setServerUrl(selected.url);
      setDiscoverMessage(
        `Found ${found.length} server${found.length === 1 ? "" : "s"}. Selected ${selected.host}:${selected.port}.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Auto discover failed.";
      setDiscoverMessage(message);
    } finally {
      setDiscovering(false);
    }
  }, [discovering, serverUrl]);

  const signOut = useCallback(async () => {
    setSession(null);
    setOrder(null);
    setOrderId(null);
    setRecallOrders([]);
    setPinLockRequired(false);
    await AsyncStorage.removeItem(STORAGE_SESSION);
  }, []);

  const filteredGroups = useMemo(() => {
    if (!activeCategoryId) return [] as MenuGroup[];
    return groups
      .filter((entry) => entry.categoryId === activeCategoryId && entry.visible !== false)
      .sort((a, b) => toNumber(a.sortOrder) - toNumber(b.sortOrder));
  }, [activeCategoryId, groups]);

  const visibleCategories = useMemo(
    () =>
      categories
        .filter((entry) => entry.visible !== false)
        .sort((a, b) => toNumber(a.sortOrder) - toNumber(b.sortOrder)),
    [categories]
  );

  const visibleItems = useMemo(() => {
    const byCategory = activeCategoryId
      ? items.filter((entry) => entry.categoryId === activeCategoryId && entry.visible !== false)
      : items.filter((entry) => entry.visible !== false);
    const byGroup = activeGroupId ? byCategory.filter((entry) => entry.groupId === activeGroupId) : byCategory;
    return byGroup.sort((a, b) => a.name.localeCompare(b.name));
  }, [activeCategoryId, activeGroupId, items]);

  const visibleTables = useMemo(() => {
    const byArea = activeAreaId ? tables.filter((entry) => entry.areaId === activeAreaId) : tables;
    return byArea.sort((a, b) => a.name.localeCompare(b.name));
  }, [activeAreaId, tables]);

  const tableMapStatusById = useMemo(() => {
    return tables.reduce<Record<string, string>>((acc, table) => {
      if (table.status === "DIRTY" || table.status === "RESERVED") {
        acc[table.id] = table.status;
        return acc;
      }
      acc[table.id] = (tableOpenItemCounts[table.id] || 0) > 0 ? "SEATED" : "AVAILABLE";
      return acc;
    }, {});
  }, [tableOpenItemCounts, tables]);

  const tableMapNodes = useMemo(() => {
    if (visibleTables.length === 0) return [] as Array<{ table: DiningTable; leftPct: number; topPct: number }>;

    const placed = visibleTables.filter(
      (table) => Number.isFinite(table.posX ?? NaN) && Number.isFinite(table.posY ?? NaN)
    );
    const hasCoordinates = placed.length > 0;
    const maxX = hasCoordinates ? Math.max(...placed.map((table) => Number(table.posX ?? 0)), 1) : 1;
    const maxY = hasCoordinates ? Math.max(...placed.map((table) => Number(table.posY ?? 0)), 1) : 1;

    const rows = Math.max(1, Math.ceil(visibleTables.length / 4));

    return visibleTables.map((table, idx) => {
      if (hasCoordinates && Number.isFinite(table.posX ?? NaN) && Number.isFinite(table.posY ?? NaN)) {
        const leftPct = clamp((Number(table.posX ?? 0) / maxX) * 100, 8, 92);
        const topPct = clamp((Number(table.posY ?? 0) / maxY) * 100, 10, 90);
        return { table, leftPct, topPct };
      }

      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const leftPct = clamp(((col + 0.5) / 4) * 100, 8, 92);
      const topPct = clamp(((row + 0.5) / rows) * 100, 10, 90);
      return { table, leftPct, topPct };
    });
  }, [visibleTables]);

  const filteredRecallOrders = useMemo(() => {
    const normalized = recallSearch.trim().toLowerCase();
    if (!normalized) return recallOrders;
    return recallOrders.filter((entry) => {
      const label = ticketLabel(entry).toLowerCase();
      const tableName = entry.table?.name?.toLowerCase() || "";
      return label.includes(normalized) || tableName.includes(normalized);
    });
  }, [recallOrders, recallSearch]);

  const activeTicketsCount = recallOrders.length;
  const dataCacheCount = categories.length + groups.length + items.length + tables.length;
  const dataCacheReady = dataCacheCount > 0;
  const lastSyncLabel = useMemo(
    () => formatRelativeTime(lastRecallSyncAt || lastDataSyncAt),
    [lastDataSyncAt, lastRecallSyncAt]
  );
  const recallUpdatedLabel = useMemo(() => formatRelativeTime(lastRecallSyncAt), [lastRecallSyncAt]);
  const modifierMissingGroups = useMemo(() => {
    if (!modifierModal) return [] as string[];
    return modifierModal.links
      .filter((link) => (modifierModal.selected[link.id] || []).length < requiredCount(link.minRequired))
      .map((link) => link.group.name);
  }, [modifierModal]);
  const modifierTotalSelected = useMemo(() => {
    if (!modifierModal) return 0;
    const grouped = Object.values(modifierModal.selected).reduce((sum, ids) => sum + ids.length, 0);
    return grouped + customModifierDrafts.length;
  }, [customModifierDrafts.length, modifierModal]);
  const canApplyModifierSelection = modifierMissingGroups.length === 0;

  const orderTotals = useMemo(() => {
    if (!order) {
      return { subtotal: 0, tax: 0, total: 0, due: 0 };
    }
    const subtotal = toNumber(order.subtotalAmount);
    const tax = toNumber(order.taxAmount);
    const total = toNumber(order.totalAmount);
    return {
      subtotal,
      tax,
      total,
      due: getDueAmount(order)
    };
  }, [order]);

  const orderTableLabel = useMemo(() => {
    if (order?.table?.name) return order.table.name;
    if (terminalMode !== "DINE_IN" || !selectedTableId) return "-";
    const selected = tables.find((entry) => entry.id === selectedTableId);
    return selected?.name || "-";
  }, [order?.table?.name, selectedTableId, tables, terminalMode]);

  useEffect(() => {
    if (!order) return;
    setPaymentDraft((prev) => ({
      ...prev,
      amount: getDueAmount(order).toFixed(2),
      tenderAmount: getDueAmount(order).toFixed(2)
    }));
  }, [order]);

  if (booting) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.centered}>
          <ActivityIndicator color="#8dd6ff" size="large" />
          <Text style={styles.subtle}>Loading Websys POS Server...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>WEBSYS POS</Text>
          <Text style={styles.headerTitle}>Server Mobile</Text>
          <Text style={styles.subtle}>
            {pinLockRequired
              ? "Ticket marked done. Enter PIN to continue."
              : "Sign in with PIN or username/password."}
          </Text>

          <Text style={styles.label}>Server URL</Text>
          <TextInput
            value={serverUrl}
            onChangeText={setServerUrl}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.50:8080"
            placeholderTextColor="#7e8ca9"
          />
          <Text style={styles.helper}>Use Auto Discover to find the server on your Wi-Fi network.</Text>
          <Text style={styles.helper}>Detected default: {DEFAULT_SERVER_URL}</Text>
          <View style={styles.buttonRow}>
            {normalizeServerUrl(serverUrl) !== DEFAULT_SERVER_URL ? (
              <Pressable style={styles.outlineBtn} onPress={() => setServerUrl(DEFAULT_SERVER_URL)}>
                <Text style={styles.outlineBtnText}>Use Detected Default</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.outlineBtn} onPress={() => void autoDiscoverServers()} disabled={discovering}>
              {discovering ? (
                <ActivityIndicator size="small" color="#d9e5ff" />
              ) : (
                <Text style={styles.outlineBtnText}>Auto Discover</Text>
              )}
            </Pressable>
          </View>
          {discoverMessage ? <Text style={styles.helper}>{discoverMessage}</Text> : null}
          {discoveredServers.length > 0 ? (
            <View style={styles.subCard}>
              <Text style={styles.rowTitle}>Servers Found</Text>
              {discoveredServers.map((entry) => (
                <Pressable
                  key={entry.url}
                  style={[styles.listRow, normalizeServerUrl(serverUrl) === entry.url ? styles.selectedRow : null]}
                  onPress={() => setServerUrl(entry.url)}
                >
                  <Text style={styles.rowTitle}>{entry.host}:{entry.port}</Text>
                  <Text style={styles.rowSub}>{entry.url}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {!pinLockRequired ? (
            <View style={styles.segmentRow}>
              <Pressable
                style={[styles.segmentBtn, authMode === "pin" ? styles.segmentBtnActive : null]}
                onPress={() => setAuthMode("pin")}
              >
                <Text style={styles.segmentText}>PIN</Text>
              </Pressable>
              <Pressable
                style={[styles.segmentBtn, authMode === "password" ? styles.segmentBtnActive : null]}
                onPress={() => setAuthMode("password")}
              >
                <Text style={styles.segmentText}>User / Pass</Text>
              </Pressable>
            </View>
          ) : null}

          {pinLockRequired || authMode === "pin" ? (
            <>
              <Text style={styles.label}>Access Code (PIN)</Text>
              <TextInput
                value={pin}
                onChangeText={setPin}
                style={styles.input}
                keyboardType="number-pad"
                autoCorrect={false}
                secureTextEntry
                placeholder="1234"
                placeholderTextColor="#7e8ca9"
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="server1"
                placeholderTextColor="#7e8ca9"
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry
                placeholder="********"
                placeholderTextColor="#7e8ca9"
              />
            </>
          )}

          {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

          <Pressable style={styles.primaryBtn} onPress={() => void signIn()} disabled={authLoading}>
            {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign In</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.brand}>WEBSYS POS</Text>
          <Text style={styles.subtle}>{serverUrl}</Text>
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.sessionPill}>
            <View style={styles.sessionDot} />
            <Text style={styles.sessionLabel}>Server</Text>
            <Text numberOfLines={1} style={styles.sessionName}>
              {session.user.displayName || session.user.username}
            </Text>
          </View>
          <Pressable style={styles.outlineBtn} onPress={() => void signOut()}>
            <Text style={styles.outlineBtnText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>

      {alertMessage ? (
        <Pressable style={styles.alertCard} onPress={() => setAlertMessage(null)}>
          <Text style={styles.alertText}>{alertMessage}</Text>
          <Text style={styles.alertDismiss}>Tap to dismiss</Text>
        </Pressable>
      ) : null}

      {screen === "home" ? (
        <ScrollView contentContainerStyle={styles.homeWrap}>
          <View pointerEvents="none" style={styles.homeGlowA} />
          <View pointerEvents="none" style={styles.homeGlowB} />

          <Text style={styles.homeSectionTitle}>Dashboard</Text>

          <View style={styles.homeActionGrid}>
            <Pressable
              style={[
                styles.homeActionCard,
                terminalMode === "DINE_IN" ? styles.homeActionCardActive : null,
                !serviceFlags.dineIn ? styles.homeActionCardDisabled : null
              ]}
              onPress={() => void startNewTicket("DINE_IN")}
              disabled={!serviceFlags.dineIn}
            >
              <View style={styles.homeActionIcon}>
                <Text style={styles.homeActionIconText}>🍽️</Text>
              </View>
              <Text style={styles.homeActionTitle}>Dine In</Text>
              <Text style={styles.homeActionSub}>Start a new table ticket</Text>
              <View
                style={[
                  styles.homeActionBadge,
                  serviceFlags.dineIn ? styles.homeActionBadgeEnabled : styles.homeActionBadgeDisabled
                ]}
              >
                <View
                  style={[
                    styles.homeActionDot,
                    serviceFlags.dineIn ? styles.homeActionDotEnabled : styles.homeActionDotDisabled
                  ]}
                />
                <Text style={styles.homeActionBadgeText}>{serviceFlags.dineIn ? "Enabled" : "Disabled"}</Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.homeActionCard,
                terminalMode === "TAKEOUT" ? styles.homeActionCardActive : null,
                !serviceFlags.takeOut ? styles.homeActionCardDisabled : null
              ]}
              onPress={() => void startNewTicket("TAKEOUT")}
              disabled={!serviceFlags.takeOut}
            >
              <View style={styles.homeActionIcon}>
                <Text style={styles.homeActionIconText}>🛍️</Text>
              </View>
              <Text style={styles.homeActionTitle}>Take Out</Text>
              <Text style={styles.homeActionSub}>Create a new takeout order</Text>
              <View
                style={[
                  styles.homeActionBadge,
                  serviceFlags.takeOut ? styles.homeActionBadgeEnabled : styles.homeActionBadgeDisabled
                ]}
              >
                <View
                  style={[
                    styles.homeActionDot,
                    serviceFlags.takeOut ? styles.homeActionDotEnabled : styles.homeActionDotDisabled
                  ]}
                />
                <Text style={styles.homeActionBadgeText}>{serviceFlags.takeOut ? "Enabled" : "Disabled"}</Text>
              </View>
            </Pressable>

            <Pressable style={[styles.homeActionCard, styles.homeActionCardWide]} onPress={() => setScreen("recall")}>
              <View style={styles.homeActionIcon}>
                <Text style={styles.homeActionIconText}>📂</Text>
              </View>
              <Text style={styles.homeActionTitle}>Recall Tickets</Text>
              <Text style={styles.homeActionSub}>Open existing ticket orders</Text>
              <View style={[styles.homeActionBadge, styles.homeActionBadgeRecall]}>
                <Text style={styles.homeActionBadgeText}>{activeTicketsCount} active tickets</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.homePanelsWrap}>
            <View style={styles.homePanel}>
              <Text style={styles.cardTitle}>Server Status</Text>
              <View style={styles.homeStatusRow}>
                <View style={[styles.homeStatusDot, styles.homeStatusDotUp]} />
                <Text style={styles.rowSub}>Backend: Running</Text>
              </View>
              <View style={styles.homeStatusRow}>
                <View
                  style={[
                    styles.homeStatusDot,
                    dataCacheReady ? styles.homeStatusDotUp : styles.homeStatusDotWarn
                  ]}
                />
                <Text style={styles.rowSub}>
                  Data Cache: {dataCacheReady ? "Ready" : "Pending"}
                </Text>
              </View>
              <Text style={styles.rowSub}>Last Sync: {lastSyncLabel}</Text>
              <Text style={styles.rowSub}>Open Tickets: {activeTicketsCount}</Text>
              <Pressable
                style={styles.outlineBtn}
                onPress={() => {
                  void loadBootstrapData();
                  void refreshRecallOrders();
                }}
              >
                <Text style={styles.outlineBtnText}>{loadingBootstrap || recallLoading ? "Refreshing..." : "Refresh Dashboard"}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : null}

      {screen === "recall" ? (
        <ScrollView contentContainerStyle={styles.recallWrap}>
          <View pointerEvents="none" style={styles.recallGlowA} />
          <View pointerEvents="none" style={styles.recallGlowB} />

          <View style={styles.rowBetween}>
            <Text style={styles.recallTitle}>Recall Tickets</Text>
            <Pressable style={styles.outlineBtn} onPress={() => setScreen("home")}>
              <Text style={styles.outlineBtnText}>Back Home</Text>
            </Pressable>
          </View>

          <View style={styles.recallTopBar}>
            <View style={styles.recallTabs}>
              <Pressable
                style={[styles.recallTabBtn, recallScope === "all" ? styles.recallTabBtnActive : null]}
                onPress={() => {
                  setRecallScope("all");
                  void refreshRecallOrders("all");
                }}
              >
                <Text style={styles.recallTabText}>All Tickets</Text>
              </Pressable>
              <Pressable
                style={[styles.recallTabBtn, recallScope === "mine" ? styles.recallTabBtnActive : null]}
                onPress={() => {
                  setRecallScope("mine");
                  void refreshRecallOrders("mine");
                }}
              >
                <Text style={styles.recallTabText}>My Tickets</Text>
              </Pressable>
            </View>

            <View style={styles.recallTopRight}>
              <Text style={styles.recallUpdatedText}>Updated: {recallUpdatedLabel}</Text>
              <Pressable style={styles.recallIconBtn} onPress={() => void refreshRecallOrders()}>
                {recallLoading ? (
                  <ActivityIndicator size="small" color="#dbe8ff" />
                ) : (
                  <Text style={styles.recallIconBtnText}>↻</Text>
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.recallSearchRow}>
            <TextInput
              value={recallSearch}
              onChangeText={setRecallSearch}
              style={styles.recallSearchInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Search by ticket, table, or ID..."
              placeholderTextColor="#8ea3cc"
            />
            <Pressable style={styles.recallRefreshBtn} onPress={() => void refreshRecallOrders()}>
              <Text style={styles.recallRefreshBtnText}>{recallLoading ? "Refreshing..." : "Refresh Tickets"}</Text>
            </Pressable>
          </View>

          <View style={styles.recallListPanel}>
            {filteredRecallOrders.map((entry) => (
              <Pressable key={entry.id} style={styles.recallTicketCard} onPress={() => void loadOrder(entry.id)}>
                <View style={styles.recallTicketRow}>
                  <View style={styles.recallBadge}>
                    <Text style={styles.recallBadgeText}>{recallBadgeLabel(entry)}</Text>
                  </View>
                  <View style={styles.recallTicketMain}>
                    <Text style={styles.recallTicketTitle}>{ticketLabel(entry)}</Text>
                    <View style={styles.recallTicketMetaRow}>
                      <Text style={styles.recallTicketMetaText}>{entry.table?.name || orderTypeLabel(entry.orderType)}</Text>
                      <Text style={styles.recallMetaDot}>•</Text>
                      <Text style={[styles.recallTicketStatusText, { color: recallStatusTone(entry.status) }]}>{entry.status}</Text>
                      <Text style={styles.recallMetaDot}>•</Text>
                      <Text style={styles.recallTicketMetaText}>{formatDateTime(entry.updatedAt)}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
            {filteredRecallOrders.length === 0 && !recallLoading ? (
              <Text style={styles.subtle}>No matches found.</Text>
            ) : null}
            {recallLoading && filteredRecallOrders.length === 0 ? <ActivityIndicator color="#8dd6ff" /> : null}
          </View>
        </ScrollView>
      ) : null}

      {screen === "order" ? (
        <ScrollView contentContainerStyle={styles.contentWrap}>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>
                  {order ? ticketLabel(order) : "New Ticket"} • {orderTypeLabel(terminalMode)}
                </Text>
                <Text style={styles.subtle}>
                  {orderTableLabel} • Status: {order?.status || "OPEN"}
                </Text>
              </View>
              <Pressable
                style={styles.outlineBtn}
                onPress={() => {
                  if (canPersistTicket) {
                    void markDone();
                    return;
                  }
                  void closeOrderScreen();
                }}
              >
                <Text style={styles.outlineBtnText}>Done</Text>
              </Pressable>
            </View>

            {terminalMode === "DELIVERY" ? (
              <View style={styles.rowBetween}>
                <View style={styles.inlineRow}>
                  <Text style={styles.label}>Customer</Text>
                  <TextInput
                    value={orderDraft.customerName}
                    onChangeText={(value) => setOrderDraft((prev) => ({ ...prev, customerName: value }))}
                    style={[styles.input, styles.compactInput]}
                    placeholder="Name"
                    placeholderTextColor="#7e8ca9"
                  />
                </View>
                <View style={styles.inlineRow}>
                  <Text style={styles.label}>Guests</Text>
                  <TextInput
                    value={orderDraft.numberOfGuests}
                    onChangeText={(value) => setOrderDraft((prev) => ({ ...prev, numberOfGuests: value }))}
                    style={[styles.input, styles.compactInput]}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#7e8ca9"
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.rowBetween}>
              <View style={styles.inlineRow}>
                <Text style={styles.label}>Tax Exempt</Text>
                <Switch
                  value={orderDraft.taxExempt}
                  onValueChange={(value) => setOrderDraft((prev) => ({ ...prev, taxExempt: value }))}
                />
              </View>
            </View>

            {orderLoading ? <ActivityIndicator color="#8dd6ff" /> : null}
          </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Categories</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                {visibleCategories.map((entry, index) => {
                  const isActive = activeCategoryId === entry.id;
                  const tone = categoryChipTone(entry, index, isActive);
                  return (
                    <Pressable
                      key={entry.id}
                      style={[
                        styles.chip,
                        styles.categoryChip,
                        {
                          backgroundColor: tone.backgroundColor,
                          borderColor: tone.borderColor
                        },
                        isActive ? styles.categoryChipActive : null
                      ]}
                      onPress={() => setActiveCategoryId(entry.id)}
                    >
                      <Text style={[styles.chipText, styles.categoryChipText, { color: tone.textColor }]}>{entry.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
              {filteredGroups.map((entry) => (
                <Pressable
                  key={entry.id}
                  style={[styles.chipSmall, activeGroupId === entry.id ? styles.chipActive : null]}
                  onPress={() => setActiveGroupId(entry.id)}
                >
                  <Text style={styles.chipText}>{entry.name}</Text>
                </Pressable>
              ))}
              {filteredGroups.length > 0 ? (
                <Pressable style={[styles.chipSmall, !activeGroupId ? styles.chipActive : null]} onPress={() => setActiveGroupId("")}>
                  <Text style={styles.chipText}>All</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Menu</Text>
            {visibleItems.map((entry) => (
              <Pressable key={entry.id} style={styles.menuRow} onPress={() => void addItemToTicket(entry)}>
                <Text style={styles.rowTitle}>{entry.name}</Text>
                <Text style={styles.rowSub}>{formatMoney(toNumber(entry.price))}</Text>
              </Pressable>
            ))}
            {visibleItems.length === 0 ? <Text style={styles.subtle}>No items in this section.</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ticket</Text>
            {order?.items?.map((line) => {
              const isLockedFromSent =
                lockedModifierItems.orderId === orderId && Boolean(lockedModifierItems.itemIds[line.id]);
              return (
                <View key={line.id} style={styles.ticketLine}>
                  <Pressable
                    style={[
                      styles.ticketItemTap,
                      !line.menuItemId || isLockedFromSent ? styles.ticketItemTapDisabled : null,
                      isLockedFromSent ? styles.ticketItemTapLocked : null
                    ]}
                    onPress={() => void openModifiersForExistingItem(line)}
                    disabled={!line.menuItemId || isLockedFromSent}
                  >
                    <Text style={styles.rowTitle}>{line.name || "Item"}</Text>
                    <Text style={styles.rowSub}>{formatMoney(toNumber(line.price))}</Text>
                    {line.notes?.trim() ? <Text style={styles.modText}>Note: {line.notes.trim()}</Text> : null}
                    {(line.modifiers || []).map((mod) => (
                      <Text key={mod.id} style={styles.modText}>
                        + {mod.customName || mod.modifier?.name || "Modifier"} x{mod.quantity}
                      </Text>
                    ))}
                    {isLockedFromSent ? (
                      <Text style={styles.ticketItemHintLocked}>Already sent. Add new items to customize.</Text>
                    ) : line.menuItemId ? (
                      <Text style={styles.ticketItemHint}>Tap item to add modifiers</Text>
                    ) : (
                      <Text style={styles.ticketItemHintMuted}>No modifier options</Text>
                    )}
                  </Pressable>
                  <View style={styles.qtyWrap}>
                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() => void updateItemQuantity(line.id, line.quantity, line.quantity - 1)}
                    >
                      <Text style={styles.qtyText}>-</Text>
                    </Pressable>
                    <Text style={styles.qtyValue}>{line.quantity}</Text>
                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() => void updateItemQuantity(line.id, line.quantity, line.quantity + 1)}
                    >
                      <Text style={styles.qtyText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            {!order?.items?.length ? <Text style={styles.subtle}>No items yet.</Text> : null}
            <View style={styles.totalsWrap}>
              <Text style={styles.rowSub}>Subtotal: {formatMoney(orderTotals.subtotal)}</Text>
              <Text style={styles.rowSub}>Tax: {formatMoney(orderTotals.tax)}</Text>
              <Text style={styles.rowTitle}>Total: {formatMoney(orderTotals.total)}</Text>
              <Text style={styles.rowTitle}>Due: {formatMoney(orderTotals.due)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Actions</Text>
            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.smallBtn, !canPersistTicket ? styles.smallBtnDisabled : null]}
                onPress={() => void holdTicket()}
                disabled={!canPersistTicket}
              >
                <Text style={styles.primaryBtnText}>Hold</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, !canPersistTicket ? styles.smallBtnDisabled : null]}
                onPress={() => void markDone()}
                disabled={!canPersistTicket}
              >
                <Text style={styles.primaryBtnText}>Done</Text>
              </Pressable>
              <Pressable style={styles.smallBtn} onPress={() => setShowDiscountModal(true)}>
                <Text style={styles.primaryBtnText}>Discount</Text>
              </Pressable>
              <Pressable style={styles.smallBtn} onPress={() => setShowSplitModal(true)}>
                <Text style={styles.primaryBtnText}>Split</Text>
              </Pressable>
              <Pressable style={styles.smallBtn} onPress={() => setShowPaymentModal(true)}>
                <Text style={styles.primaryBtnText}>Pay</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={() => setShowVoidModal(true)}>
                <Text style={styles.primaryBtnText}>Void</Text>
              </Pressable>
            </View>
            <View style={styles.buttonRow}>
              <Pressable style={styles.outlineBtn} onPress={() => void printReceipt()}>
                <Text style={styles.outlineBtnText}>Print Receipt</Text>
              </Pressable>
              {terminalMode === "DINE_IN" ? (
                <Pressable style={styles.outlineBtn} onPress={() => void addCheck()}>
                  <Text style={styles.outlineBtnText}>Add Check</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>
      ) : null}

      <Modal
        visible={tablePickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => exitDineInTablePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.tablePickerCard]}>
            <Text style={styles.cardTitle}>Select Table</Text>
            {tablePickerMessage ? <Text style={styles.errorText}>{tablePickerMessage}</Text> : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tableAreaScroll}
              contentContainerStyle={styles.hScroll}
            >
              <Pressable
                style={[styles.chipSmall, !activeAreaId ? styles.chipActive : null]}
                onPress={() => setActiveAreaId(null)}
              >
                <Text style={styles.chipText}>All Areas</Text>
              </Pressable>
              {tableAreas.map((area) => (
                <Pressable
                  key={area.id}
                  style={[styles.chipSmall, activeAreaId === area.id ? styles.chipActive : null]}
                  onPress={() => setActiveAreaId(area.id)}
                >
                  <Text style={styles.chipText}>{area.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={[styles.mapCard, styles.tablePickerMapCard]}>
              <Text style={styles.rowTitle}>Table Map</Text>
              <Text style={styles.rowSub}>
                Tap a table on the map. Green (blinking) = active ticket, blue = available, orange = reserved, red = dirty.
              </Text>
              <View style={[styles.tableMapSurface, styles.tablePickerMapSurface]}>
                {tableMapNodes.map((node) => {
                  const status = tableMapStatusById[node.table.id] || node.table.status;
                  const hasOpenTicket = status === "SEATED";
                  return (
                    <AnimatedPressable
                      key={node.table.id}
                      style={[
                        styles.tableMapNode,
                        {
                          left: `${node.leftPct}%`,
                          top: `${node.topPct}%`,
                          backgroundColor: tableStatusTone(status),
                          opacity: hasOpenTicket ? occupiedBlink : 1
                        },
                        selectedTableId === node.table.id ? styles.tableMapNodeSelected : null
                      ]}
                      onPress={() => void onSelectTable(node.table.id)}
                    >
                      <Text style={styles.tableMapLabel}>{node.table.name}</Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
            </View>

            {selectedTableId && tableChecks.length > 0 ? (
              <View style={styles.subCard}>
                <Text style={styles.rowTitle}>This table has open checks</Text>
                {tableChecks.map((check) => (
                  <Pressable
                    key={check.id}
                    style={styles.listRow}
                    onPress={() => {
                      setTablePickerOpen(false);
                      void loadOrder(check.id);
                    }}
                  >
                    <Text style={styles.rowTitle}>{ticketLabel(check)}</Text>
                    <Text style={styles.rowSub}>{check.status}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.smallBtn} onPress={() => void newCheckFromExisting()}>
                  <Text style={styles.primaryBtnText}>New Check</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.buttonRow}>
              <Pressable style={styles.smallBtn} onPress={() => void confirmTableForNewTicket()}>
                <Text style={styles.primaryBtnText}>Continue</Text>
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={() => exitDineInTablePicker(false)}>
                <Text style={styles.outlineBtnText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDiscountModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>Apply Discount</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {discounts.map((entry) => (
                <Pressable
                  key={entry.id}
                  style={[styles.listRow, selectedDiscountId === entry.id ? styles.selectedRow : null]}
                  onPress={() => setSelectedDiscountId(entry.id)}
                >
                  <Text style={styles.rowTitle}>{entry.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.buttonRow}>
              <Pressable style={styles.smallBtn} onPress={() => void applyDiscount()}>
                <Text style={styles.primaryBtnText}>Apply</Text>
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={() => setShowDiscountModal(false)}>
                <Text style={styles.outlineBtnText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPaymentModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>Payment</Text>
            <TextInput
              value={paymentDraft.method}
              onChangeText={(value) => setPaymentDraft((prev) => ({ ...prev, method: value.toUpperCase() }))}
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Method (CASH, CARD...)"
              placeholderTextColor="#7e8ca9"
            />
            <TextInput
              value={paymentDraft.amount}
              onChangeText={(value) => setPaymentDraft((prev) => ({ ...prev, amount: value }))}
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="Amount"
              placeholderTextColor="#7e8ca9"
            />
            <TextInput
              value={paymentDraft.tenderAmount}
              onChangeText={(value) => setPaymentDraft((prev) => ({ ...prev, tenderAmount: value }))}
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="Tender Amount (cash)"
              placeholderTextColor="#7e8ca9"
            />
            <TextInput
              value={paymentDraft.tipAmount}
              onChangeText={(value) => setPaymentDraft((prev) => ({ ...prev, tipAmount: value }))}
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="Tip Amount"
              placeholderTextColor="#7e8ca9"
            />
            <View style={styles.inlineRow}>
              <Switch
                value={paymentDraft.printReceipt}
                onValueChange={(value) => setPaymentDraft((prev) => ({ ...prev, printReceipt: value }))}
              />
              <Text style={styles.subtle}>Print receipt after payment</Text>
            </View>
            <View style={styles.buttonRow}>
              <Pressable style={styles.smallBtn} onPress={() => void submitPayment()}>
                <Text style={styles.primaryBtnText}>Submit Payment</Text>
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={() => setShowPaymentModal(false)}>
                <Text style={styles.outlineBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showVoidModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>Void Ticket</Text>
            <TextInput
              value={voidReason}
              onChangeText={setVoidReason}
              style={styles.input}
              placeholder="Reason"
              placeholderTextColor="#7e8ca9"
            />
            <View style={styles.buttonRow}>
              <Pressable style={styles.dangerBtn} onPress={() => void voidTicket()}>
                <Text style={styles.primaryBtnText}>Confirm Void</Text>
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={() => setShowVoidModal(false)}>
                <Text style={styles.outlineBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSplitModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>Split Ticket</Text>
            <Text style={styles.subtle}>Select items to move into a new check.</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {(order?.items || []).map((line) => (
                <Pressable
                  key={line.id}
                  style={[styles.listRow, splitSelection[line.id] ? styles.selectedRow : null]}
                  onPress={() =>
                    setSplitSelection((prev) => ({
                      ...prev,
                      [line.id]: !prev[line.id]
                    }))
                  }
                >
                  <Text style={styles.rowTitle}>{line.name || "Item"}</Text>
                  <Text style={styles.rowSub}>Qty {line.quantity}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.buttonRow}>
              <Pressable style={styles.smallBtn} onPress={() => void splitTicket()}>
                <Text style={styles.primaryBtnText}>Split</Text>
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={() => setShowSplitModal(false)}>
                <Text style={styles.outlineBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(modifierModal)} animationType="fade" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={10}
        >
          <View style={[styles.modalCard, styles.modifierModalCard]}>
            <ScrollView
              style={styles.modifierModalBodyScroll}
              contentContainerStyle={styles.modifierModalBodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.cardTitle}>Customize Item</Text>
              <Text style={styles.rowSub}>{modifierModal?.itemName || ""}</Text>
              <Text style={styles.helper}>
                Selected {modifierTotalSelected} modifier{modifierTotalSelected === 1 ? "" : "s"}
              </Text>

              <View style={styles.subCard}>
                <Text style={styles.rowTitle}>Item Notes</Text>
                <TextInput
                  value={modifierItemNote}
                  onChangeText={setModifierItemNote}
                  style={[styles.input, styles.noteInput]}
                  multiline
                  numberOfLines={3}
                  placeholder="Allergy, cook level, side request..."
                  placeholderTextColor="#7e8ca9"
                />
              </View>

              <View style={styles.subCard}>
                <Text style={styles.rowTitle}>Manual Modifier</Text>
                <View style={styles.segmentRow}>
                  <Pressable
                    style={[styles.segmentBtn, modifierDraftMode === "ADD" ? styles.segmentBtnActive : null]}
                    onPress={() => setModifierDraftMode("ADD")}
                  >
                    <Text style={styles.segmentText}>Add</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.segmentBtn, modifierDraftMode === "NO" ? styles.segmentBtnActive : null]}
                    onPress={() => setModifierDraftMode("NO")}
                  >
                    <Text style={styles.segmentText}>NO</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.segmentBtn, modifierDraftMode === "NOTE" ? styles.segmentBtnActive : null]}
                    onPress={() => setModifierDraftMode("NOTE")}
                  >
                    <Text style={styles.segmentText}>Note</Text>
                  </Pressable>
                </View>
                <TextInput
                  value={modifierDraftName}
                  onChangeText={setModifierDraftName}
                  style={styles.input}
                  placeholder={
                    modifierDraftMode === "ADD"
                      ? "e.g. Avocado"
                      : modifierDraftMode === "NO"
                        ? "e.g. Onion"
                        : "e.g. Sauce on side"
                  }
                  placeholderTextColor="#7e8ca9"
                />
                {modifierDraftMode === "ADD" ? (
                  <TextInput
                    value={modifierDraftPrice}
                    onChangeText={setModifierDraftPrice}
                    style={styles.input}
                    keyboardType="decimal-pad"
                    placeholder="Manual price (e.g. 1.50)"
                    placeholderTextColor="#7e8ca9"
                  />
                ) : null}
                <Pressable style={styles.smallBtn} onPress={addCustomModifierDraft}>
                  <Text style={styles.primaryBtnText}>Add Manual Modifier</Text>
                </Pressable>
                {customModifierDrafts.length > 0 ? (
                  <View style={styles.modifierDraftList}>
                    {customModifierDrafts.map((draft) => (
                      <View key={draft.id} style={styles.modifierDraftRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{draft.label}</Text>
                          <Text style={styles.rowSub}>{formatMoney(draft.price)}</Text>
                        </View>
                        <Pressable
                          style={styles.modifierRemoveBtn}
                          onPress={() => removeCustomModifierDraft(draft.id)}
                        >
                          <Text style={styles.modifierRemoveBtnText}>Remove</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.modifierScroll}>
                {(modifierModal?.links || []).map((link) => {
                  const selectedIds = modifierModal?.selected[link.id] || [];
                  const selectedCount = selectedIds.length;
                  const minRequired = requiredCount(link.minRequired);
                  const maxAllowed = maxCount(link.maxAllowed);
                  const missingRequired = selectedCount < minRequired;
                  const maxLabel = maxAllowed === null ? "No max" : `Max ${maxAllowed}`;

                  return (
                    <View
                      key={link.id}
                      style={[styles.modifierGroupCard, missingRequired ? styles.modifierGroupCardWarning : null]}
                    >
                      <View style={styles.rowBetween}>
                        <Text style={styles.rowTitle}>{link.group.name}</Text>
                        <View style={styles.inlineRow}>
                          <Text style={styles.modifierCountText}>
                            {selectedCount}/{maxAllowed === null ? "∞" : maxAllowed}
                          </Text>
                          {selectedCount > 0 ? (
                            <Pressable
                              style={styles.modifierClearBtn}
                              onPress={() => clearModifierGroupSelection(link.id)}
                            >
                              <Text style={styles.modifierClearBtnText}>Clear</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                      <Text style={styles.rowSub}>
                        Required {minRequired} • {maxLabel}
                      </Text>
                      {missingRequired ? (
                        <Text style={styles.errorText}>
                          Choose {minRequired - selectedCount} more to continue.
                        </Text>
                      ) : null}
                      <View style={styles.modifierChoiceWrap}>
                        {link.group.modifiers.map((mod) => {
                          const selected = selectedIds.includes(mod.id);
                          const maxReached = maxAllowed !== null && !selected && selectedCount >= maxAllowed;
                          return (
                            <Pressable
                              key={mod.id}
                              style={[
                                styles.modifierChoiceCard,
                                selected ? styles.modifierChoiceCardSelected : null,
                                maxReached ? styles.modifierChoiceCardDisabled : null
                              ]}
                              onPress={() => toggleModifierChoice(link, mod.id)}
                              disabled={maxReached}
                            >
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={[
                                    styles.modifierChoiceTitle,
                                    maxReached ? styles.modifierChoiceTitleDisabled : null
                                  ]}
                                >
                                  {mod.name}
                                </Text>
                                <Text style={styles.modifierChoicePrice}>{formatMoney(toNumber(mod.price))}</Text>
                              </View>
                              <View
                                style={[
                                  styles.modifierCheckDot,
                                  selected ? styles.modifierCheckDotSelected : null
                                ]}
                              >
                                {selected ? <Text style={styles.modifierCheckMark}>✓</Text> : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>

              {modifierValidationMessage ? <Text style={styles.errorText}>{modifierValidationMessage}</Text> : null}
              {!canApplyModifierSelection ? (
                <Text style={styles.helper}>
                  Required groups pending: {modifierMissingGroups.join(", ")}
                </Text>
              ) : null}

              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.smallBtn, !canApplyModifierSelection ? styles.smallBtnDisabled : null]}
                  onPress={() => void applyModifiers()}
                  disabled={!canApplyModifierSelection}
                >
                  <Text style={styles.primaryBtnText}>Apply Modifiers</Text>
                </Pressable>
                <Pressable
                  style={styles.outlineBtn}
                  onPress={() => {
                    setModifierModal(null);
                    setModifierValidationMessage(null);
                    setModifierItemNote("");
                    setModifierDraftMode("ADD");
                    setModifierDraftName("");
                    setModifierDraftPrice("");
                    setCustomModifierDrafts([]);
                    if (orderId) {
                      void loadOrder(orderId);
                    }
                  }}
                >
                  <Text style={styles.outlineBtnText}>Skip</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {(busy || loadingBootstrap || orderLoading) && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color="#8dd6ff" size="large" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0a1222"
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10
  },
  authWrap: {
    padding: 18,
    gap: 10
  },
  contentWrap: {
    padding: 14,
    gap: 12
  },
  homeWrap: {
    padding: 14,
    gap: 12,
    paddingBottom: 24
  },
  homeGlowA: {
    position: "absolute",
    top: 28,
    left: -90,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(35,105,255,0.18)"
  },
  homeGlowB: {
    position: "absolute",
    top: 240,
    right: -110,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(58,127,255,0.16)"
  },
  homeSectionTitle: {
    color: "#f8fbff",
    fontSize: 30,
    fontWeight: "800",
    marginTop: 2
  },
  homeActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  homeActionCard: {
    flexGrow: 1,
    flexBasis: "48%",
    minHeight: 186,
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: "rgba(16,30,58,0.95)",
    padding: 12,
    gap: 7
  },
  homeActionCardWide: {
    flexBasis: "100%",
    minHeight: 170
  },
  homeActionCardActive: {
    borderColor: "#61b2ff",
    shadowColor: "#3b8cff",
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  homeActionCardDisabled: {
    opacity: 0.6
  },
  homeActionIcon: {
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: "#1d345d",
    borderColor: "#3b5f95",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  homeActionIconText: {
    fontSize: 23
  },
  homeActionTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.4
  },
  homeActionSub: {
    color: "#9db2d8",
    fontSize: 13
  },
  homeActionBadge: {
    marginTop: "auto",
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  homeActionBadgeEnabled: {
    borderColor: "#2f6651",
    backgroundColor: "#14322a"
  },
  homeActionBadgeDisabled: {
    borderColor: "#6f5356",
    backgroundColor: "#352429"
  },
  homeActionBadgeRecall: {
    borderColor: "#2f4c78",
    backgroundColor: "#132b4f"
  },
  homeActionDot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  homeActionDotEnabled: {
    backgroundColor: "#6be386"
  },
  homeActionDotDisabled: {
    backgroundColor: "#f29ba8"
  },
  homeActionBadgeText: {
    color: "#eaf2ff",
    fontSize: 14,
    fontWeight: "700"
  },
  homePanelsWrap: {
    gap: 10
  },
  homePanel: {
    backgroundColor: "rgba(13,25,48,0.96)",
    borderColor: "#2b4372",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10
  },
  homeMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  homeMetricTile: {
    flexBasis: "48%",
    flexGrow: 1,
    borderColor: "#304a74",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#122746",
    padding: 10,
    gap: 6
  },
  homeMetricLabel: {
    color: "#b3c7e9",
    fontSize: 13,
    fontWeight: "600"
  },
  homeMetricValue: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800"
  },
  homeStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  homeStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  homeStatusDotUp: {
    backgroundColor: "#66df85"
  },
  homeStatusDotWarn: {
    backgroundColor: "#e3a04a"
  },
  recallWrap: {
    padding: 14,
    gap: 12,
    paddingBottom: 24
  },
  recallGlowA: {
    position: "absolute",
    top: 64,
    left: -80,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: "rgba(44,111,255,0.16)"
  },
  recallGlowB: {
    position: "absolute",
    bottom: 100,
    right: -96,
    width: 250,
    height: 250,
    borderRadius: 999,
    backgroundColor: "rgba(56,122,255,0.15)"
  },
  recallTitle: {
    color: "#f8fbff",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.3
  },
  recallTopBar: {
    borderColor: "#2e4675",
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: "rgba(14,29,56,0.96)",
    padding: 10,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap"
  },
  recallTabs: {
    flexDirection: "row",
    gap: 8,
    flex: 1
  },
  recallTabBtn: {
    flex: 1,
    borderColor: "#324f80",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#152d55",
    paddingVertical: 10,
    alignItems: "center"
  },
  recallTabBtnActive: {
    backgroundColor: "#244f9c",
    borderColor: "#61b2ff"
  },
  recallTabText: {
    color: "#dbe8ff",
    fontSize: 15,
    fontWeight: "700"
  },
  recallTopRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  recallUpdatedText: {
    color: "#a6b9de",
    fontSize: 13,
    flex: 1
  },
  recallIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderColor: "#345288",
    borderWidth: 1,
    backgroundColor: "#17345f",
    alignItems: "center",
    justifyContent: "center"
  },
  recallIconBtnText: {
    color: "#d8e7ff",
    fontSize: 16,
    fontWeight: "800"
  },
  recallSearchRow: {
    borderColor: "#2e4675",
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: "rgba(14,28,55,0.95)",
    padding: 10,
    gap: 8,
    flexDirection: "row",
    alignItems: "center"
  },
  recallSearchInput: {
    flex: 1,
    borderColor: "#355486",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#13294e",
    color: "#fff",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  recallRefreshBtn: {
    borderColor: "#3e66a3",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#1e3f74",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  recallRefreshBtnText: {
    color: "#e1edff",
    fontSize: 14,
    fontWeight: "700"
  },
  recallListPanel: {
    borderColor: "#2e4675",
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: "rgba(13,26,51,0.96)",
    padding: 10,
    gap: 8
  },
  recallTicketCard: {
    borderColor: "#36558c",
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: "#142b50",
    padding: 11
  },
  recallTicketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  recallBadge: {
    minWidth: 48,
    height: 40,
    borderRadius: 10,
    borderColor: "#4775b8",
    borderWidth: 1,
    backgroundColor: "#224887",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  recallBadgeText: {
    color: "#e8f1ff",
    fontSize: 16,
    fontWeight: "800"
  },
  recallTicketMain: {
    flex: 1,
    gap: 2
  },
  recallTicketTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800"
  },
  recallTicketMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4
  },
  recallTicketMetaText: {
    color: "#a9bcdf",
    fontSize: 14
  },
  recallMetaDot: {
    color: "#748db9",
    fontSize: 13
  },
  recallTicketStatusText: {
    fontSize: 14,
    fontWeight: "700"
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f365c",
    backgroundColor: "#0f1a31"
  },
  topBarLeft: {
    flex: 1
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  sessionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#122545",
    maxWidth: 210
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#6be386"
  },
  sessionLabel: {
    color: "#9ab2d8",
    fontSize: 12,
    fontWeight: "700"
  },
  sessionName: {
    color: "#f2f7ff",
    fontSize: 13,
    fontWeight: "800",
    maxWidth: 120
  },
  brand: {
    color: "#7cc7ff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.8
  },
  headerTitle: {
    color: "#f8fbff",
    fontSize: 24,
    fontWeight: "700"
  },
  subtle: {
    color: "#a6b5d3",
    fontSize: 13
  },
  helper: {
    color: "#9fb1d6",
    fontSize: 12
  },
  label: {
    color: "#cfdbf6",
    fontSize: 13,
    fontWeight: "600"
  },
  input: {
    backgroundColor: "#142341",
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: "#fff",
    fontSize: 15
  },
  compactInput: {
    minWidth: 120
  },
  noteInput: {
    minHeight: 72,
    textAlignVertical: "top"
  },
  card: {
    backgroundColor: "#0f1a31",
    borderColor: "#1f365c",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10
  },
  subCard: {
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 6
  },
  mapCard: {
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    backgroundColor: "#102544"
  },
  tableMapSurface: {
    height: 240,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#29416a",
    backgroundColor: "#0c1b35",
    position: "relative",
    overflow: "hidden"
  },
  tablePickerMapCard: {
    flex: 1
  },
  tablePickerMapSurface: {
    flex: 1,
    minHeight: 320
  },
  tableMapNode: {
    position: "absolute",
    minWidth: 64,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
    transform: [{ translateX: -32 }, { translateY: -19 }]
  },
  tableMapNodeSelected: {
    borderColor: "#ffffff",
    borderWidth: 2,
    shadowColor: "#8ad1ff",
    shadowOpacity: 0.35,
    shadowRadius: 6
  },
  tableMapLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  cardTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700"
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap"
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  primaryBtn: {
    backgroundColor: "#1b68e4",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700"
  },
  smallBtn: {
    backgroundColor: "#1b68e4",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  smallBtnDisabled: {
    opacity: 0.45
  },
  outlineBtn: {
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#16284a"
  },
  outlineBtnText: {
    color: "#d9e5ff",
    fontSize: 13,
    fontWeight: "700"
  },
  dangerBtn: {
    backgroundColor: "#a83039",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  modeBtn: {
    backgroundColor: "#173057",
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  modeBtnActive: {
    backgroundColor: "#225fb8",
    borderColor: "#4aa8ff"
  },
  modeBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700"
  },
  listRow: {
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 6,
    backgroundColor: "#122644"
  },
  modifierModalCard: {
    maxHeight: "92%",
    width: "100%"
  },
  modifierModalBodyScroll: {
    flexGrow: 0
  },
  modifierModalBodyContent: {
    gap: 10,
    paddingBottom: 6
  },
  modifierScroll: {
    gap: 8
  },
  modifierGroupCard: {
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 11,
    padding: 10,
    gap: 8,
    marginBottom: 8,
    backgroundColor: "#10223f"
  },
  modifierGroupCardWarning: {
    borderColor: "#cc8e4d",
    backgroundColor: "#2b2530"
  },
  modifierCountText: {
    color: "#d7e7ff",
    fontSize: 12,
    fontWeight: "700"
  },
  modifierClearBtn: {
    borderColor: "#355484",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#14335d"
  },
  modifierClearBtnText: {
    color: "#dbe8ff",
    fontSize: 11,
    fontWeight: "700"
  },
  modifierChoiceWrap: {
    gap: 6
  },
  modifierChoiceCard: {
    borderColor: "#355584",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#14305a",
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  modifierChoiceCardSelected: {
    borderColor: "#78c2ff",
    backgroundColor: "#24508c"
  },
  modifierChoiceCardDisabled: {
    opacity: 0.45
  },
  modifierChoiceTitle: {
    color: "#f2f7ff",
    fontSize: 14,
    fontWeight: "700"
  },
  modifierChoiceTitleDisabled: {
    color: "#a8bbde"
  },
  modifierChoicePrice: {
    color: "#99b0d7",
    fontSize: 12
  },
  modifierDraftList: {
    gap: 6
  },
  modifierDraftRow: {
    borderColor: "#375888",
    borderWidth: 1,
    borderRadius: 9,
    backgroundColor: "#142c52",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  modifierRemoveBtn: {
    borderColor: "#7b3f47",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#4b262e"
  },
  modifierRemoveBtnText: {
    color: "#ffdce0",
    fontSize: 11,
    fontWeight: "700"
  },
  modifierCheckDot: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderColor: "#678bbf",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#122748"
  },
  modifierCheckDotSelected: {
    borderColor: "#bfe6ff",
    backgroundColor: "#1c78d5"
  },
  modifierCheckMark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800"
  },
  selectedRow: {
    borderColor: "#6ec1ff",
    backgroundColor: "#1f3f70"
  },
  rowTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700"
  },
  rowSub: {
    color: "#9eb2da",
    fontSize: 12
  },
  menuRow: {
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 6,
    backgroundColor: "#142b4f"
  },
  ticketLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 9,
    padding: 8,
    marginBottom: 6,
    backgroundColor: "#122644"
  },
  ticketItemTap: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 2
  },
  ticketItemTapDisabled: {
    opacity: 0.65
  },
  ticketItemTapLocked: {
    borderColor: "#2f7847",
    borderWidth: 1,
    backgroundColor: "rgba(30,148,71,0.1)"
  },
  ticketItemHint: {
    marginTop: 2,
    color: "#87c2ff",
    fontSize: 11,
    fontWeight: "700"
  },
  ticketItemHintLocked: {
    marginTop: 2,
    color: "#7de0a0",
    fontSize: 11,
    fontWeight: "700"
  },
  ticketItemHintMuted: {
    marginTop: 2,
    color: "#7f90ae",
    fontSize: 11
  },
  modText: {
    color: "#9eb2da",
    fontSize: 11
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#1c62d6",
    alignItems: "center",
    justifyContent: "center"
  },
  qtyText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20
  },
  qtyValue: {
    color: "#fff",
    minWidth: 20,
    textAlign: "center",
    fontWeight: "700"
  },
  totalsWrap: {
    marginTop: 4,
    borderTopColor: "#2f4b7a",
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 3
  },
  errorText: {
    color: "#ffb5bb",
    fontSize: 13
  },
  alertCard: {
    backgroundColor: "#3d1f24",
    borderColor: "#8f3a46",
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 10
  },
  alertText: {
    color: "#ffdfe2",
    fontSize: 13
  },
  alertDismiss: {
    color: "#ffc3c8",
    fontSize: 11,
    marginTop: 4
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.64)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    backgroundColor: "#0f1a31",
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10
  },
  tablePickerCard: {
    width: "100%",
    height: "92%",
    alignSelf: "center"
  },
  tableAreaScroll: {
    flexGrow: 0,
    maxHeight: 52
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.44)",
    alignItems: "center",
    justifyContent: "center"
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8
  },
  segmentBtn: {
    flex: 1,
    backgroundColor: "#1a2f55",
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  segmentBtnActive: {
    backgroundColor: "#205db8",
    borderColor: "#7ac7ff"
  },
  segmentText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13
  },
  hScroll: {
    gap: 8,
    alignItems: "center",
    paddingVertical: 2
  },
  chip: {
    backgroundColor: "#1a2f55",
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  categoryChip: {
    borderWidth: 1.5
  },
  categoryChipActive: {
    shadowColor: "#6fb6ff",
    shadowOpacity: 0.32,
    shadowRadius: 5
  },
  categoryChipText: {
    fontWeight: "800"
  },
  chipSmall: {
    backgroundColor: "#1a2f55",
    borderColor: "#2f4b7a",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start"
  },
  chipActive: {
    backgroundColor: "#205db8",
    borderColor: "#7ac7ff"
  },
  chipText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700"
  }
});
