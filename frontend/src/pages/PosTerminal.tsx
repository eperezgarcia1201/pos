import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import PinGate from "../components/PinGate";
import { goBackOrHome } from "../lib/navigation";
import { clearCurrentUser, getCurrentUser } from "../lib/session";
import { getStationContext, loadStation, type StationConfig } from "../lib/station";
import { autoCorrectText, autoCorrectTextLocal, detectLanguageForText } from "../lib/spellcheck";

type MenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
  color?: string | null;
  visible?: boolean;
};

type MenuItem = {
  id: string;
  name: string;
  price: string;
  categoryId: string | null;
  groupId: string | null;
  color?: string | null;
  barcode?: string | null;
  visible?: boolean;
  availability?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    enabled: boolean;
  }>;
};

type DiningTable = {
  id: string;
  name: string;
  status: string;
  areaId: string | null;
};

type TableArea = {
  id: string;
  name: string;
  sortOrder: number;
};

type MenuGroup = {
  id: string;
  name: string;
  categoryId: string;
  sortOrder?: number | null;
  visible?: boolean;
};

type MenuModifier = {
  id: string;
  name: string;
  price: string;
  groupId: string;
  active?: boolean;
};

type MenuModifierGroup = {
  id: string;
  name: string;
  modifiers: MenuModifier[];
};

type TicketItem = {
  orderItemId: string;
  menuItemId?: string | null;
  name: string;
  price: number;
  qty: number;
  modifiers?: Array<{ label: string; price: number; qty: number }>;
};

type OrderSummary = {
  id: string;
  ticketNumber?: number | null;
  orderNumber?: number | null;
  status: string;
  orderType: string;
  createdAt?: string;
  dueAmount?: number | string | null;
  legacyPayload?: unknown;
  table: { id: string; name: string } | null;
  server?: { id: string; username: string; displayName?: string | null } | null;
  customerName: string | null;
  numberOfGuests: number | null;
  taxExempt: boolean | null;
  serviceCharge: string | number | null;
  deliveryCharge: string | number | null;
  subtotalAmount?: number | null;
  taxAmount?: number | null;
  totalAmount: number | null;
  items: Array<{
    id: string;
    menuItemId?: string | null;
    name: string | null;
    price: string;
    quantity: number;
    modifiers?: Array<{
      id: string;
      quantity: number;
      price: string;
      customName?: string | null;
      modifier: { name: string };
    }>;
  }>;
};

type ModifierGroupLink = {
  id: string;
  minRequired: number | null;
  maxAllowed: number | null;
  group: {
    id: string;
    name: string;
    modifiers: Array<{ id: string; name: string; price: string }>
  };
};

type TerminalServicesSetting = {
  dineIn: boolean;
  takeOut: boolean;
  delivery: boolean;
  appetizerQuickSendEnabled: boolean;
  appetizerCategoryKeywords: string[];
};

const orderTypeLabels: Record<string, string> = {
  dinein: "Dine In",
  takeout: "Take Out",
  delivery: "Delivery"
};

const DINE_IN_TABLE_REQUIRED_MESSAGE = "You need to select a table first to continue.";
const HOLD_REQUIRES_ITEMS_MESSAGE = "You cannot save a ticket without items. Add at least one item first.";
const DEFAULT_APPETIZER_KEYWORDS = ["appetizer", "appetizers"];

type ChainPayloadMeta = {
  chainGroupId?: string;
  chainIndex?: number;
};

function parseChainPayloadMeta(payload: unknown): ChainPayloadMeta {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const raw = payload as Record<string, unknown>;
  const chainGroupId =
    typeof raw.chainGroupId === "string" && raw.chainGroupId.trim().length > 0
      ? raw.chainGroupId
      : undefined;
  const chainIndexValue = raw.chainIndex;
  const chainIndex =
    typeof chainIndexValue === "number"
      ? chainIndexValue
      : typeof chainIndexValue === "string" && chainIndexValue.trim().length > 0
        ? Number(chainIndexValue)
        : undefined;
  return {
    chainGroupId,
    chainIndex: Number.isFinite(chainIndex ?? NaN) ? chainIndex : undefined
  };
}

function sortTableChecksByChain(checks: OrderSummary[]) {
  return [...checks].sort((a, b) => {
    const aMeta = parseChainPayloadMeta(a.legacyPayload);
    const bMeta = parseChainPayloadMeta(b.legacyPayload);
    const aIndex = typeof aMeta.chainIndex === "number" ? aMeta.chainIndex : Number.MAX_SAFE_INTEGER;
    const bIndex = typeof bMeta.chainIndex === "number" ? bMeta.chainIndex : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    const aSafe = Number.isNaN(aTime) ? Number.MAX_SAFE_INTEGER : aTime;
    const bSafe = Number.isNaN(bTime) ? Number.MAX_SAFE_INTEGER : bTime;
    if (aSafe !== bSafe) return aSafe - bSafe;
    return a.id.localeCompare(b.id);
  });
}

function formatOrderTypeLabel(orderType: string) {
  if (!orderType) return "Dine In";
  if (orderType === "DINE_IN") return "Dine In";
  if (orderType === "TAKEOUT") return "Take Out";
  if (orderType === "DELIVERY") return "Delivery";
  return orderType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseSentItemIds(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [] as string[];
  const raw = (payload as Record<string, unknown>).sentItemIds;
  if (!Array.isArray(raw)) return [] as string[];
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function parseAppetizerKeywords(value: unknown) {
  if (Array.isArray(value)) {
    const parsed = value
      .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
      .filter((entry) => entry.length > 0);
    return parsed.length > 0 ? parsed : DEFAULT_APPETIZER_KEYWORDS;
  }
  if (typeof value === "string") {
    const parsed = value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
    return parsed.length > 0 ? parsed : DEFAULT_APPETIZER_KEYWORDS;
  }
  return DEFAULT_APPETIZER_KEYWORDS;
}

export default function PosTerminal() {
  const { mode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const orderType = mode && orderTypeLabels[mode] ? orderTypeLabels[mode] : "Dine In";
  const orderTypeValue = mode === "takeout" ? "TAKEOUT" : mode === "delivery" ? "DELIVERY" : "DINE_IN";
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [pinOpen, setPinOpen] = useState(() => !getCurrentUser());
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [modifierGroups, setModifierGroups] = useState<MenuModifierGroup[]>([]);
  const [scanValue, setScanValue] = useState("");
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [tableAreas, setTableAreas] = useState<TableArea[]>([]);
  const [tableSelectOpen, setTableSelectOpen] = useState(false);
  const [tableChecksOpen, setTableChecksOpen] = useState(false);
  const [tableChecksLoading, setTableChecksLoading] = useState(false);
  const [tableChecksTableId, setTableChecksTableId] = useState<string | null>(null);
  const [tableChecksTableName, setTableChecksTableName] = useState("");
  const [tableChecks, setTableChecks] = useState<OrderSummary[]>([]);
  const [selectedTableCheckId, setSelectedTableCheckId] = useState<string | null>(null);
  const [openTicketTableIds, setOpenTicketTableIds] = useState<Set<string>>(new Set());
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [tablePrompted, setTablePrompted] = useState(false);
  const ticketListRef = useRef<HTMLDivElement | null>(null);
  const tableCheckItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string>("");
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number>(0);
  const [orderSubtotal, setOrderSubtotal] = useState<number>(0);
  const [orderTax, setOrderTax] = useState<number>(0);
  const [groupTicketItems, setGroupTicketItems] = useState(false);
  const [orderNumbers, setOrderNumbers] = useState<{ ticketNumber: number | null; orderNumber: number | null }>({
    ticketNumber: null,
    orderNumber: null
  });
  const [selectedTicketItemId, setSelectedTicketItemId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    tableId: string;
    customerName: string;
    numberOfGuests: string;
    taxExempt: boolean;
    serviceCharge: string;
    deliveryCharge: string;
  }>({
    tableId: "",
    customerName: "",
    numberOfGuests: "",
    taxExempt: false,
    serviceCharge: "",
    deliveryCharge: ""
  });
  const [recallOpen, setRecallOpen] = useState(false);
  const [recallOrders, setRecallOrders] = useState<OrderSummary[]>([]);
  const [recallSearch, setRecallSearch] = useState("");
  const [recallSearchBy, setRecallSearchBy] = useState<"ticket" | "order">("ticket");
  const [recallTab, setRecallTab] = useState<"open" | "settled">("open");
  const [recallStatus, setRecallStatus] = useState("any");
  const [recallDateFrom, setRecallDateFrom] = useState("");
  const [recallDateTo, setRecallDateTo] = useState("");
  const [recallServerFilter, setRecallServerFilter] = useState("mine");
  const [recallServers, setRecallServers] = useState<Array<{ id: string; username: string; displayName?: string | null }>>([]);
  const [discounts, setDiscounts] = useState<Array<{ id: string; name: string }>>([]);
  const [services, setServices] = useState<TerminalServicesSetting>({
    dineIn: true,
    takeOut: true,
    delivery: true,
    appetizerQuickSendEnabled: false,
    appetizerCategoryKeywords: DEFAULT_APPETIZER_KEYWORDS
  });
  const [sentItemIds, setSentItemIds] = useState<string[]>([]);
  const [station, setStation] = useState<StationConfig | null>(null);
  const stationContext = useMemo(() => getStationContext(station), [station]);
  const [stationName, setStationName] = useState("");
  const [serviceBlocked, setServiceBlocked] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [selectedDiscountId, setSelectedDiscountId] = useState("");
  const [splitSelection, setSplitSelection] = useState<Record<string, boolean>>({});
  const [paymentDraft, setPaymentDraft] = useState({
    method: "CASH",
    amount: "",
    tenderAmount: "",
    tipAmount: "",
    customLabel: ""
  });
  const [paymentPrintReceipt, setPaymentPrintReceipt] = useState(true);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [modifierModal, setModifierModal] = useState<{
    item: MenuItem;
    links: ModifierGroupLink[];
    selections: Record<string, string[]>;
  } | null>(null);
  const [modifierBoardOpen, setModifierBoardOpen] = useState(false);
  const [modifierAlpha, setModifierAlpha] = useState("");
  const [activeModifierGroupId, setActiveModifierGroupId] = useState<string | null>(null);
  const [modifierQueue, setModifierQueue] = useState<
    Array<{ id?: string; name: string; price: number; qty: number; customName?: string }>
  >([]);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [manualModifierText, setManualModifierText] = useState("");
  const [notePadOpen, setNotePadOpen] = useState(false);
  const [notePadText, setNotePadText] = useState("");
  const [notePadSuggestion, setNotePadSuggestion] = useState<string | null>(null);
  const notePadInputRef = useRef<HTMLInputElement | null>(null);
  const modifierListRef = useRef<HTMLDivElement | null>(null);
  const lastAddedItemIdRef = useRef<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [cats, menuGroups, menuItems, discountList, tableList, areaList] = await Promise.all([
          apiFetch("/menu/categories"),
          apiFetch("/menu/groups"),
          apiFetch("/menu/items"),
          apiFetch("/discounts"),
          apiFetch("/tables"),
          apiFetch("/table-areas")
        ]);
        setCategories(cats);
        setGroups(menuGroups);
        setItems(menuItems);
        setDiscounts(discountList);
        setTables(tableList);
        setTableAreas(areaList);
        try {
          const serviceSetting = await apiFetch("/settings/services");
          if (serviceSetting?.value) {
            setServices({
              dineIn: serviceSetting.value.dineIn !== false,
              takeOut: serviceSetting.value.takeOut !== false,
              delivery: serviceSetting.value.delivery !== false,
              appetizerQuickSendEnabled: serviceSetting.value.appetizerQuickSendEnabled === true,
              appetizerCategoryKeywords: parseAppetizerKeywords(serviceSetting.value.appetizerCategoryKeywords)
            });
          }
        } catch {
          // ignore
        }
        try {
          const stationValue = await loadStation();
          if (stationValue) {
            setStation(stationValue);
            if (stationValue.name) {
              setStationName(stationValue.name);
            }
          }
          const storeSetting = await apiFetch("/settings/store");
          if (!stationValue?.name && storeSetting?.value?.stationName) {
            setStationName(storeSetting.value.stationName);
          }
        } catch {
          // ignore
        }
        try {
          const ticketSetting = await apiFetch("/settings/ticketing");
          if (ticketSetting?.value) {
            setGroupTicketItems(ticketSetting.value.groupTicketItems === true);
          }
        } catch {
          // ignore
        }
        if (!activeAreaId) {
          setActiveAreaId(null);
        }
        const firstVisible = cats.find((cat: MenuCategory) => cat.visible !== false) || cats[0];
        setActiveCategory(firstVisible?.id ?? null);
        if (menuGroups.length > 0) {
          const firstGroup = menuGroups.find((group: MenuGroup) => group.categoryId === firstVisible?.id);
          setActiveGroupId(firstGroup?.id ?? "");
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const serviceEnabled = useMemo(() => {
    if (orderTypeValue === "DINE_IN") return services.dineIn;
    if (orderTypeValue === "TAKEOUT") return services.takeOut;
    if (orderTypeValue === "DELIVERY") return services.delivery;
    return true;
  }, [orderTypeValue, services]);

  useEffect(() => {
    setServiceBlocked(!serviceEnabled);
  }, [serviceEnabled]);

  useEffect(() => {
    if (!selectedDiscountId && discounts.length > 0) {
      setSelectedDiscountId(discounts[0].id);
    }
  }, [discounts, selectedDiscountId]);

  useEffect(() => {
    if (!activeCategory) return;
    const groupForCategory = groups.find((group) => group.categoryId === activeCategory);
    setActiveGroupId(groupForCategory?.id ?? "");
  }, [activeCategory, groups]);

  useEffect(() => {
    const action = new URLSearchParams(location.search).get("action");
    if (action === "recall") {
      const orderParam = new URLSearchParams(location.search).get("order");
      if (orderParam) {
        refreshOrder(orderParam).catch(console.error);
      } else {
        openRecall().catch(console.error);
      }
    }
  }, [location.search]);

  useEffect(() => {
    if (orderTypeValue !== "DINE_IN") return;
    if (tablePrompted) return;
    if (orderDetails.tableId) return;
    if (pinOpen) return;
    setActiveAreaId(null);
    setTableSelectOpen(true);
    setTablePrompted(true);
  }, [orderTypeValue, tables.length, orderDetails.tableId, tablePrompted, pinOpen]);


  const filteredItems = useMemo(() => {
    if (!activeCategory) return items;
    return items.filter((item) => item.categoryId === activeCategory && item.visible !== false);
  }, [items, activeCategory]);

  const filteredGroups = useMemo(() => {
    if (!activeCategory) return [];
    return groups.filter((group) => group.categoryId === activeCategory && group.visible !== false);
  }, [groups, activeCategory]);

  const sentItemIdSet = useMemo(() => new Set(sentItemIds), [sentItemIds]);

  const unsentTicketItemIds = useMemo(
    () => ticketItems.filter((item) => !sentItemIdSet.has(item.orderItemId)).map((item) => item.orderItemId),
    [ticketItems, sentItemIdSet]
  );

  const menuItemsById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    items.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [items]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, MenuCategory>();
    categories.forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categories]);

  const appetizerUnsentItemIds = useMemo(() => {
    if (orderTypeValue !== "DINE_IN") return [] as string[];
    if (!services.appetizerQuickSendEnabled) return [] as string[];
    const keywords = services.appetizerCategoryKeywords
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
    if (keywords.length === 0) return [] as string[];

    return ticketItems
      .filter((item) => !sentItemIdSet.has(item.orderItemId))
      .filter((item) => {
        if (!item.menuItemId) return false;
        const menuItem = menuItemsById.get(item.menuItemId);
        if (!menuItem?.categoryId) return false;
        const categoryName = categoriesById.get(menuItem.categoryId)?.name ?? "";
        const normalized = categoryName.trim().toLowerCase();
        if (!normalized) return false;
        return keywords.some((keyword) => normalized.includes(keyword));
      })
      .map((item) => item.orderItemId);
  }, [
    orderTypeValue,
    services.appetizerQuickSendEnabled,
    services.appetizerCategoryKeywords,
    ticketItems,
    sentItemIdSet,
    menuItemsById,
    categoriesById
  ]);

  const isItemAvailable = (item: MenuItem) => {
    if (!item.availability || item.availability.length === 0) return true;
    const now = new Date();
    const day = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return item.availability.some((slot) => {
      if (!slot.enabled || slot.dayOfWeek !== day) return false;
      const [startH, startM] = slot.startTime.split(":").map(Number);
      const [endH, endM] = slot.endTime.split(":").map(Number);
      const startMinutes = (startH || 0) * 60 + (startM || 0);
      const endMinutes = (endH || 0) * 60 + (endM || 0);
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    });
  };

  const visibleItems = useMemo(() => {
    const withGroup = activeGroupId
      ? filteredItems.filter((item) => item.groupId === activeGroupId)
      : filteredItems;
    return withGroup.filter(isItemAvailable);
  }, [filteredItems, activeGroupId]);

  const visibleCategories = useMemo(
    () => categories.filter((cat) => cat.visible !== false),
    [categories]
  );

  const categoryColorMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat) => {
      if (cat.color) {
        map.set(cat.id, cat.color);
      }
    });
    return map;
  }, [categories]);

  const assignedTable = useMemo(() => {
    if (!orderDetails.tableId) return null;
    return tables.find((table) => table.id === orderDetails.tableId) ?? null;
  }, [tables, orderDetails.tableId]);

  const filteredTables = useMemo(() => {
    if (!activeAreaId) return tables;
    return tables.filter((table) => table.areaId === activeAreaId);
  }, [tables, activeAreaId]);

  const unplacedIndex = useMemo(() => {
    const map = new Map<string, number>();
    filteredTables
      .filter((table) => table.posX === null || table.posX === undefined || table.posY === null || table.posY === undefined)
      .forEach((table, idx) => map.set(table.id, idx));
    return map;
  }, [filteredTables]);

  useEffect(() => {
    if (!tableSelectOpen) return;
    const measure = () => {
      const rect = mapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMapSize({ width: rect.width, height: rect.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tableSelectOpen, filteredTables.length, activeAreaId]);

  const fallbackSubtotal = ticketItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const subtotal = orderSubtotal || fallbackSubtotal;
  const taxAmount = orderTax || 0;
  const subtotalWithTax = subtotal + taxAmount;
  const total = orderTotal || subtotalWithTax;

  const paymentAmount = Number(paymentDraft.amount || 0);
  const paymentTender = Number(paymentDraft.tenderAmount || 0);
  const paymentTip = Number(paymentDraft.tipAmount || 0);
  const paymentChange =
    paymentDraft.method === "CASH" ? Math.max(0, paymentTender - paymentAmount) : 0;

  const displayTicketItems = useMemo(() => {
    if (!groupTicketItems) {
      return ticketItems.map((item) => ({
        key: item.orderItemId,
        name: item.name,
        price: item.price,
        qty: item.qty,
        menuItemId: item.menuItemId ?? null,
        modifiers: item.modifiers || [],
        lines: [{ orderItemId: item.orderItemId, qty: item.qty }]
      }));
    }
    const grouped = new Map<
      string,
      {
        key: string;
        name: string;
        price: number;
        qty: number;
        menuItemId: string | null;
        modifiers: Array<{ label: string; price: number; qty: number }>;
        lines: Array<{ orderItemId: string; qty: number }>;
      }
    >();
    for (const item of ticketItems) {
      const key = `${item.menuItemId ?? item.name}|${item.price}`;
      const entry = grouped.get(key) ?? {
        key,
        name: item.name,
        price: item.price,
        qty: 0,
        menuItemId: item.menuItemId ?? null,
        modifiers: [],
        lines: []
      };
      entry.qty += item.qty;
      entry.lines.push({ orderItemId: item.orderItemId, qty: item.qty });
      if (item.modifiers && item.modifiers.length > 0) {
        for (const mod of item.modifiers) {
          const modKey = `${mod.label}|${mod.price}`;
          const existing = entry.modifiers.find((m) => `${m.label}|${m.price}` === modKey);
          if (existing) {
            existing.qty += mod.qty * item.qty;
          } else {
            entry.modifiers.push({ ...mod, qty: mod.qty * item.qty });
          }
        }
      }
      grouped.set(key, entry);
    }
    return Array.from(grouped.values());
  }, [ticketItems, groupTicketItems]);

  const recallCounts = useMemo(() => {
    return {
      total: recallOrders.length,
      open: recallOrders.filter((o) => o.status === "OPEN").length,
      sent: recallOrders.filter((o) => o.status === "SENT").length,
      hold: recallOrders.filter((o) => o.status === "HOLD").length
    };
  }, [recallOrders]);

  useEffect(() => {
    if (ticketItems.length === 0) {
      if (selectedTicketItemId) setSelectedTicketItemId(null);
      return;
    }
    if (lastAddedItemIdRef.current) {
      const exists = ticketItems.some((item) => item.orderItemId === lastAddedItemIdRef.current);
      if (exists) {
        setSelectedTicketItemId(lastAddedItemIdRef.current);
        lastAddedItemIdRef.current = null;
        return;
      }
    }
    const exists = selectedTicketItemId
      ? ticketItems.some((item) => item.orderItemId === selectedTicketItemId)
      : false;
    if (!exists) {
      setSelectedTicketItemId(ticketItems[ticketItems.length - 1].orderItemId);
    }
  }, [ticketItems, selectedTicketItemId]);

  useEffect(() => {
    if (!modifierBoardOpen) return;
    if (modifierGroups.length > 0) {
      if (!activeModifierGroupId) {
        setActiveModifierGroupId(modifierGroups[0]?.id ?? null);
      }
      return;
    }
    apiFetch("/modifier-groups")
      .then((data) => {
        setModifierGroups(data);
        setActiveModifierGroupId(data?.[0]?.id ?? null);
      })
      .catch(console.error);
  }, [modifierBoardOpen, modifierGroups.length, activeModifierGroupId]);

  const selectedTicketItemName = useMemo(() => {
    if (!selectedTicketItemId) return "";
    const item = ticketItems.find((entry) => entry.orderItemId === selectedTicketItemId);
    return item?.name || "";
  }, [selectedTicketItemId, ticketItems]);

  const visibleModifierGroups = useMemo(() => {
    return modifierGroups.filter((group) => group.modifiers?.length);
  }, [modifierGroups]);

  const visibleModifiers = useMemo(() => {
    const group = activeModifierGroupId
      ? visibleModifierGroups.find((entry) => entry.id === activeModifierGroupId)
      : null;
    const list = group ? group.modifiers : visibleModifierGroups.flatMap((entry) => entry.modifiers);
    if (!modifierAlpha) return list;
    return list.filter((mod) => mod.name.toUpperCase().startsWith(modifierAlpha));
  }, [activeModifierGroupId, modifierAlpha, visibleModifierGroups]);

  const openModifierBoard = () => {
    if (!orderId) return;
    const fallbackId = ticketItems[0]?.orderItemId ?? null;
    const targetId = selectedTicketItemId || fallbackId;
    if (!targetId) {
      setAlertMessage("Select an item on the ticket first.");
      return;
    }
    if (!selectedTicketItemId && fallbackId) {
      setSelectedTicketItemId(fallbackId);
    }
    setModifierQueue([]);
    setModifierAlpha("");
    setModifierBoardOpen(true);
  };

  const addModifierToQueue = (mod: MenuModifier) => {
    setModifierQueue((prev) => {
      const existing = prev.find((entry) => entry.id === mod.id);
      if (existing) {
        return prev.map((entry) =>
          entry.id === mod.id ? { ...entry, qty: entry.qty + 1 } : entry
        );
      }
      return [...prev, { id: mod.id, name: mod.name, price: Number(mod.price), qty: 1 }];
    });
  };

  const queueManualModifier = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setModifierQueue((prev) => {
      const existing = prev.find((entry) => !entry.id && entry.customName === trimmed);
      if (existing) {
        return prev.map((entry) =>
          entry.customName === trimmed && !entry.id ? { ...entry, qty: entry.qty + 1 } : entry
        );
      }
      return [...prev, { name: trimmed, customName: trimmed, price: 0, qty: 1 }];
    });
    setManualModifierText("");
  };

  const addManualModifier = async (text: string) => {
    const correction = await autoCorrectText(text, detectLanguageForText(text));
    queueManualModifier(correction.text);
  };

  const applyModifierQueue = async (closeAfter: boolean) => {
    if (!orderId || !selectedTicketItemId) return;
    if (modifierQueue.length === 0) {
      if (closeAfter) setModifierBoardOpen(false);
      return;
    }
    try {
      for (const entry of modifierQueue) {
        for (let i = 0; i < entry.qty; i += 1) {
          await apiFetch(`/orders/${orderId}/items/${selectedTicketItemId}/modifiers`, {
            method: "POST",
            body: JSON.stringify(
              entry.id
                ? { modifierId: entry.id }
                : { customName: entry.customName || entry.name }
            )
          });
        }
      }
      await refreshOrder(orderId);
      setModifierQueue([]);
      if (closeAfter) setModifierBoardOpen(false);
    } catch (err) {
      console.error(err);
      setAlertMessage("Unable to add modifiers.");
    }
  };

  const openNotePad = () => {
    setNotePadText("");
    setNotePadSuggestion(null);
    setNotePadOpen(true);
  };

  const addNoteFromPad = async () => {
    const raw = (notePadInputRef.current?.value ?? notePadText).trim();
    if (!raw) return;
    const detectedLanguage = detectLanguageForText(raw);
    const localCorrected = autoCorrectTextLocal(raw, detectedLanguage).text;
    const correction = await autoCorrectText(localCorrected, detectedLanguage);
    const finalText = (correction.text || localCorrected || raw).trim();
    queueManualModifier(finalText);
    setNotePadText(finalText);
    setNotePadOpen(false);
  };

  useEffect(() => {
    const text = notePadText.trim();
    if (!text) {
      setNotePadSuggestion(null);
      return;
    }

    const language = detectLanguageForText(text);
    const immediate = autoCorrectTextLocal(text, language).text.trim();
    setNotePadSuggestion(immediate && immediate !== text ? immediate : null);

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      const correction = await autoCorrectText(text, language);
      if (cancelled) return;
      const suggested = correction.text.trim();
      setNotePadSuggestion(suggested && suggested !== text ? suggested : null);
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [notePadText]);

  const scrollModifierList = (direction: "up" | "down") => {
    const list = modifierListRef.current;
    if (!list) return;
    const delta = direction === "up" ? -120 : 120;
    list.scrollBy({ top: delta, behavior: "smooth" });
  };

  const refreshOrder = async (id: string) => {
    try {
      const order = (await apiFetch(`/orders/${id}`)) as OrderSummary;
      setOrderId(order.id);
      setOrderTotal(order.totalAmount ? Number(order.totalAmount) : 0);
      setOrderSubtotal(order.subtotalAmount ? Number(order.subtotalAmount) : 0);
      setOrderTax(order.taxAmount ? Number(order.taxAmount) : 0);
      setOrderNumbers({
        ticketNumber: order.ticketNumber ?? null,
        orderNumber: order.orderNumber ?? null
      });
      setOrderDetails({
        tableId: order.table?.id ?? "",
        customerName: order.customerName ?? "",
        numberOfGuests: order.numberOfGuests ? String(order.numberOfGuests) : "",
        taxExempt: order.taxExempt ?? false,
        serviceCharge: order.serviceCharge ? String(order.serviceCharge) : "",
        deliveryCharge: order.deliveryCharge ? String(order.deliveryCharge) : ""
      });
      setSentItemIds(parseSentItemIds(order.legacyPayload));
      setTicketItems(
        order.items.map((item) => ({
          orderItemId: item.id,
          menuItemId: item.menuItemId ?? null,
          name: item.name || "Item",
          price: Number(item.price),
          qty: item.quantity,
          modifiers: (item.modifiers || []).map((mod) => ({
            label: mod.customName || mod.modifier?.name || "Modifier",
            price: Number(mod.price),
            qty: mod.quantity ?? 1
          }))
        }))
      );
      if (!order.server?.id && currentUser?.id) {
        try {
          await apiFetch(`/orders/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ serverId: currentUser.id })
          });
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const sendItemsToKitchen = async (targetOrderId: string, itemIds?: string[]) => {
    const payload: Record<string, unknown> = {
      ...stationContext
    };
    if (itemIds && itemIds.length > 0) {
      payload.itemIds = itemIds;
    }
    await apiFetch(`/orders/${targetOrderId}/send-kitchen`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  };

  const printOrderReceipt = async (targetOrderId: string) => {
    await apiFetch(`/orders/${targetOrderId}/print-receipt`, {
      method: "POST",
      body: JSON.stringify({
        serverName: currentUser?.displayName || currentUser?.username || undefined,
        stationName: stationName || undefined,
        ...stationContext
      })
    });
  };

  const loadOpenChecksForTable = async (tableId: string) => {
    const openOrders = (await apiFetch("/orders/open?status=OPEN,SENT,HOLD")) as OrderSummary[];
    const tableOrders = openOrders.filter((order) => order.table?.id === tableId);
    if (tableOrders.length === 0) return [];
    const detailed = await Promise.all(
      tableOrders.map(async (order) => {
        try {
          return (await apiFetch(`/orders/${order.id}`)) as OrderSummary;
        } catch {
          return order;
        }
      })
    );
    return sortTableChecksByChain(detailed);
  };

  const refreshOpenTicketTableIds = async () => {
    try {
      const openOrders = (await apiFetch("/orders/open?status=OPEN,SENT,HOLD")) as OrderSummary[];
      const ids = new Set<string>();
      openOrders.forEach((order) => {
        if (order.table?.id) {
          ids.add(order.table.id);
        }
      });
      setOpenTicketTableIds(ids);
    } catch {
      setOpenTicketTableIds(new Set());
    }
  };

  const openTableChecksForTable = async (tableId: string) => {
    const table = tables.find((entry) => entry.id === tableId);
    setTableChecksLoading(true);
    try {
      const checks = await loadOpenChecksForTable(tableId);
      if (checks.length === 0) {
        setTableChecks([]);
        setSelectedTableCheckId(null);
        setTableChecksOpen(false);
        return false;
      }
      setTableChecksTableId(tableId);
      setTableChecksTableName(table?.name ?? "Table");
      setTableChecks(checks);
      const preferredId = checks.find((entry) => entry.id === orderId)?.id ?? checks[0].id;
      setSelectedTableCheckId(preferredId);
      setTableChecksOpen(true);
      return true;
    } finally {
      setTableChecksLoading(false);
    }
  };

  const handleTableChecksEdit = async () => {
    if (!selectedTableCheckId) return;
    await refreshOrder(selectedTableCheckId);
    setTableChecksOpen(false);
  };

  const handleTableChecksNew = async () => {
    const baseOrderId = selectedTableCheckId || tableChecks[tableChecks.length - 1]?.id;
    if (!baseOrderId) return;
    setTableChecksLoading(true);
    try {
      const result = await apiFetch(`/orders/${baseOrderId}/chain`, { method: "POST" });
      const nextOrderId = result?.order?.id ? String(result.order.id) : null;
      if (!nextOrderId) {
        setAlertMessage("Unable to open new check.");
        return;
      }
      await refreshOrder(nextOrderId);
      setTableChecksOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create chained check.";
      setAlertMessage(message);
    } finally {
      setTableChecksLoading(false);
    }
  };

  const handleTableChecksPrint = async () => {
    if (!selectedTableCheckId) return;
    setTableChecksLoading(true);
    try {
      await printOrderReceipt(selectedTableCheckId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to print check.";
      setAlertMessage(message);
    } finally {
      setTableChecksLoading(false);
    }
  };

  const handleTableChecksPrintAll = async () => {
    if (tableChecks.length === 0) return;
    setTableChecksLoading(true);
    try {
      for (const check of tableChecks) {
        await printOrderReceipt(check.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to print all checks.";
      setAlertMessage(message);
    } finally {
      setTableChecksLoading(false);
    }
  };

  const enforceDineInTableSelection = () => {
    if (orderTypeValue !== "DINE_IN") return true;
    const hasTable = Boolean(orderDetails.tableId);
    if (hasTable) return true;
    setTableSelectOpen(true);
    setAlertMessage(DINE_IN_TABLE_REQUIRED_MESSAGE);
    return false;
  };

  const createOrderIfNeeded = async () => {
    if (!enforceDineInTableSelection()) return null;
    if (orderId) return orderId;
    const order = await apiFetch("/orders", {
      method: "POST",
      body: JSON.stringify({
        serverId: currentUser?.id || undefined,
        orderType: orderTypeValue,
        tableId: orderDetails.tableId || undefined,
        customerName: orderDetails.customerName || undefined,
        numberOfGuests: orderDetails.numberOfGuests ? Number(orderDetails.numberOfGuests) : undefined,
        taxExempt: orderDetails.taxExempt,
        serviceCharge: orderDetails.serviceCharge ? Number(orderDetails.serviceCharge) : undefined,
        deliveryCharge: orderDetails.deliveryCharge ? Number(orderDetails.deliveryCharge) : undefined
      })
    });
    setOrderId(order.id);
    setOrderNumbers({
      ticketNumber: order.ticketNumber ?? null,
      orderNumber: order.orderNumber ?? null
    });
    setOrderSubtotal(order.subtotalAmount ? Number(order.subtotalAmount) : 0);
    setOrderTax(order.taxAmount ? Number(order.taxAmount) : 0);
    return order.id as string;
  };

  const updateOrderDetails = async (patch: Partial<typeof orderDetails>) => {
    const currentId = await createOrderIfNeeded();
    if (!currentId) return;
    const tableIdValue = patch.tableId ?? orderDetails.tableId;
    const customerNameValue = patch.customerName ?? orderDetails.customerName;
    const guestsValue = patch.numberOfGuests ?? orderDetails.numberOfGuests;
    const serviceValue = patch.serviceCharge ?? orderDetails.serviceCharge;
    const deliveryValue = patch.deliveryCharge ?? orderDetails.deliveryCharge;
    const payload = {
      tableId: tableIdValue || undefined,
      customerName: customerNameValue || undefined,
      numberOfGuests: guestsValue ? Number(guestsValue) : undefined,
      taxExempt: patch.taxExempt ?? orderDetails.taxExempt,
      serviceCharge: serviceValue ? Number(serviceValue) : undefined,
      deliveryCharge: deliveryValue ? Number(deliveryValue) : undefined
    };

    await apiFetch(`/orders/${currentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    await refreshOrder(currentId);
  };

  const selectTable = async (tableId: string) => {
    setOrderDetails((prev) => ({ ...prev, tableId }));
    setTableSelectOpen(false);
    if (orderTypeValue !== "DINE_IN") return;
    try {
      const hasOpenChecks = await openTableChecksForTable(tableId);
      if (hasOpenChecks) {
        return;
      }
      if (orderId) {
        await apiFetch(`/orders/${orderId}/table`, {
          method: "POST",
          body: JSON.stringify({ tableId })
        });
        await refreshOrder(orderId);
      } else {
        const created = await apiFetch("/orders", {
          method: "POST",
          body: JSON.stringify({ orderType: orderTypeValue, tableId })
        });
        setOrderId(created.id);
        await apiFetch(`/orders/${created.id}/table`, {
          method: "POST",
          body: JSON.stringify({ tableId })
        });
        await refreshOrder(created.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addItem = async (item: MenuItem) => {
    if (!enforceDineInTableSelection()) return;
    try {
      const links = (await apiFetch(`/menu/items/${item.id}/modifier-groups`)) as ModifierGroupLink[];
      if (links.length > 0) {
        const selections: Record<string, string[]> = {};
        links.forEach((link) => {
          selections[link.group.id] = [];
        });
        setModifierModal({ item, links, selections });
        return;
      }
    } catch {
      // ignore
    }

    await addItemDirect(item, []);
  };

  const addItemDirect = async (item: MenuItem, modifiers: string[]) => {
    const currentOrderId = await createOrderIfNeeded();
    if (!currentOrderId) return;
    const basePrice = Number(item.price);
    const created = await apiFetch(`/orders/${currentOrderId}/items`, {
      method: "POST",
      body: JSON.stringify({
        menuItemId: item.id,
        quantity: 1,
        ...(Number.isFinite(basePrice) ? { price: basePrice } : {})
      })
    });
    lastAddedItemIdRef.current = created.id;
    setSelectedTicketItemId(created.id);

    for (const modifierId of modifiers) {
      await apiFetch(`/orders/${currentOrderId}/items/${created.id}/modifiers`, {
        method: "POST",
        body: JSON.stringify({ modifierId })
      });
    }

    await refreshOrder(currentOrderId);
  };

  const adjustQty = async (orderItemId: string, delta: number) => {
    const item = ticketItems.find((i) => i.orderItemId === orderItemId);
    if (!item || !orderId) return;
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      await apiFetch(`/orders/${orderId}/items/${orderItemId}`, { method: "DELETE" });
    } else {
      await apiFetch(`/orders/${orderId}/items/${orderItemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: newQty })
      });
    }
    await refreshOrder(orderId);
  };

  const adjustGroupedQty = async (
    entry: { menuItemId: string | null; lines: Array<{ orderItemId: string; qty: number }> },
    delta: number
  ) => {
    if (!orderId) return;
    if (delta > 0) {
      const menuItem = entry.menuItemId ? items.find((item) => item.id === entry.menuItemId) : null;
      if (menuItem) {
        await addItemDirect(menuItem, []);
      }
      return;
    }
    const line = entry.lines[0];
    if (!line) return;
    if (line.qty > 1) {
      await apiFetch(`/orders/${orderId}/items/${line.orderItemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: line.qty - 1 })
      });
    } else {
      await apiFetch(`/orders/${orderId}/items/${line.orderItemId}`, { method: "DELETE" });
    }
    await refreshOrder(orderId);
  };

  const scrollTicketList = (direction: "up" | "down") => {
    const list = ticketListRef.current;
    if (!list) return;
    const delta = direction === "up" ? -120 : 120;
    list.scrollBy({ top: delta, behavior: "smooth" });
  };

  const scrollTableCheckItems = (checkId: string, direction: "up" | "down") => {
    const list = tableCheckItemRefs.current[checkId];
    if (!list) return;
    const delta = direction === "up" ? -140 : 140;
    list.scrollBy({ top: delta, behavior: "smooth" });
  };

  const resetOrderState = () => {
    setTicketItems([]);
    setSentItemIds([]);
    setOrderId(null);
    setOrderNumbers({ ticketNumber: null, orderNumber: null });
    setOrderTotal(0);
    setOrderDetails({
      tableId: "",
      customerName: "",
      numberOfGuests: "",
      taxExempt: false,
      serviceCharge: "",
      deliveryCharge: ""
    });
  };

  const openSplit = () => {
    if (!orderId || ticketItems.length === 0) return;
    const initial: Record<string, boolean> = {};
    ticketItems.forEach((item) => {
      initial[item.orderItemId] = false;
    });
    setSplitSelection(initial);
    setSplitOpen(true);
  };

  const openDiscount = () => {
    if (!orderId || discounts.length === 0) return;
    setDiscountOpen(true);
  };

  const openPayment = (method: string) => {
    if (!enforceDineInTableSelection()) return;
    if (!orderId) return;
    setPaymentDraft({
      method,
      amount: total.toFixed(2),
      tenderAmount: method === "CASH" || method === "CARD" ? total.toFixed(2) : "",
      tipAmount: "",
      customLabel: ""
    });
    setPaymentPrintReceipt(true);
    setPaymentOpen(true);
  };

  const handleHold = async () => {
    if (!enforceDineInTableSelection()) return;
    if (!orderId) {
      setAlertMessage("Start an order first.");
      return;
    }
    if (ticketItems.length === 0) {
      setAlertMessage(HOLD_REQUIRES_ITEMS_MESSAGE);
      return;
    }
    try {
      await apiFetch(`/orders/${orderId}/hold`, { method: "POST" });
      resetOrderState();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to hold ticket.";
      setAlertMessage(message);
    }
  };

  const handleChain = async () => {
    if (!enforceDineInTableSelection()) return;
    if (!orderId) {
      setAlertMessage("Start an order first.");
      return;
    }
    if (ticketItems.length === 0) {
      setAlertMessage("Add at least one item before chaining.");
      return;
    }
    try {
      const result = await apiFetch(`/orders/${orderId}/chain`, { method: "POST" });
      const nextOrderId = result?.order?.id ? String(result.order.id) : null;
      if (!nextOrderId) {
        setAlertMessage("Unable to open the next chained check.");
        return;
      }
      await refreshOrder(nextOrderId);
      setSelectedTicketItemId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to chain order.";
      setAlertMessage(message);
    }
  };

  const handleVoid = async () => {
    if (!orderId) return;
    const reason = window.prompt("Void reason?");
    if (!reason) return;
    await apiFetch(`/orders/${orderId}/void`, {
      method: "POST",
      body: JSON.stringify({ reason })
    });
    resetOrderState();
  };

  const loadRecallOrders = async (searchValue?: string, searchByValue?: string) => {
    try {
      const queryParts: string[] = [];
      const baseStatuses =
        recallStatus !== "any"
          ? [recallStatus]
          : recallTab === "settled"
            ? ["PAID", "VOID"]
            : ["OPEN", "SENT", "HOLD"];
      if (baseStatuses.length > 0) {
        queryParts.push(`status=${baseStatuses.join(",")}`);
      }
      if (recallDateFrom) {
        queryParts.push(`dateFrom=${encodeURIComponent(recallDateFrom)}`);
      }
      if (recallDateTo) {
        queryParts.push(`dateTo=${encodeURIComponent(recallDateTo)}`);
      }
      if (recallServerFilter === "mine" && currentUser?.id) {
        queryParts.push(`serverId=${currentUser.id}`);
      } else if (recallServerFilter && recallServerFilter !== "all") {
        queryParts.push(`serverId=${recallServerFilter}`);
      }
      if (searchValue) {
        queryParts.push(`search=${encodeURIComponent(searchValue)}`);
        queryParts.push(`searchBy=${encodeURIComponent(searchByValue || recallSearchBy)}`);
      }
      const query = queryParts.length ? `?${queryParts.join("&")}` : "";
      const orders = await apiFetch(`/orders/open${query}`);
      setRecallOrders(orders);
    } catch (err) {
      console.error(err);
    }
  };

  const openRecall = async () => {
    setRecallOpen(true);
    if (recallServers.length === 0) {
      try {
        const users = await apiFetch("/users");
        setRecallServers(users);
      } catch {
        // ignore
      }
    }
    await loadRecallOrders(recallSearch.trim(), recallSearchBy);
  };

  useEffect(() => {
    if (!tableSelectOpen) return;
    refreshOpenTicketTableIds().catch(() => {
      // ignore
    });
    const timer = window.setInterval(() => {
      refreshOpenTicketTableIds().catch(() => {
        // ignore
      });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [tableSelectOpen]);

  useEffect(() => {
    if (!recallOpen) return;
    loadRecallOrders(recallSearch.trim(), recallSearchBy);
  }, [recallTab]);

  return (
    <div className="terminal-shell">
      <header className="terminal-top">
        <div>
          <h2>{orderType}</h2>
          <p>
            Terminal 1 • {stationName ? `Station ${stationName}` : "Station —"} • Server{" "}
            {currentUser?.displayName || currentUser?.username || "—"} • Table{" "}
            {assignedTable?.name ?? "—"} • Guests {orderDetails.numberOfGuests || "—"}
          </p>
          <p>
            {orderNumbers.ticketNumber ? `Ticket #${orderNumbers.ticketNumber}` : "Ticket #—"} •{" "}
            {orderNumbers.orderNumber ? `Order #${orderNumbers.orderNumber}` : "Order #—"}
          </p>
        </div>
        <div className="terminal-actions">
          <div className="terminal-user">
            <span>{currentUser?.displayName || currentUser?.username || "No user"}</span>
            {currentUser && (
              <button
                type="button"
                className="terminal-btn ghost"
                onClick={() => {
                  clearCurrentUser();
                  setCurrentUser(null);
                  setPinOpen(true);
                }}
              >
                Switch
              </button>
            )}
          </div>
          <input
            className="terminal-scan"
            placeholder="Scan barcode"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== "Enter") return;
              const match = items.find((item) => item.barcode === scanValue.trim());
              if (match) {
                await addItem(match);
              }
              setScanValue("");
            }}
          />
          <button type="button" className="terminal-btn ghost" onClick={() => setDetailsOpen(true)}>
            Order Details
          </button>
          {orderTypeValue === "DINE_IN" && (
            <button type="button" className="terminal-btn ghost" onClick={() => setTableSelectOpen(true)}>
              Table
            </button>
          )}
          <button type="button" className="terminal-btn ghost" onClick={() => setChargesOpen(true)}>
            Charges
          </button>
          <button type="button" className="terminal-btn ghost" onClick={openRecall}>
            Recall
          </button>
          <button
            type="button"
            className="terminal-btn"
            onClick={handleHold}
          >
            Hold
          </button>
        </div>
      </header>

      <div className="terminal-body">
        <aside className="terminal-categories">
          <h3>Categories</h3>
          <div className="terminal-category-list">
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={
                  cat.id === activeCategory
                    ? "terminal-cat active"
                    : "terminal-cat"
                }
                style={
                  cat.color
                    ? ({ ["--cat-color" as string]: cat.color } as Record<string, string>)
                    : undefined
                }
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="terminal-menu">
          <div className="terminal-group-list">
            <button
              type="button"
              className={!activeGroupId ? "terminal-group active" : "terminal-group"}
              onClick={() => setActiveGroupId("")}
            >
              All
            </button>
            {filteredGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={activeGroupId === group.id ? "terminal-group active" : "terminal-group"}
                onClick={() => setActiveGroupId(group.id)}
              >
                {group.name}
              </button>
            ))}
          </div>
          <div className="terminal-menu-grid">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="terminal-menu-item"
                style={
                  item.color || (item.categoryId && categoryColorMap.has(item.categoryId))
                    ? ({
                        ["--item-color" as string]:
                          item.color || (categoryColorMap.get(item.categoryId as string) as string)
                      } as Record<string, string>)
                    : undefined
                }
                onClick={() => addItem(item)}
              >
                <span>{item.name}</span>
                <span className="terminal-price">${Number(item.price).toFixed(2)}</span>
              </button>
            ))}
          </div>
          <div className="terminal-action-strip">
            <button type="button" className="terminal-btn strip cancel" onClick={() => goBackOrHome(navigate)}>
              Cancel
            </button>
            <button
              type="button"
              className={`terminal-btn strip${ticketItems.length ? "" : " disabled"}`}
              onClick={() => {
                if (!ticketItems.length) return;
                openModifierBoard();
              }}
              disabled={!ticketItems.length}
            >
              Modifiers
            </button>
            <button type="button" className="terminal-btn strip" onClick={handleVoid}>
              Void
            </button>
            <button type="button" className="terminal-btn strip" onClick={openRecall}>
              Re-Order
            </button>
            <button type="button" className="terminal-btn strip" onClick={handleHold}>
              Hold
            </button>
            <button type="button" className="terminal-btn strip" onClick={openSplit}>
              Split
            </button>
            <button
              type="button"
              className="terminal-btn strip"
              onClick={() => setAlertMessage("Combine is not available yet.")}
            >
              Combine
            </button>
            <button type="button" className="terminal-btn strip" onClick={() => setChargesOpen(true)}>
              Misc
            </button>
            <button
              type="button"
              className="terminal-btn strip"
              onClick={() => setAlertMessage("Weight entry is not available yet.")}
            >
              Weight
            </button>
            <button type="button" className="terminal-btn strip" onClick={() => setDetailsOpen(true)}>
              Details
            </button>
            <button
              type="button"
              className="terminal-btn strip"
              onClick={() => setAlertMessage("Quantity entry is not available yet.")}
            >
              Quantity
            </button>
            <button type="button" className="terminal-btn strip" onClick={openDiscount}>
              Discounts
            </button>
            <button type="button" className="terminal-btn strip" onClick={() => setChargesOpen(true)}>
              Surcharge
            </button>
            <button type="button" className="terminal-btn strip" onClick={() => openPayment("CARD")}>
              Credit
            </button>
            <button type="button" className="terminal-btn strip" onClick={() => setDetailsOpen(true)}>
              Cust Info
            </button>
          </div>
        </section>

        <aside className="terminal-ticket">
          <h3>Ticket</h3>
          <div className="terminal-ticket-list" ref={ticketListRef}>
            {displayTicketItems.length === 0 && (
              <div className="terminal-empty">No items yet</div>
            )}
            {displayTicketItems.map((item) => {
              const isSelected = item.lines.some((line) => line.orderItemId === selectedTicketItemId);
              return (
              <div
                key={item.key}
                className={`terminal-ticket-row${isSelected ? " selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  const target = item.lines[0]?.orderItemId;
                  if (target) setSelectedTicketItemId(target);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    const target = item.lines[0]?.orderItemId;
                    if (target) setSelectedTicketItemId(target);
                  }
                }}
              >
                <div>
                  <div className="terminal-ticket-name">{item.name}</div>
                  <div className="terminal-ticket-meta">
                    ${item.price.toFixed(2)} • Qty {item.qty}
                  </div>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="terminal-ticket-modifiers">
                      {item.modifiers.map((mod, idx) => (
                        <div key={`${mod.label}-${idx}`} className="terminal-ticket-mod">
                          - {mod.label}
                          {mod.qty > 1 ? ` x${mod.qty}` : ""}
                          {mod.price > 0 ? ` ($${mod.price.toFixed(2)})` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="terminal-ticket-controls">
                  <button
                    type="button"
                    onClick={() =>
                      (() => {
                        const targetId = item.lines[0]?.orderItemId || item.key;
                        if (targetId) setSelectedTicketItemId(targetId);
                        return groupTicketItems
                          ? adjustGroupedQty(item, -1)
                          : adjustQty(targetId, -1);
                      })()
                    }
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      (() => {
                        const targetId = item.lines[0]?.orderItemId || item.key;
                        if (targetId) setSelectedTicketItemId(targetId);
                        return groupTicketItems
                          ? adjustGroupedQty(item, 1)
                          : adjustQty(targetId, 1);
                      })()
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            );
            })}
          </div>

          <div className="terminal-ticket-summary-grid">
            <div className="terminal-summary-box">
              <div className="terminal-summary-row">
                <span>Sub Total</span>
                <span>${subtotalWithTax.toFixed(2)}</span>
              </div>
              <div className="terminal-summary-row">
                <span>Tax</span>
                <span>${taxAmount.toFixed(2)}</span>
              </div>
              <div className="terminal-summary-row total">
                <span>Amount Due</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
            <div className="terminal-summary-actions">
              <button
                type="button"
                className="terminal-btn compact discount"
                onClick={async () => {
                  openDiscount();
                }}
              >
                Discount Order
              </button>
              <div className="terminal-scroll-buttons">
                <button type="button" onClick={() => scrollTicketList("up")}>▲</button>
                <button type="button" onClick={() => scrollTicketList("down")}>▼</button>
              </div>
            </div>
          </div>

          <div className="terminal-ticket-actions">
            <button
              type="button"
              className="terminal-btn"
              onClick={async () => {
                if (!orderId) return;
                await apiFetch(`/orders/${orderId}/print-receipt`, {
                  method: "POST",
                  body: JSON.stringify({
                    serverName: currentUser?.displayName || currentUser?.username || undefined,
                    stationName: stationName || undefined,
                    ...stationContext
                  })
                });
              }}
            >
              Print Receipt
            </button>
          </div>
          <div className="terminal-ticket-actions compact">
            <button
              type="button"
              className="terminal-btn compact"
              onClick={openSplit}
            >
              Split
            </button>
            <button
              type="button"
              className="terminal-btn compact"
              onClick={handleHold}
            >
              Hold
            </button>
            <button
              type="button"
              className="terminal-btn compact"
              onClick={handleVoid}
            >
              Void
            </button>
            <button
              type="button"
              className="terminal-btn compact"
              onClick={() => {
                if (!orderId) return;
                setRefundOpen(true);
                setPaymentDraft({
                  method: "CASH",
                  amount: total.toFixed(2),
                  tenderAmount: "",
                  tipAmount: "",
                  customLabel: ""
                });
              }}
            >
              Refund
            </button>
            <button
              type="button"
              className="terminal-btn compact"
              onClick={async () => {
                const next = !orderDetails.taxExempt;
                setOrderDetails((prev) => ({ ...prev, taxExempt: next }));
                await updateOrderDetails({ taxExempt: next });
              }}
            >
              {orderDetails.taxExempt ? "Taxable" : "Tax Exempt"}
            </button>
          </div>
          <div className="terminal-ticket-final">
            {orderTypeValue === "DINE_IN" && services.appetizerQuickSendEnabled && (
              <button
                type="button"
                className="terminal-btn appetizer-send"
                disabled={!orderId || appetizerUnsentItemIds.length === 0}
                onClick={async () => {
                  if (!enforceDineInTableSelection()) return;
                  if (!orderId) {
                    setAlertMessage("Start an order first.");
                    return;
                  }
                  if (ticketItems.length === 0) {
                    setAlertMessage(HOLD_REQUIRES_ITEMS_MESSAGE);
                    return;
                  }
                  if (appetizerUnsentItemIds.length === 0) {
                    setAlertMessage("No unsent appetizer items found.");
                    return;
                  }
                  try {
                    await sendItemsToKitchen(orderId, appetizerUnsentItemIds);
                    await refreshOrder(orderId);
                    const count = appetizerUnsentItemIds.length;
                    setAlertMessage(
                      `${count} appetizer ${count === 1 ? "item was" : "items were"} sent to kitchen.`
                    );
                  } catch (err) {
                    const message = err instanceof Error ? err.message : "Unable to send appetizer items.";
                    setAlertMessage(message);
                  }
                }}
              >
                Appetizer Send
              </button>
            )}
            <button
              type="button"
              className="terminal-btn chain"
              onClick={handleChain}
            >
              Chain
            </button>
            <button
              type="button"
              className="terminal-btn done"
              onClick={async () => {
                if (!enforceDineInTableSelection()) return;
                if (!orderId) return;
                if (ticketItems.length === 0) {
                  setAlertMessage(HOLD_REQUIRES_ITEMS_MESSAGE);
                  return;
                }
                try {
                  if (unsentTicketItemIds.length > 0) {
                    await sendItemsToKitchen(orderId, unsentTicketItemIds);
                  }
                  await printOrderReceipt(orderId);
                  navigate("/");
                } catch (err) {
                  const message = err instanceof Error ? err.message : "Unable to finalize order.";
                  setAlertMessage(message);
                }
              }}
            >
              Done
            </button>
          </div>

        </aside>
      </div>

      {serviceBlocked && (
        <div className="terminal-recall">
          <div className="terminal-recall-card">
            <div className="terminal-recall-header">
              <h3>Service Disabled</h3>
              <button type="button" onClick={() => goBackOrHome(navigate)}>Close</button>
            </div>
            <p className="hint">{orderType} service is disabled in Store Settings.</p>
            <button type="button" className="terminal-btn primary" onClick={() => goBackOrHome(navigate)}>
              Return to Main Screen
            </button>
          </div>
        </div>
      )}

      {recallOpen && (
        <div className="terminal-recall">
          <div className="terminal-recall-card recall-modal recall-clean">
            <div className="terminal-recall-header">
              <div>
                <h3>Recall Tickets</h3>
                <p className="hint">Tap a ticket to reopen it.</p>
              </div>
              <button type="button" onClick={() => setRecallOpen(false)}>Close</button>
            </div>
            <div className="recall-toolbar">
              <div className="recall-metrics">
                <span className="recall-metric"><strong>{recallCounts.total}</strong> Total</span>
                <span className="recall-metric"><strong>{recallCounts.open}</strong> Open</span>
                <span className="recall-metric"><strong>{recallCounts.sent}</strong> Sent</span>
                <span className="recall-metric"><strong>{recallCounts.hold}</strong> Hold</span>
              </div>
              <div className="recall-legend">
                <span className="recall-pill open">Open</span>
                <span className="recall-pill sent">Sent</span>
                <span className="recall-pill hold">Hold</span>
              </div>
              <div className="recall-search">
                <select
                  value={recallSearchBy}
                  onChange={(event) => setRecallSearchBy(event.target.value === "order" ? "order" : "ticket")}
                >
                  <option value="ticket">Ticket #</option>
                  <option value="order">Order #</option>
                </select>
                <input
                  value={recallSearch}
                  placeholder="Search number"
                  onChange={(event) => setRecallSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      loadRecallOrders(recallSearch.trim(), recallSearchBy);
                    }
                  }}
                />
                <button type="button" className="terminal-btn" onClick={() => loadRecallOrders(recallSearch.trim(), recallSearchBy)}>
                  Search
                </button>
                <button
                  type="button"
                  className="terminal-btn ghost"
                  onClick={() => {
                    setRecallSearch("");
                    loadRecallOrders("", recallSearchBy);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="recall-filters">
              <div className="recall-tabset">
                <button
                  type="button"
                  className={recallTab === "open" ? "active" : ""}
                  onClick={() => setRecallTab("open")}
                >
                  Open
                </button>
                <button
                  type="button"
                  className={recallTab === "settled" ? "active" : ""}
                  onClick={() => setRecallTab("settled")}
                >
                  Settled
                </button>
              </div>
              <select value={recallStatus} onChange={(event) => setRecallStatus(event.target.value)}>
                <option value="any">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="SENT">Sent</option>
                <option value="HOLD">Hold</option>
                <option value="PAID">Paid</option>
                <option value="VOID">Void</option>
              </select>
              <div className="recall-date-range">
                <input
                  type="date"
                  value={recallDateFrom}
                  onChange={(event) => setRecallDateFrom(event.target.value)}
                />
                <span>to</span>
                <input
                  type="date"
                  value={recallDateTo}
                  onChange={(event) => setRecallDateTo(event.target.value)}
                />
              </div>
              <select
                value={recallServerFilter}
                onChange={(event) => setRecallServerFilter(event.target.value)}
              >
                <option value="mine">My Tickets</option>
                <option value="all">All Servers</option>
                {recallServers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.displayName || server.username}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="terminal-btn"
                onClick={() => loadRecallOrders(recallSearch.trim(), recallSearchBy)}
              >
                Apply Filters
              </button>
            </div>
            <div className="recall-table recall-clean-table">
              <div className="recall-table-header">
                <span>Ticket</span>
                <span>Table</span>
                <span>Status</span>
                <span>Total</span>
              </div>
              <div className="recall-table-body">
                {recallOrders.length === 0 && (
                  <div className="recall-empty">No open tickets right now.</div>
                )}
                {recallOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    className="recall-row"
                    onClick={async () => {
                      await refreshOrder(order.id);
                      setRecallOpen(false);
                    }}
                  >
                    <span>{order.ticketNumber ? `#${order.ticketNumber}` : order.id.slice(0, 8)}</span>
                    <span>{order.table?.name ?? "-"}</span>
                    <span className={`status ${order.status.toLowerCase()}`}>{order.status}</span>
                    <span>${Number(order.totalAmount ?? 0).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tableSelectOpen && (
        <div className="terminal-recall">
          <div className="terminal-recall-card table-select-card">
            <div className="terminal-recall-header">
              <h3>Select Table</h3>
              <button
                type="button"
                onClick={() => {
                  setTableSelectOpen(false);
                  goBackOrHome(navigate);
                }}
              >
                Close
              </button>
            </div>
            <div className="table-map-body">
              <div ref={mapRef} className="floor-plan table-map">
                {filteredTables.length === 0 && (
                  <div className="table-empty">
                    <h4>No tables yet</h4>
                    <p>Create table groups and tables in Table Setup.</p>
                    <button type="button" onClick={() => navigate("/settings/table-setup")}>
                      Open Table Setup
                    </button>
                  </div>
                )}
                {filteredTables.map((table) => {
                  const unplaced = unplacedIndex.get(table.id);
                  const col = unplaced !== undefined ? unplaced % 4 : 0;
                  const row = unplaced !== undefined ? Math.floor(unplaced / 4) : 0;
                  const baseLeft = table.posX ?? 20 + col * 120;
                  const baseTop = table.posY ?? 20 + row * 80;
                  let left = baseLeft;
                  let top = baseTop;
                  if (mapSize.width > 0) {
                    const maxLeft = Math.max(8, mapSize.width - 120);
                    left = Math.min(Math.max(8, left), maxLeft);
                  }
                  if (mapSize.height > 0) {
                    const maxTop = Math.max(8, mapSize.height - 80);
                    top = Math.min(Math.max(8, top), maxTop);
                  }
                  return (
                    <button
                      key={table.id}
                      type="button"
                      className={`floor-table ${table.status.toLowerCase()}${openTicketTableIds.has(table.id) ? " has-open-ticket" : ""}`}
                      style={{ left, top }}
                      onClick={() => selectTable(table.id)}
                    >
                      <strong>{table.name}</strong>
                      <span>{table.status}</span>
                    </button>
                  );
                })}
              </div>
              <div className="table-map-sidebar">
                <h4>Sections</h4>
                <div className="table-map-areas">
                  <button
                    type="button"
                    className={!activeAreaId ? "active" : ""}
                    onClick={() => setActiveAreaId(null)}
                  >
                    All
                  </button>
                  {tableAreas.map((area) => (
                    <button
                      key={area.id}
                      type="button"
                      className={activeAreaId === area.id ? "active" : ""}
                      onClick={() => setActiveAreaId(area.id)}
                    >
                      {area.name}
                    </button>
                  ))}
                </div>
                <p className="hint">Tap a table on the floor map to assign.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tableChecksOpen && (
        <div className="terminal-recall">
          <div className="terminal-recall-card table-checks-card">
            <div className="terminal-recall-header">
              <div>
                <h3>{tableChecksTableName}</h3>
                <p className="hint">Open checks for this table</p>
              </div>
              <button type="button" onClick={() => setTableChecksOpen(false)}>Close</button>
            </div>
            <div className="table-checks-layout">
              <div className="table-checks-columns">
                {tableChecks.map((check, index) => {
                  const isSelected = selectedTableCheckId === check.id;
                  const subtotalValue = Number(check.subtotalAmount ?? 0);
                  const taxValue = Number(check.taxAmount ?? 0);
                  const totalValue = Number(check.totalAmount ?? 0);
                  const dueValue =
                    check.dueAmount === null || typeof check.dueAmount === "undefined"
                      ? totalValue
                      : Number(check.dueAmount);
                  return (
                    <article
                      key={check.id}
                      className={`table-check-card${isSelected ? " active" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTableCheckId(check.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setSelectedTableCheckId(check.id);
                        }
                      }}
                    >
                      <div className="table-check-head">Chk #: {index + 1}/{tableChecks.length}</div>
                      <div className="table-check-meta">
                        <span>Server: {check.server?.displayName || check.server?.username || "—"}</span>
                        <span>Station: {stationName || "—"}</span>
                      </div>
                      <div className="table-check-meta">
                        <span>Order #: {check.orderNumber ?? "—"}</span>
                        <span>{formatOrderTypeLabel(check.orderType)}</span>
                      </div>
                      <div className="table-check-meta single">
                        <span>Table: {check.table?.name ?? tableChecksTableName}</span>
                      </div>
                      <div className="table-check-sep" />
                      <div
                        className="table-check-items"
                        ref={(node) => {
                          tableCheckItemRefs.current[check.id] = node;
                        }}
                      >
                        {(check.items || []).length === 0 && <div className="table-check-empty">No items yet</div>}
                        {(check.items || []).map((item) => {
                          const lineTotal = Number(item.price ?? 0) * Number(item.quantity ?? 0);
                          return (
                            <div key={item.id} className="table-check-line-wrap">
                              <div className="table-check-line">
                                <span>
                                  {item.quantity} x {(item.name || "Item").toUpperCase()}
                                </span>
                                <span>{lineTotal.toFixed(2)}</span>
                              </div>
                              {(item.modifiers || []).map((mod) => (
                                <div key={mod.id} className="table-check-mod">
                                  - {(mod.customName || mod.modifier?.name || "Modifier").toUpperCase()}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      <div className="table-check-sep" />
                      <div className="table-check-bottom">
                        <div className="table-check-totals">
                          <div className="table-check-total-row">
                            <span>Sub Total</span>
                            <strong>{subtotalValue.toFixed(2)}</strong>
                          </div>
                          <div className="table-check-total-row">
                            <span>Tax</span>
                            <strong>{taxValue.toFixed(2)}</strong>
                          </div>
                          <div className="table-check-total-row due">
                            <span>Amount Due</span>
                            <strong>${dueValue.toFixed(2)}</strong>
                          </div>
                        </div>
                        <div className="table-check-scroll">
                          <button type="button" onClick={() => scrollTableCheckItems(check.id, "up")}>▲</button>
                          <button type="button" onClick={() => scrollTableCheckItems(check.id, "down")}>▼</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {tableChecks.length === 0 && (
                  <div className="table-check-empty-panel">No open checks for this table.</div>
                )}
              </div>
              <aside className="table-check-actions-rail">
                <button type="button" className="table-check-action-btn" onClick={() => void handleTableChecksNew()} disabled={tableChecksLoading}>
                  New
                </button>
                <button type="button" className="table-check-action-btn" onClick={() => void handleTableChecksEdit()} disabled={!selectedTableCheckId || tableChecksLoading}>
                  Edit
                </button>
                <button type="button" className="table-check-action-btn" onClick={() => void handleTableChecksPrint()} disabled={!selectedTableCheckId || tableChecksLoading}>
                  Print
                </button>
                <button type="button" className="table-check-action-btn" onClick={() => void handleTableChecksPrintAll()} disabled={tableChecks.length === 0 || tableChecksLoading}>
                  Print All
                </button>
                <button type="button" className="table-check-action-btn done" onClick={() => setTableChecksOpen(false)} disabled={tableChecksLoading}>
                  Done
                </button>
              </aside>
            </div>
          </div>
        </div>
      )}

      {detailsOpen && (
        <div className="terminal-recall">
          <div className="terminal-recall-card">
            <div className="terminal-recall-header">
              <h3>Order Details</h3>
              <button type="button" onClick={() => setDetailsOpen(false)}>Close</button>
            </div>
            <div className="form-grid">
              <label>
                <span>Table</span>
                <select
                  value={orderDetails.tableId}
                  onChange={(e) => setOrderDetails((prev) => ({ ...prev, tableId: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name} ({table.status})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Customer</span>
                <input
                  value={orderDetails.customerName}
                  onChange={(e) => setOrderDetails((prev) => ({ ...prev, customerName: e.target.value }))}
                  placeholder="Customer name"
                />
              </label>
              <label>
                <span>Guests</span>
                <input
                  value={orderDetails.numberOfGuests}
                  onChange={(e) => setOrderDetails((prev) => ({ ...prev, numberOfGuests: e.target.value }))}
                  placeholder="0"
                />
              </label>
              <label className="toggle">
                <span>Tax Exempt</span>
                <button
                  type="button"
                  className={orderDetails.taxExempt ? "terminal-btn primary" : "terminal-btn ghost"}
                  onClick={() =>
                    setOrderDetails((prev) => ({ ...prev, taxExempt: !prev.taxExempt }))
                  }
                >
                  {orderDetails.taxExempt ? "Yes" : "No"}
                </button>
              </label>
            </div>
            <div className="terminal-ticket-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={async () => {
                  await updateOrderDetails(orderDetails);
                  setDetailsOpen(false);
                }}
              >
                Save Details
              </button>
              <button
                type="button"
                className="terminal-btn ghost"
                onClick={() => setDetailsOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {chargesOpen && (
        <div className="terminal-recall">
          <div className="terminal-recall-card">
            <div className="terminal-recall-header">
              <h3>Charges</h3>
              <button type="button" onClick={() => setChargesOpen(false)}>Close</button>
            </div>
            <div className="form-grid">
              <label>
                <span>Service Charge</span>
                <input
                  value={orderDetails.serviceCharge}
                  onChange={(e) => setOrderDetails((prev) => ({ ...prev, serviceCharge: e.target.value }))}
                  placeholder="0.00"
                />
              </label>
              <label>
                <span>Delivery Charge</span>
                <input
                  value={orderDetails.deliveryCharge}
                  onChange={(e) => setOrderDetails((prev) => ({ ...prev, deliveryCharge: e.target.value }))}
                  placeholder="0.00"
                />
              </label>
            </div>
            <div className="terminal-ticket-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={async () => {
                  await updateOrderDetails(orderDetails);
                  setChargesOpen(false);
                }}
              >
                Apply Charges
              </button>
              <button
                type="button"
                className="terminal-btn ghost"
                onClick={() => setChargesOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {discountOpen && (
        <div className="terminal-recall">
          <div className="terminal-recall-card">
            <div className="terminal-recall-header">
              <h3>Discounts</h3>
              <button type="button" onClick={() => setDiscountOpen(false)}>Close</button>
            </div>
            <div className="discount-list">
              {discounts.map((discount) => (
                <button
                  key={discount.id}
                  type="button"
                  className={selectedDiscountId === discount.id ? "active" : ""}
                  onClick={() => setSelectedDiscountId(discount.id)}
                >
                  <span>{discount.name}</span>
                  <span>{discount.type === "PERCENT" ? `${discount.value}%` : `$${Number(discount.value).toFixed(2)}`}</span>
                </button>
              ))}
            </div>
            <div className="terminal-ticket-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={async () => {
                  if (!orderId || !selectedDiscountId) return;
                  await apiFetch(`/orders/${orderId}/discounts`, {
                    method: "POST",
                    body: JSON.stringify({ discountId: selectedDiscountId })
                  });
                  await refreshOrder(orderId);
                  setDiscountOpen(false);
                }}
              >
                Apply Discount
              </button>
              <button type="button" className="terminal-btn ghost" onClick={() => setDiscountOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentOpen && (
        <div className="terminal-recall">
          <div className="terminal-recall-card payment-modal">
            <div className="terminal-recall-header">
              <h3>Payment</h3>
              <button type="button" onClick={() => setPaymentOpen(false)}>Close</button>
            </div>
            <div className="payment-grid">
              <div className="payment-main">
                <div className="form-grid">
                  <label>
                    <span>Method</span>
                    <select
                      value={paymentDraft.method}
                      onChange={(e) =>
                        setPaymentDraft((prev) => {
                          const nextMethod = e.target.value;
                          return {
                            ...prev,
                            method: nextMethod,
                            tenderAmount:
                              nextMethod === "CASH" || nextMethod === "CARD"
                                ? prev.amount || prev.tenderAmount
                                : ""
                          };
                        })
                      }
                    >
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card (PAX)</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </label>
                  {paymentDraft.method === "CUSTOM" && (
                    <label>
                      <span>Custom Label</span>
                      <input
                        value={paymentDraft.customLabel}
                        onChange={(e) =>
                          setPaymentDraft((prev) => ({ ...prev, customLabel: e.target.value }))
                        }
                        placeholder="House Account"
                      />
                    </label>
                  )}
                  <label>
                    <span>Amount</span>
                    <input
                      value={paymentDraft.amount}
                      onChange={(e) =>
                        setPaymentDraft((prev) => ({ ...prev, amount: e.target.value }))
                      }
                      placeholder="0.00"
                    />
                  </label>
                  <label>
                    <span>Tender</span>
                    <input
                      value={paymentDraft.tenderAmount}
                      onChange={(e) =>
                        setPaymentDraft((prev) => ({ ...prev, tenderAmount: e.target.value }))
                      }
                      placeholder="0.00"
                      disabled={paymentDraft.method !== "CASH"}
                    />
                  </label>
                  <label>
                    <span>Tip</span>
                    <input
                      value={paymentDraft.tipAmount}
                      onChange={(e) =>
                        setPaymentDraft((prev) => ({ ...prev, tipAmount: e.target.value }))
                      }
                      placeholder="0.00"
                    />
                  </label>
                </div>

                {paymentDraft.method === "CASH" && (
                  <div className="quick-tender">
                    <span className="hint">Quick Tender</span>
                    <div className="quick-tender-buttons">
                      {[paymentAmount || total, 5, 10, 20, 50, 100].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="terminal-btn ghost"
                          onClick={() =>
                            setPaymentDraft((prev) => ({
                              ...prev,
                              tenderAmount: Number(value).toFixed(2)
                            }))
                          }
                        >
                          {value === (paymentAmount || total) ? "Exact" : `$${Number(value).toFixed(0)}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="quick-tips">
                  <span className="hint">Quick Tips</span>
                  <div className="quick-tender-buttons">
                    {[0, 0.1, 0.15, 0.2].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        className="terminal-btn ghost"
                        onClick={() =>
                          setPaymentDraft((prev) => ({
                            ...prev,
                            tipAmount: (paymentAmount * pct).toFixed(2)
                          }))
                        }
                      >
                        {pct === 0 ? "No Tip" : `${Math.round(pct * 100)}%`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="payment-summary">
                <div className="payment-line">
                  <span>Amount Due</span>
                  <strong>${paymentAmount.toFixed(2)}</strong>
                </div>
                <div className="payment-line">
                  <span>Tip</span>
                  <strong>${paymentTip.toFixed(2)}</strong>
                </div>
                <div className="payment-line">
                  <span>Tender</span>
                  <strong>${paymentTender.toFixed(2)}</strong>
                </div>
                <div className="payment-line total">
                  <span>Change Due</span>
                  <strong>${paymentChange.toFixed(2)}</strong>
                </div>
                <label className="payment-checkbox">
                  <input
                    type="checkbox"
                    checked={paymentPrintReceipt}
                    onChange={(e) => setPaymentPrintReceipt(e.target.checked)}
                  />
                  Print receipt after payment
                </label>
                {paymentDraft.method === "CARD" && (
                  <p className="hint">Card payments will send a PAX charge request.</p>
                )}
              </div>
            </div>
            <div className="terminal-ticket-actions">
              <button
                type="button"
                className="terminal-btn primary"
                disabled={paymentSubmitting}
                onClick={async () => {
                  if (!orderId) return;
                  const amountValue = Number(paymentDraft.amount || total);
                  if (!amountValue) return;
                  if (paymentDraft.method === "CASH" && paymentTender < amountValue) {
                    setAlertMessage("Tender must be at least the amount due.");
                    return;
                  }
                  const method =
                    paymentDraft.method === "CUSTOM"
                      ? paymentDraft.customLabel || "CUSTOM"
                      : paymentDraft.method;
                  try {
                    setPaymentSubmitting(true);
                    await apiFetch(`/orders/${orderId}/payments`, {
                      method: "POST",
                      body: JSON.stringify({
                        method,
                        amount: amountValue,
                        tenderAmount: paymentDraft.tenderAmount
                          ? Number(paymentDraft.tenderAmount)
                          : undefined,
                        tipAmount: paymentDraft.tipAmount ? Number(paymentDraft.tipAmount) : undefined
                      })
                    });
                    if (paymentPrintReceipt) {
                      await apiFetch(`/orders/${orderId}/print-receipt`, {
                        method: "POST",
                        body: JSON.stringify({
                          serverName: currentUser?.displayName || currentUser?.username || undefined,
                          stationName: stationName || undefined,
                          ...stationContext
                        })
                      });
                    }
                    await refreshOrder(orderId);
                    setPaymentOpen(false);
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setPaymentSubmitting(false);
                  }
                }}
              >
                {paymentDraft.method === "CARD" ? "Charge Card" : "Submit Payment"}
              </button>
              <button
                type="button"
                className="terminal-btn ghost"
                onClick={() => setPaymentOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {refundOpen && (
        <div className="terminal-recall">
          <div className="terminal-recall-card">
            <div className="terminal-recall-header">
              <h3>Refund</h3>
              <button type="button" onClick={() => setRefundOpen(false)}>Close</button>
            </div>
            <div className="form-grid">
              <label>
                <span>Method</span>
                <select
                  value={paymentDraft.method}
                  onChange={(e) =>
                    setPaymentDraft((prev) => ({ ...prev, method: e.target.value }))
                  }
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </label>
              {paymentDraft.method === "CUSTOM" && (
                <label>
                  <span>Custom Label</span>
                  <input
                    value={paymentDraft.customLabel}
                    onChange={(e) =>
                      setPaymentDraft((prev) => ({ ...prev, customLabel: e.target.value }))
                    }
                    placeholder="House Account"
                  />
                </label>
              )}
              <label>
                <span>Amount</span>
                <input
                  value={paymentDraft.amount}
                  onChange={(e) =>
                    setPaymentDraft((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </label>
            </div>
            <div className="terminal-ticket-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={async () => {
                  if (!orderId) return;
                  const amountValue = Number(paymentDraft.amount || 0);
                  if (!amountValue) return;
                  const method =
                    paymentDraft.method === "CUSTOM"
                      ? paymentDraft.customLabel || "CUSTOM"
                      : paymentDraft.method;
                  try {
                    await apiFetch(`/orders/${orderId}/refund`, {
                      method: "POST",
                      body: JSON.stringify({
                        method,
                        amount: amountValue
                      })
                    });
                    await refreshOrder(orderId);
                    setRefundOpen(false);
                  } catch (err) {
                    console.error(err);
                  }
                }}
              >
                Process Refund
              </button>
              <button
                type="button"
                className="terminal-btn ghost"
                onClick={() => setRefundOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {splitOpen && (
        <div className="terminal-recall">
          <div className="terminal-recall-card">
            <div className="terminal-recall-header">
              <h3>Split Bill</h3>
              <button type="button" onClick={() => setSplitOpen(false)}>Close</button>
            </div>
            <div className="split-list">
              {ticketItems.map((item) => (
                <label key={item.orderItemId} className="split-row">
                  <input
                    type="checkbox"
                    checked={splitSelection[item.orderItemId] || false}
                    onChange={(e) =>
                      setSplitSelection((prev) => ({
                        ...prev,
                        [item.orderItemId]: e.target.checked
                      }))
                    }
                  />
                  <span>{item.name}</span>
                  <span>Qty {item.qty}</span>
                  <span>${(item.price * item.qty).toFixed(2)}</span>
                </label>
              ))}
            </div>
            <div className="terminal-ticket-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={async () => {
                  if (!orderId) return;
                  const itemIds = Object.entries(splitSelection)
                    .filter(([, value]) => value)
                    .map(([key]) => key);
                  if (itemIds.length === 0) return;
                  await apiFetch(`/orders/${orderId}/split`, {
                    method: "POST",
                    body: JSON.stringify({ itemIds })
                  });
                  await refreshOrder(orderId);
                  setSplitOpen(false);
                }}
              >
                Split Selected
              </button>
              <button
                type="button"
                className="terminal-btn ghost"
                onClick={() => setSplitOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {modifierModal && (
        <div className="terminal-recall">
          <div className="terminal-recall-card">
            <div className="terminal-recall-header">
              <h3>{modifierModal.item.name}</h3>
              <button type="button" onClick={() => setModifierModal(null)}>Close</button>
            </div>
            <div className="modifier-groups">
              {modifierModal.links.map((link) => (
                <div key={link.id} className="modifier-group">
                  <h4>
                    {link.group.name}
                    {typeof link.minRequired === "number" && ` • min ${link.minRequired}`}
                    {typeof link.maxAllowed === "number" && ` • max ${link.maxAllowed}`}
                  </h4>
                  <div className="modifier-options">
                    {link.group.modifiers.map((mod) => {
                      const selectedList = modifierModal.selections[link.group.id] || [];
                      const selected = selectedList.includes(mod.id);
                      const maxAllowed = link.maxAllowed ?? link.group.modifiers.length;
                      const disableAdd = !selected && selectedList.length >= maxAllowed;
                      return (
                        <label key={mod.id}>
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disableAdd}
                            onChange={(e) => {
                              const next = { ...modifierModal.selections };
                              const list = new Set(next[link.group.id] || []);
                              if (e.target.checked) {
                                list.add(mod.id);
                              } else {
                                list.delete(mod.id);
                              }
                              next[link.group.id] = Array.from(list);
                              setModifierModal({ ...modifierModal, selections: next });
                            }}
                          />
                          {mod.name} (${Number(mod.price).toFixed(2)})
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="terminal-ticket-actions">
              <button
                type="button"
                className="terminal-btn primary"
                onClick={async () => {
                  const selections = modifierModal.selections;
                  const selectedIds = Object.values(selections).flat();
                  const invalid = modifierModal.links.some((link) => {
                    const count = selections[link.group.id]?.length ?? 0;
                    return typeof link.minRequired === "number" && count < link.minRequired;
                  });
                  if (invalid) {
                    setAlertMessage("Please meet required modifier selections.");
                    return;
                  }
                  await addItemDirect(modifierModal.item, selectedIds);
                  setModifierModal(null);
                }}
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {modifierBoardOpen && (
        <div className="terminal-recall">
          <div className="terminal-modifier-board">
            <div className="terminal-recall-header">
              <div>
                <h3>Modifiers</h3>
                {selectedTicketItemName && <p className="hint">Item: {selectedTicketItemName}</p>}
              </div>
              <button type="button" onClick={() => setModifierBoardOpen(false)}>Close</button>
            </div>
            <div className="modifier-board-body">
              <div className="modifier-board-alpha">
                {[
                  ["@", "#"],
                  ["A", "N"],
                  ["B", "O"],
                  ["C", "P"],
                  ["D", "Q"],
                  ["E", "R"],
                  ["F", "S"],
                  ["G", "T"],
                  ["H", "U"],
                  ["I", "V"],
                  ["J", "W"],
                  ["K", "X"],
                  ["L", "Y"],
                  ["M", "Z"]
                ].map((pair) => (
                  <div key={pair.join("")} className="modifier-alpha-row">
                    {pair.map((letter) => (
                      <button
                        key={letter}
                        type="button"
                        className={modifierAlpha === letter ? "active" : ""}
                        onClick={() => setModifierAlpha(letter)}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                ))}
                <button type="button" className="modifier-alpha-all" onClick={() => setModifierAlpha("")}>
                  All
                </button>
              </div>

              <div className="modifier-board-main">
                <div className="modifier-board-targets">
                  <span>Apply To:</span>
                  <div className="modifier-board-target-list">
                    {ticketItems.map((item) => (
                      <button
                        key={item.orderItemId}
                        type="button"
                        className={selectedTicketItemId === item.orderItemId ? "active" : ""}
                        onClick={() => setSelectedTicketItemId(item.orderItemId)}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="modifier-board-groups">
                  <button
                    type="button"
                    className={!activeModifierGroupId ? "active" : ""}
                    onClick={() => setActiveModifierGroupId(null)}
                  >
                    All
                  </button>
                  {visibleModifierGroups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      className={activeModifierGroupId === group.id ? "active" : ""}
                      onClick={() => setActiveModifierGroupId(group.id)}
                    >
                      {group.name}
                    </button>
                  ))}
                </div>
                <div className="modifier-board-grid">
                  {visibleModifiers.map((mod) => (
                    <button
                      key={mod.id}
                      type="button"
                      className="modifier-board-item"
                      onClick={() => addModifierToQueue(mod)}
                    >
                      <span>{mod.name}</span>
                      <span className="price">${Number(mod.price).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="modifier-board-side">
                <div className="modifier-board-list" ref={modifierListRef}>
                  {modifierQueue.length === 0 && <div className="terminal-empty">No modifiers yet</div>}
                  {modifierQueue.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="modifier-board-row"
                      onClick={() =>
                        setModifierQueue((prev) => prev.filter((item) => item.id !== entry.id))
                      }
                    >
                      <span>{entry.name}</span>
                      <span>x{entry.qty}</span>
                      <span>${(entry.price * entry.qty).toFixed(2)}</span>
                    </button>
                  ))}
                </div>

                <div className="modifier-board-side-actions">
                  <div className="modifier-board-manual">
                    <input
                      value={manualModifierText}
                      onChange={(e) => setManualModifierText(e.target.value)}
                      onBlur={async () => {
                        const language = detectLanguageForText(manualModifierText);
                        const local = autoCorrectTextLocal(manualModifierText, language).text;
                        setManualModifierText(local);
                        const correction = await autoCorrectText(local, language);
                        setManualModifierText(correction.text || local);
                      }}
                      placeholder="Manual modifier"
                      spellCheck
                      autoCorrect="on"
                      autoCapitalize="off"
                      lang={detectLanguageForText(manualModifierText) === "es" ? "es" : "en"}
                    />
                    <button type="button" onClick={() => void addManualModifier(manualModifierText)}>
                      Add
                    </button>
                  </div>
                  <div className="modifier-board-scroll">
                    <button type="button" onClick={() => scrollModifierList("up")}>▲</button>
                    <button type="button">Split Qty</button>
                    <button type="button" onClick={() => scrollModifierList("down")}>▼</button>
                  </div>
                  <div className="modifier-board-tag-buttons">
                    <button type="button" className="tag">No...</button>
                    <button type="button" className="tag">All...</button>
                    <button type="button" className="tag">Light...</button>
                    <button type="button" className="tag">Extra...</button>
                    <button type="button" className="tag accent" onClick={() => applyModifierQueue(false)}>
                      Add...
                    </button>
                    <button type="button" className="tag">Exchange...</button>
                  </div>
                  <div className="modifier-board-multi">
                    <button type="button">2x</button>
                    <button type="button">3x</button>
                    <button type="button" onClick={openNotePad}>Note</button>
                    <button type="button">Change Modifier Price</button>
                    <button type="button">Manual Entry</button>
                    <button type="button" className="finish" onClick={() => applyModifierQueue(true)}>
                      Finish
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <PinGate
        open={pinOpen}
        title="Enter Access Code"
        onSuccess={(user) => {
          setCurrentUser(user);
          setPinOpen(false);
        }}
        onCancel={() => goBackOrHome(navigate)}
      />

      {alertMessage && (
        <div className="terminal-recall">
          <div className="terminal-alert-card">
            <h3>Notice</h3>
            <p>{alertMessage}</p>
            <button type="button" className="terminal-btn primary" onClick={() => setAlertMessage(null)}>
              OK
            </button>
          </div>
        </div>
      )}

      {notePadOpen && (
        <div className="terminal-recall">
          <div className="terminal-keyboard-card">
            <div className="terminal-recall-header">
              <h3>Modifier Note</h3>
              <button type="button" onClick={() => setNotePadOpen(false)}>Close</button>
            </div>
            <input
              ref={notePadInputRef}
              className="terminal-keyboard-input"
              value={notePadText}
              onChange={(e) => setNotePadText(e.target.value)}
              onBlur={async () => {
                const language = detectLanguageForText(notePadText);
                const local = autoCorrectTextLocal(notePadText, language).text;
                setNotePadText(local);
                const correction = await autoCorrectText(local, language);
                setNotePadText(correction.text || local);
              }}
              placeholder="Type note..."
              spellCheck
              autoCorrect="on"
              autoCapitalize="off"
              lang={detectLanguageForText(notePadText) === "es" ? "es" : "en"}
            />
            {notePadSuggestion && (
              <div className="terminal-note-suggestion" style={{ margin: "8px 0 12px", display: "flex", gap: 8, alignItems: "center" }}>
                <span>Suggestion: <strong>{notePadSuggestion}</strong></span>
                <button type="button" onClick={() => setNotePadText(notePadSuggestion)}>
                  Apply
                </button>
              </div>
            )}
            <div className="terminal-keyboard-grid">
              {["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row) => (
                <div key={row} className="terminal-keyboard-row">
                  {row.split("").map((char) => (
                    <button
                      key={char}
                      type="button"
                      onClick={() => setNotePadText((prev) => prev + char)}
                    >
                      {char}
                    </button>
                  ))}
                </div>
              ))}
              <div className="terminal-keyboard-row">
                <button type="button" onClick={() => setNotePadText((prev) => prev + " ")}>
                  Space
                </button>
                <button type="button" onClick={() => setNotePadText((prev) => prev.slice(0, -1))}>
                  Back
                </button>
                <button type="button" onClick={() => setNotePadText("")}>
                  Clear
                </button>
              </div>
            </div>
            <div className="terminal-ticket-actions">
              <button type="button" className="terminal-btn primary" onClick={() => void addNoteFromPad()}>
                Add Note
              </button>
              <button type="button" className="terminal-btn ghost" onClick={() => setNotePadOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
