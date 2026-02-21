import { prisma } from "./prisma.js";

export type PaymentGatewayPreference = "AUTO" | "OFFLINE" | "PAX" | "TSYS_PORTICO";
export type CardGatewayMode = "OFFLINE" | "PAX" | "TSYS_PORTICO";

export type CardChargeInput = {
  orderId: string;
  amount: number;
  tipAmount?: number;
  currency?: string;
  gateway?: PaymentGatewayPreference;
  clientTransactionId?: string;
  card?: {
    number: string;
    expMonth: string;
    expYear: string;
    cvv?: string;
    cardHolderName?: string;
  };
};

export type CardChargeResult = {
  gateway: CardGatewayMode;
  responseCode?: string;
  responseMessage?: string;
  transactionId?: string;
  authorizationCode?: string;
  cardType?: string;
  maskedCardNumber?: string;
};

type AppSettingObject = Record<string, unknown>;

type TsysPorticoConfig = {
  enabled: boolean;
  environment: "test" | "production";
  currency: string;
  secretApiKey: string;
  serviceUrl: string;
  siteId: string;
  licenseId: string;
  deviceId: string;
  username: string;
  password: string;
  developerId: string;
  versionNumber: string;
};

type GatewaySettings = {
  defaultGateway: PaymentGatewayPreference;
  paxEnabled: boolean;
  defaultCurrency: string;
  tsys: TsysPorticoConfig;
};

function asObject(value: unknown): AppSettingObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as AppSettingObject;
  }
  return {};
}

function asText(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeGateway(value: unknown): PaymentGatewayPreference {
  const raw = asText(value).toUpperCase();
  if (raw === "OFFLINE") return "OFFLINE";
  if (raw === "PAX") return "PAX";
  if (raw === "TSYS_PORTICO") return "TSYS_PORTICO";
  return "AUTO";
}

function normalizeCurrency(value: string) {
  const upper = value.trim().toUpperCase();
  return upper.length === 3 ? upper : "USD";
}

function maskCardNumber(pan: string) {
  const digits = pan.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function normalizeCardInput(input: NonNullable<CardChargeInput["card"]>) {
  const number = input.number.replace(/\D/g, "");
  if (number.length < 12 || number.length > 19) {
    throw new Error("Card number must be 12-19 digits.");
  }

  const month = input.expMonth.replace(/\D/g, "").padStart(2, "0");
  const monthValue = Number(month);
  if (!Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12) {
    throw new Error("Expiration month is invalid.");
  }

  const rawYear = input.expYear.replace(/\D/g, "");
  if (rawYear.length !== 2 && rawYear.length !== 4) {
    throw new Error("Expiration year must be 2 or 4 digits.");
  }
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

  const cvv = input.cvv ? input.cvv.replace(/\D/g, "") : "";
  if (cvv && (cvv.length < 3 || cvv.length > 4)) {
    throw new Error("CVV must be 3 or 4 digits.");
  }

  return {
    number,
    expMonth: month,
    expYear: year,
    cvv,
    cardHolderName: asText(input.cardHolderName)
  };
}

function approvedFromResponse(code?: string, message?: string) {
  const normalizedCode = (code || "").trim().toUpperCase();
  if (normalizedCode === "00" || normalizedCode === "0" || normalizedCode === "SUCCESS") {
    return true;
  }
  if (normalizedCode && normalizedCode !== "APPROVED") {
    return false;
  }
  const normalizedMessage = (message || "").trim().toUpperCase();
  if (!normalizedCode && !normalizedMessage) return true;
  return normalizedMessage.includes("APPROV");
}

async function loadGatewaySettings(): Promise<GatewaySettings> {
  const [gatewaySetting, paxSetting, tsysSetting, storeSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "payment_gateway" } }),
    prisma.appSetting.findUnique({ where: { key: "pax" } }),
    prisma.appSetting.findUnique({ where: { key: "tsys_portico" } }),
    prisma.appSetting.findUnique({ where: { key: "store" } })
  ]);

  const gatewayRaw = asObject(gatewaySetting?.value);
  const paxRaw = asObject(paxSetting?.value);
  const tsysRaw = asObject(tsysSetting?.value);
  const storeRaw = asObject(storeSetting?.value);

  const tsys: TsysPorticoConfig = {
    enabled: asBool(tsysRaw.enabled, false),
    environment: asText(tsysRaw.environment, "test").toLowerCase() === "production" ? "production" : "test",
    currency: normalizeCurrency(asText(tsysRaw.currency, asText(storeRaw.currency, "USD"))),
    secretApiKey: asText(tsysRaw.secretApiKey),
    serviceUrl: asText(tsysRaw.serviceUrl),
    siteId: asText(tsysRaw.siteId),
    licenseId: asText(tsysRaw.licenseId),
    deviceId: asText(tsysRaw.deviceId),
    username: asText(tsysRaw.username),
    password: asText(tsysRaw.password),
    developerId: asText(tsysRaw.developerId),
    versionNumber: asText(tsysRaw.versionNumber)
  };

  return {
    defaultGateway: normalizeGateway(gatewayRaw.defaultGateway),
    paxEnabled: asBool(paxRaw.enabled, true),
    defaultCurrency: normalizeCurrency(asText(gatewayRaw.currency, asText(storeRaw.currency, "USD"))),
    tsys
  };
}

function resolveGatewayMode(
  requested: PaymentGatewayPreference | undefined,
  settings: GatewaySettings
): CardGatewayMode {
  const requestedMode = normalizeGateway(requested);
  if (requestedMode !== "AUTO") {
    if (requestedMode === "TSYS_PORTICO" && !settings.tsys.enabled) {
      throw new Error("TSYS gateway is disabled in Payments Settings.");
    }
    if (requestedMode === "PAX" && !settings.paxEnabled) {
      throw new Error("PAX gateway is disabled in Payments Settings.");
    }
    return requestedMode;
  }

  if (settings.defaultGateway === "TSYS_PORTICO" && settings.tsys.enabled) return "TSYS_PORTICO";
  if (settings.defaultGateway === "PAX" && settings.paxEnabled) return "PAX";
  if (settings.defaultGateway === "OFFLINE") return "OFFLINE";

  if (settings.tsys.enabled) return "TSYS_PORTICO";
  if (settings.paxEnabled) return "PAX";
  return "OFFLINE";
}

async function readBridgePayload(response: Response): Promise<AppSettingObject> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return asObject(JSON.parse(text));
  } catch {
    return { raw: text };
  }
}

async function chargeWithPax(input: CardChargeInput): Promise<CardChargeResult> {
  const deviceBridgeUrl = process.env.DEVICE_BRIDGE_URL || "http://localhost:7090";
  const response = await fetch(`${deviceBridgeUrl}/pax/charge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amount,
      tipAmount: input.tipAmount,
      orderId: input.orderId
    })
  });

  if (!response.ok) {
    throw new Error(`PAX bridge rejected charge (${response.status}).`);
  }

  const payload = await readBridgePayload(response);
  const responseCode = asText(payload.responseCode || payload.code);
  const responseMessage = asText(payload.responseMessage || payload.message);
  const transactionId = asText(payload.transactionId || payload.txnId || payload.reference);
  const authorizationCode = asText(payload.authorizationCode || payload.authCode);
  const cardType = asText(payload.cardType || payload.brand);
  const maskedCardNumber = asText(payload.maskedCardNumber || payload.maskedPan || payload.last4);
  const explicitApproved = payload.approved ?? payload.success;
  const approved =
    typeof explicitApproved === "boolean" ? explicitApproved : approvedFromResponse(responseCode, responseMessage);

  if (!approved) {
    throw new Error(responseMessage || "Card was declined by PAX.");
  }

  return {
    gateway: "PAX",
    responseCode,
    responseMessage,
    transactionId,
    authorizationCode,
    cardType,
    maskedCardNumber: maskedCardNumber || undefined
  };
}

function ensureTsysCredentials(tsys: TsysPorticoConfig) {
  if (tsys.secretApiKey) return;
  const hasLegacySet =
    tsys.siteId && tsys.licenseId && tsys.deviceId && tsys.username && tsys.password;
  if (!hasLegacySet) {
    throw new Error("TSYS credentials are missing. Configure secret API key or legacy credentials.");
  }
}

async function chargeWithTsysPortico(
  input: CardChargeInput,
  settings: GatewaySettings
): Promise<CardChargeResult> {
  if (!input.card) {
    throw new Error("Card details are required for TSYS processing.");
  }
  const normalizedCard = normalizeCardInput(input.card);
  ensureTsysCredentials(settings.tsys);

  let sdkModule: Record<string, unknown>;
  try {
    const loaded = (await import("globalpayments-api")) as Record<string, unknown> & {
      default?: Record<string, unknown>;
    };
    sdkModule = (loaded.default && typeof loaded.default === "object" ? loaded.default : loaded) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error("TSYS SDK is not installed. Run npm install in webapp/backend.");
  }

  const PorticoConfig = sdkModule.PorticoConfig as (new () => Record<string, unknown>) | undefined;
  const CreditService = sdkModule.CreditService as (new (config: unknown, configName?: string) => unknown) | undefined;
  const CreditCardData = sdkModule.CreditCardData as (new () => Record<string, unknown>) | undefined;
  const Environment = (sdkModule.Environment || {}) as Record<string, unknown>;

  if (!PorticoConfig || !CreditService || !CreditCardData) {
    throw new Error("TSYS SDK did not expose required payment classes.");
  }

  const config = new PorticoConfig();
  config.environment =
    settings.tsys.environment === "production" ? Environment.Production ?? config.environment : Environment.Test ?? config.environment;
  if (settings.tsys.serviceUrl) config.serviceUrl = settings.tsys.serviceUrl;
  if (settings.tsys.secretApiKey) {
    config.secretApiKey = settings.tsys.secretApiKey;
  } else {
    config.siteId = settings.tsys.siteId;
    config.licenseId = settings.tsys.licenseId;
    config.deviceId = settings.tsys.deviceId;
    config.username = settings.tsys.username;
    config.password = settings.tsys.password;
  }
  if (settings.tsys.developerId) config.developerId = settings.tsys.developerId;
  if (settings.tsys.versionNumber) config.versionNumber = settings.tsys.versionNumber;

  const service = new CreditService(config);
  const card = new CreditCardData();
  card.number = normalizedCard.number;
  card.expMonth = normalizedCard.expMonth;
  card.expYear = normalizedCard.expYear;
  if (normalizedCard.cvv) card.cvn = normalizedCard.cvv;
  if (normalizedCard.cardHolderName) card.cardHolderName = normalizedCard.cardHolderName;

  const charge = service as {
    charge: (amount: number) => {
      withCurrency: (currency: string) => {
        withPaymentMethod: (paymentMethod: unknown) => {
          withAllowDuplicates?: (allow: boolean) => unknown;
          withClientTransactionId?: (id: string) => unknown;
          withGratuity?: (amount: number) => unknown;
          execute: () => Promise<Record<string, unknown>>;
        };
      };
    };
  };

  const currency = normalizeCurrency(input.currency || settings.tsys.currency || settings.defaultCurrency);
  let builder = charge.charge(input.amount).withCurrency(currency).withPaymentMethod(card) as Record<string, unknown>;
  if (typeof (builder as { withAllowDuplicates?: (allow: boolean) => unknown }).withAllowDuplicates === "function") {
    builder = (builder as { withAllowDuplicates: (allow: boolean) => unknown }).withAllowDuplicates(true) as Record<
      string,
      unknown
    >;
  }
  if (input.clientTransactionId && typeof (builder as { withClientTransactionId?: (id: string) => unknown }).withClientTransactionId === "function") {
    builder = (builder as { withClientTransactionId: (id: string) => unknown }).withClientTransactionId(
      input.clientTransactionId
    ) as Record<string, unknown>;
  }
  if (input.tipAmount && input.tipAmount > 0 && typeof (builder as { withGratuity?: (amount: number) => unknown }).withGratuity === "function") {
    builder = (builder as { withGratuity: (amount: number) => unknown }).withGratuity(input.tipAmount) as Record<
      string,
      unknown
    >;
  }

  const execute = (builder as { execute?: () => Promise<Record<string, unknown>> }).execute;
  if (typeof execute !== "function") {
    throw new Error("TSYS SDK builder does not expose execute().");
  }

  const response = await execute();
  const responseCode = asText(response.responseCode);
  const responseMessage = asText(response.responseMessage);
  const transactionId = asText(response.transactionId);
  const authorizationCode = asText(response.authorizationCode);
  const cardType = asText(response.cardType);
  const maskedCardNumber = asText(response.cardLast4)
    ? `****${asText(response.cardLast4)}`
    : maskCardNumber(normalizedCard.number);

  if (!approvedFromResponse(responseCode, responseMessage)) {
    throw new Error(responseMessage || `TSYS declined transaction (${responseCode || "no code"}).`);
  }

  return {
    gateway: "TSYS_PORTICO",
    responseCode,
    responseMessage,
    transactionId,
    authorizationCode,
    cardType,
    maskedCardNumber
  };
}

export async function chargeCard(input: CardChargeInput): Promise<CardChargeResult> {
  const settings = await loadGatewaySettings();
  const mode = resolveGatewayMode(input.gateway, settings);

  if (mode === "OFFLINE") {
    return {
      gateway: "OFFLINE",
      responseCode: "OFFLINE",
      responseMessage: "Recorded as offline card payment."
    };
  }
  if (mode === "PAX") {
    return chargeWithPax(input);
  }
  return chargeWithTsysPortico(input, settings);
}

