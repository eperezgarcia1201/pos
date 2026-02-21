import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
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
};

type LoginResponse = {
  token: string;
  user: SessionUser;
};

type OwnerDashboard = {
  generatedAt: string;
  date: string;
  threshold: number;
  summary: {
    paidOrders: number;
    grossSales: number;
    netSales: number;
    tax: number;
    discounts: number;
    openTickets: number;
    voidCount: number;
    voidTotal: number;
  };
  payments: Record<string, number>;
  byOrderType: Array<{ orderType: string; count: number; total: number }>;
  byCategory: Array<{ category: string; qty: number; revenue: number }>;
  topItems: Array<{ menuItemId: string; name: string; qty: number; revenue: number }>;
  openTickets: Array<{
    id: string;
    ticketNumber?: number | null;
    orderNumber?: number | null;
    status: string;
    orderType: string;
    tableName?: string | null;
    customerName?: string | null;
    serverName?: string | null;
    itemCount: number;
    totalAmount: number;
    updatedAt: string;
  }>;
  voidAlerts: Array<{
    userId: string | null;
    name: string;
    voidCount: number;
    voidTotal: number;
    lastVoidAt: string;
    tickets: Array<{ id: string; label: string; reason: string | null; total: number; at: string }>;
  }>;
};

const STORAGE_SERVER_URL = "websys_owner_server_url";
const STORAGE_SESSION = "websys_owner_session";

const DEFAULT_SERVER_URL = "http://localhost:8080";

function normalizeServerUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function todayDateValue() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value;
  return date.toLocaleString();
}

function ticketLabel(ticket: { id: string; ticketNumber?: number | null; orderNumber?: number | null }) {
  if (typeof ticket.ticketNumber === "number") return `#${ticket.ticketNumber}`;
  if (typeof ticket.orderNumber === "number") return `Order ${ticket.orderNumber}`;
  return ticket.id.slice(0, 6);
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
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
        const data = parsed as Record<string, unknown>;
        const detail = data.message ?? data.error;
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
      throw new Error("Request timed out. Check your network and server URL.");
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
  const [booting, setBooting] = useState(true);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [session, setSession] = useState<SessionState | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [date, setDate] = useState(todayDateValue);
  const [dashboard, setDashboard] = useState<OwnerDashboard | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const values = await AsyncStorage.multiGet([STORAGE_SERVER_URL, STORAGE_SESSION]);
        if (!active) return;
        const storedUrl = values.find(([key]) => key === STORAGE_SERVER_URL)?.[1];
        const storedSession = values.find(([key]) => key === STORAGE_SESSION)?.[1];
        if (storedUrl) {
          setServerUrl(storedUrl);
        }
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession) as SessionState;
            if (parsed?.token && parsed?.user?.id) {
              setSession(parsed);
            }
          } catch {
            // Ignore bad storage data.
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

  const loadDashboard = useCallback(
    async (showLoading: boolean) => {
      if (!session) return;
      const normalized = normalizeServerUrl(serverUrl);
      if (!normalized) {
        setDashboardError("Server URL is required.");
        return;
      }
      if (!isDateValue(date)) {
        setDashboardError("Date must be YYYY-MM-DD.");
        return;
      }
      if (showLoading) setLoadingDashboard(true);
      try {
        const data = await requestJson<OwnerDashboard>(
          normalized,
          `/owner/dashboard?date=${encodeURIComponent(date)}`,
          { headers: authHeaders(session) }
        );
        setDashboard(data);
        setDashboardError(null);
        if (normalized !== serverUrl) {
          setServerUrl(normalized);
        }
        await AsyncStorage.setItem(STORAGE_SERVER_URL, normalized);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load dashboard.";
        setDashboardError(message);
      } finally {
        if (showLoading) setLoadingDashboard(false);
      }
    },
    [date, serverUrl, session]
  );

  useEffect(() => {
    if (!session) return;
    void loadDashboard(true);
  }, [session, loadDashboard]);

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      void loadDashboard(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard, session]);

  const summaryCards = useMemo(() => {
    if (!dashboard) return [];
    return [
      { label: "Paid Orders", value: String(dashboard.summary.paidOrders) },
      { label: "Open Tickets", value: String(dashboard.summary.openTickets) },
      { label: "Gross Sales", value: formatMoney(dashboard.summary.grossSales) },
      { label: "Net Sales", value: formatMoney(dashboard.summary.netSales) },
      { label: "Tax", value: formatMoney(dashboard.summary.tax) },
      { label: "Void Count", value: String(dashboard.summary.voidCount) }
    ];
  }, [dashboard]);

  const signIn = useCallback(async () => {
    const normalized = normalizeServerUrl(serverUrl);
    if (!normalized) {
      setLoginError("Server URL is required.");
      return;
    }
    if (!username.trim() || !password) {
      setLoginError("Username and password are required.");
      return;
    }

    setSigningIn(true);
    setLoginError(null);

    try {
      const result = await requestJson<LoginResponse>(normalized, "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });

      const nextSession: SessionState = { token: result.token, user: result.user };
      setSession(nextSession);
      setPassword("");
      setDashboard(null);
      setDashboardError(null);
      setServerUrl(normalized);
      await AsyncStorage.multiSet([
        [STORAGE_SERVER_URL, normalized],
        [STORAGE_SESSION, JSON.stringify(nextSession)]
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in.";
      setLoginError(message);
    } finally {
      setSigningIn(false);
    }
  }, [password, serverUrl, username]);

  const signOut = useCallback(async () => {
    setSession(null);
    setDashboard(null);
    setDashboardError(null);
    await AsyncStorage.removeItem(STORAGE_SESSION);
  }, []);

  if (booting) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.centered}>
          <ActivityIndicator color="#9ec8ff" size="large" />
          <Text style={styles.subtitle}>Loading Websys POS Owner...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>WEBSYS POS</Text>
          <Text style={styles.title}>Owner App</Text>
          <Text style={styles.subtitle}>
            Connect to your store server and sign in with your Websys POS account.
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
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.help}>
            Use your backend machine local IP, not localhost, when testing on real phones.
          </Text>

          <Text style={styles.label}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="owner"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry
            placeholder="********"
            placeholderTextColor="#9ca3af"
          />

          {loginError ? <Text style={styles.error}>{loginError}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
            onPress={() => void signIn()}
            disabled={signingIn}
          >
            {signingIn ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.dashboardContainer}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>WEBSYS POS</Text>
            <Text style={styles.headerTitle}>Owner Dashboard</Text>
            <Text style={styles.subtitle}>
              {session.user.displayName || session.user.username} • {serverUrl}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.ghostButton, pressed ? styles.pressed : null]}
            onPress={() => void signOut()}
          >
            <Text style={styles.ghostButtonText}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Date & Sync</Text>
          <View style={styles.controlsRow}>
            <TextInput
              value={date}
              onChangeText={setDate}
              style={[styles.input, styles.compactInput]}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
            />
            <Pressable
              style={({ pressed }) => [styles.smallButton, pressed ? styles.pressed : null]}
              onPress={() => setDate(todayDateValue())}
            >
              <Text style={styles.buttonText}>Today</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.smallButton, pressed ? styles.pressed : null]}
              onPress={() => void loadDashboard(true)}
            >
              <Text style={styles.buttonText}>Refresh</Text>
            </Pressable>
          </View>
          {dashboard ? (
            <Text style={styles.help}>Last update: {formatDateTime(dashboard.generatedAt)}</Text>
          ) : null}
          {dashboardError ? <Text style={styles.error}>{dashboardError}</Text> : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Daily Snapshot</Text>
          {loadingDashboard && !dashboard ? <ActivityIndicator color="#9ec8ff" size="small" /> : null}
          <View style={styles.kpiGrid}>
            {summaryCards.map((card) => (
              <View key={card.label} style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{card.label}</Text>
                <Text style={styles.kpiValue}>{card.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.panel, dashboard && dashboard.voidAlerts.length > 0 ? styles.alertPanel : null]}>
          <Text style={styles.panelTitle}>Void Alerts</Text>
          {dashboard ? (
            <Text style={styles.help}>
              Alert when someone voids more than {dashboard.threshold} tickets in one day.
            </Text>
          ) : null}
          {!dashboard || dashboard.voidAlerts.length === 0 ? (
            <Text style={styles.help}>No void abuse alerts for this day.</Text>
          ) : (
            dashboard.voidAlerts.map((alert) => (
              <View key={`${alert.userId || alert.name}-${alert.lastVoidAt}`} style={styles.alertCard}>
                <View style={styles.alertTop}>
                  <Text style={styles.alertName}>{alert.name}</Text>
                  <Text style={styles.alertCount}>{alert.voidCount} voids</Text>
                </View>
                <Text style={styles.help}>
                  Total: {formatMoney(alert.voidTotal)} • Last void: {formatDateTime(alert.lastVoidAt)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Open Tickets</Text>
          {!dashboard || dashboard.openTickets.length === 0 ? (
            <Text style={styles.help}>No open tickets for this date.</Text>
          ) : (
            dashboard.openTickets.slice(0, 40).map((ticket) => (
              <View key={ticket.id} style={styles.rowCard}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle}>{ticketLabel(ticket)}</Text>
                  <Text style={styles.rowMeta}>{ticket.status}</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {ticket.tableName || ticket.customerName || "-"} • {ticket.serverName || "-"} •{" "}
                  {ticket.itemCount} items • {formatMoney(ticket.totalAmount)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b1020"
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12
  },
  authContainer: {
    padding: 20,
    gap: 10
  },
  dashboardContainer: {
    padding: 16,
    gap: 14
  },
  brand: {
    color: "#8ab4ff",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1.1
  },
  header: {
    backgroundColor: "#121a2e",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2a3a5a",
    gap: 8
  },
  headerTitle: {
    color: "#f7f9ff",
    fontSize: 20,
    fontWeight: "700"
  },
  title: {
    color: "#f7f9ff",
    fontSize: 28,
    fontWeight: "700"
  },
  subtitle: {
    color: "#b5c0d9",
    fontSize: 14
  },
  label: {
    color: "#d2dbef",
    fontSize: 13,
    marginTop: 6
  },
  input: {
    backgroundColor: "#151d32",
    color: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#31476f",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16
  },
  compactInput: {
    flex: 1,
    minWidth: 130
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: "#2864d8",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  smallButton: {
    backgroundColor: "#2864d8",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  ghostButton: {
    alignSelf: "flex-start",
    backgroundColor: "#1a2742",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#31476f"
  },
  ghostButtonText: {
    color: "#d8e2ff",
    fontSize: 14,
    fontWeight: "600"
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  pressed: {
    opacity: 0.82
  },
  error: {
    color: "#ff9ea5",
    fontSize: 13
  },
  help: {
    color: "#b0bdd8",
    fontSize: 13,
    lineHeight: 18
  },
  panel: {
    backgroundColor: "#121a2e",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2a3a5a",
    gap: 10
  },
  panelTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700"
  },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center"
  },
  kpiGrid: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  kpiCard: {
    minWidth: "47%",
    backgroundColor: "#17233f",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#2f4670"
  },
  kpiLabel: {
    color: "#9eb0d4",
    fontSize: 12
  },
  kpiValue: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700"
  },
  alertPanel: {
    borderColor: "#8e4f25",
    backgroundColor: "#2a1a11"
  },
  alertCard: {
    backgroundColor: "#352116",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#774828",
    padding: 10,
    gap: 4
  },
  alertTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6
  },
  alertName: {
    color: "#fff2df",
    fontSize: 16,
    fontWeight: "700"
  },
  alertCount: {
    color: "#ffd19e",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  rowCard: {
    backgroundColor: "#17233f",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f4670",
    padding: 10,
    gap: 4
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6
  },
  rowTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  rowMeta: {
    color: "#aec0e8",
    fontSize: 13
  }
});
