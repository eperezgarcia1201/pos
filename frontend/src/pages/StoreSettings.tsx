import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getCurrentUser } from "../lib/session";

type PrimaryTab =
  | "general"
  | "taxes"
  | "services"
  | "revenue"
  | "receipts"
  | "print"
  | "staffCrm"
  | "products"
  | "orderEntry"
  | "other";

type TaxTab = "tax1" | "tax2" | "tax3" | "options";
type ServiceTab = "dineIn" | "takeOut" | "driveThru" | "delivery";
type RevenueTab = "payments" | "gratuity" | "cashier" | "options";
type ReceiptsTab = "guestCheck" | "kitchenBar" | "options";
type PrintTab = "guestCheck" | "kitchenBar" | "multilingual" | "packager" | "customer" | "options";
type ProductsTab = "modifiers" | "pizza" | "inventory" | "options";

type GeneralSettings = {
  name: string;
  address: string;
  postalCode: string;
  cityStateZip: string;
  phone: string;
  defaultAreaCode: string;
  siteNumber: string;
  mailingAddress: string;
  mailingPostalCode: string;
  mailingCityStateZip: string;
  stationName: string;
  serverComputerName: string;
  serverTcpIpAddress: string;
  serverTcpIpPort: string;
  autoRestartAllComputers: boolean;
  autoShutdownAllComputers: boolean;
  autoTriggerTime: string;
  displaySpecialMessageDuringLogin: boolean;
  specialMessage: string;
  dailyStartTime: string;
  lunchStartTime: string;
  dinnerStartTime: string;
  telephoneDisplayFormat: string;
  telephoneDigits: string;
  taxRate: string;
  currency: string;
};

type TaxesSettings = {
  aliasName: string;
  tax1Rate: string;
  tax2Rate: string;
  tax3Rate: string;
  applyTaxOnSurcharge: boolean;
  applyTaxOnDeliveryCharge: boolean;
  includeTaxInPrice: boolean;
};

type ServicesSettings = {
  dineInEnabled: boolean;
  takeOutEnabled: boolean;
  driveThruEnabled: boolean;
  deliveryEnabled: boolean;
  dineInAlias: string;
  takeOutAlias: string;
  driveThruAlias: string;
  deliveryAlias: string;
  showRetailScreen: boolean;
  taxExempt: boolean;
  skipTableSelection: boolean;
  trackGuestCountForDineInOrders: boolean;
  promptCustomerNameAtDineInCompletion: boolean;
  promptCustomerNameAtBarTabCompletion: boolean;
  appetizerQuickSendEnabled: boolean;
  appetizerCategoryKeywords: string;
};

type RevenueSettings = {
  check: boolean;
  visa: boolean;
  mastercard: boolean;
  americanExpress: boolean;
  discover: boolean;
  debitCard: boolean;
  inHouseCharge: boolean;
  daysDue: string;
  remoteInHouseAccountMarker: string;
  showTipSuggestionOnCheckBasedOnOrderTotal: boolean;
  tipSuggestionPercentages: string;
  autoGratuityPercent: string;
  requireCashierSignIn: boolean;
  enforceNoSaleReason: boolean;
};

type ReceiptsSettings = {
  storeMessage: string;
  guestCheckMessage: string;
  hideTicketNumberFromGuestCheck: boolean;
  hideTimeFromGuestCheck: boolean;
  showDeliveryCustSalesInfo: boolean;
  hideHoldTimeOnPrintedCheck: boolean;
  hideSeatNumberFromPrintedCheck: boolean;
  showOrderedItemsIndividually: boolean;
  hideVoidedItemFromPrintedGuestCheck: boolean;
  hideModifierCostFromPrintedCheck: boolean;
  hideNoCostModifierFromPrintedCheck: boolean;
  guestCheckPrintDescription: boolean;
  printTipLineOnGuestCheck: boolean;
  alwaysShowGuestCheckTipLine: boolean;
  showFoodBarSubtotalsOnGuestCheck: boolean;
};

type PrintSettings = {
  printGuestCheckOnSend: boolean;
  printTwoCopiesOfGuestChecks: boolean;
  rePrintCheckNeedManagerOverride: boolean;
  smartSeatHandling: boolean;
  showTotalPerSeat: boolean;
  doNotPrintGuestCheckForDineInOrders: boolean;
  doNotPrintGuestCheckForTakeOutPhonedInOrders: boolean;
  doNotPrintGuestCheckForTakeOutWalkInOrders: boolean;
  doNotPrintGuestCheckForDriveThruOrders: boolean;
  doNotPrintGuestCheckForDeliveryOrders: boolean;
  customerReceiptPrinterId: string;
  kitchenPrinterId: string;
  barPrinterId: string;
};

type StaffCrmSettings = {
  payPeriod: string;
  workWeekEndDay: string;
  clockOutReminderAfterMinutes: string;
  overTimeBasis: string;
  overTimeAfterHours: string;
  overTimeHourPercent: string;
  forceHourlyEmployeeClockInBeforeUseSystem: boolean;
  employeeWithMultiJobSelection: boolean;
  takeOutDeliveryShowSearchType: boolean;
  enforceExactTelephoneNumberDigits: boolean;
  gcsSiteNumber: string;
  gcsServerIp: string;
  gcsServerPort: string;
};

type ProductsSettings = {
  menuModifierFontSize: string;
  sortMenuSubItemsForcedModifiers: boolean;
  persistManualModifierPriceChange: boolean;
  hideNoteFromTouchModifierScreen: boolean;
  hideHalf: boolean;
  hideToppings: boolean;
  hideBarMixing: boolean;
  hideAll: boolean;
  disableFinishButtonInForcedModifiers: boolean;
  autoSelectSingleForcedModifier: boolean;
  modifierBuilderTypes: string[];
  inventoryAutoDecrement: boolean;
};

type OrderEntrySettings = {
  showUnsentItemsInGreen: boolean;
  orderEntryAmountDueInYellow: boolean;
  onlySecureChangePriceFeatureOnAlreadySentItems: boolean;
  disallowEditOfExistingOpenOrderInOrderEntry: boolean;
  hideVoidedItemFromOrderScreen: boolean;
  hideExpiredHoldTime: boolean;
  voidItemRequireExplanation: boolean;
  showCouponConfirmationOnFinishInOrderEntry: boolean;
  couponConfirmationExcludeDineInInOrderEntry: boolean;
  disableHalfPortion: boolean;
  allowSaveOrderWithoutAnyItems: boolean;
  weightButtonCaption: string;
  miscFeaturesLockOverrideInOrderEntry: string;
  fireKitchenFlags: boolean[];
  voidItemOrderQuickReasons: string[];
  groupTicketItems: boolean;
};

type OtherSettings = {
  confirmExitProgram: boolean;
  exitProgramSecurity: string;
  openOrderReminderAfterHours: string;
  changeServerSecurity: string;
  searchByOrderNumberInRecallScreen: boolean;
  disableSmartTicketSearch: boolean;
  enableAdvancedBackOfficeProtection: boolean;
  showSecuredCreditCardNumber: boolean;
  disableAutoPrintBankReport: boolean;
  enableBarTabPreAuthorization: boolean;
  barTabPreAuthorizationAmount: string;
  operation24HourMode: boolean;
  showNonResettableGrandTotal: boolean;
  enableTableGroupTipSharing: boolean;
  trainingMode: boolean;
};

type StoreSettingsDraft = {
  general: GeneralSettings;
  taxes: TaxesSettings;
  services: ServicesSettings;
  revenue: RevenueSettings;
  receipts: ReceiptsSettings;
  print: PrintSettings;
  staffCrm: StaffCrmSettings;
  products: ProductsSettings;
  orderEntry: OrderEntrySettings;
  other: OtherSettings;
};

type SettingValue = Record<string, unknown>;

type SettingKey =
  | "store"
  | "services"
  | "ticketing"
  | "store_taxes"
  | "store_revenue"
  | "store_receipts"
  | "store_print"
  | "store_staff_crm"
  | "store_products"
  | "store_order_entry"
  | "store_other"
  | "inventory"
  | "printer_routing"
  | "security";

const SETTING_KEYS: SettingKey[] = [
  "store",
  "services",
  "ticketing",
  "store_taxes",
  "store_revenue",
  "store_receipts",
  "store_print",
  "store_staff_crm",
  "store_products",
  "store_order_entry",
  "store_other",
  "inventory",
  "printer_routing",
  "security"
];

const PRIMARY_TAB_LABELS: Record<PrimaryTab, string> = {
  general: "General",
  taxes: "Taxes",
  services: "Services",
  revenue: "Revenue",
  receipts: "Receipts",
  print: "Print",
  staffCrm: "Staff / CRM",
  products: "Products",
  orderEntry: "Order Entry",
  other: "Server / Login"
};

const SIDEBAR_TAB_ORDER: PrimaryTab[] = [
  "general",
  "print",
  "staffCrm",
  "products",
  "taxes",
  "services",
  "revenue",
  "receipts",
  "other",
  "orderEntry"
];

const TAB_DESCRIPTIONS: Record<PrimaryTab, string> = {
  general: "Manage your store configuration and server preferences.",
  print: "Configure guest checks, printer routing, and duplicate print behavior.",
  staffCrm: "Payroll cadence, overtime policy, and CRM/guest data options.",
  products: "Modifier behavior, product controls, and inventory defaults.",
  taxes: "Tax aliases, rates, and surcharge tax behavior.",
  services: "Dine in, take out, drive-thru, and delivery service controls.",
  revenue: "Payment types, gratuity defaults, and cashier requirements.",
  receipts: "Guest check message content and print visibility options.",
  other: "Security and miscellaneous operations settings.",
  orderEntry: "Order entry guardrails, quick reasons, and kitchen fire options."
};

const TAX_TAB_LABELS: Record<TaxTab, string> = {
  tax1: "Tax 1",
  tax2: "Tax 2",
  tax3: "Tax 3",
  options: "Other Options"
};

const SERVICE_TAB_LABELS: Record<ServiceTab, string> = {
  dineIn: "Dine In",
  takeOut: "Take Out",
  driveThru: "Drive Thru",
  delivery: "Delivery"
};

const REVENUE_TAB_LABELS: Record<RevenueTab, string> = {
  payments: "Payments",
  gratuity: "Gratuity",
  cashier: "Cashier",
  options: "Other Options"
};

const RECEIPTS_TAB_LABELS: Record<ReceiptsTab, string> = {
  guestCheck: "Guest Check",
  kitchenBar: "Kitchen / Bar",
  options: "Other Options"
};

const PRINT_TAB_LABELS: Record<PrintTab, string> = {
  guestCheck: "Guest Check",
  kitchenBar: "Kitchen / Bar",
  multilingual: "Multilingual",
  packager: "Packager Receipt",
  customer: "Customer Receipt",
  options: "Other Options"
};

const PRODUCTS_TAB_LABELS: Record<ProductsTab, string> = {
  modifiers: "Modifiers",
  pizza: "Pizza",
  inventory: "Inventory",
  options: "Other Options"
};

function asObject(value: unknown): SettingValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as SettingValue;
  }
  return {};
}

function asText(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asNumberText(value: unknown, fallback = "") {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return fallback;
}

function toNullableNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildArrayFromRaw(raw: SettingValue, prefix: string, length: number, fallbackPrefix: string) {
  return Array.from({ length }, (_, index) => {
    const key = `${prefix}${index + 1}`;
    return asText(raw[key], `${fallbackPrefix} ${index + 1}`);
  });
}

function buildBooleanArrayFromRaw(raw: SettingValue, prefix: string, length: number) {
  return Array.from({ length }, (_, index) => {
    const key = `${prefix}${index + 1}`;
    return asBool(raw[key], false);
  });
}

function createDefaultDraft(): StoreSettingsDraft {
  return {
    general: {
      name: "",
      address: "",
      postalCode: "",
      cityStateZip: "",
      phone: "",
      defaultAreaCode: "",
      siteNumber: "",
      mailingAddress: "",
      mailingPostalCode: "",
      mailingCityStateZip: "",
      stationName: "",
      serverComputerName: "",
      serverTcpIpAddress: "",
      serverTcpIpPort: "8080",
      autoRestartAllComputers: false,
      autoShutdownAllComputers: false,
      autoTriggerTime: "",
      displaySpecialMessageDuringLogin: false,
      specialMessage: "",
      dailyStartTime: "03:00",
      lunchStartTime: "10:00",
      dinnerStartTime: "16:00",
      telephoneDisplayFormat: "(000) 000-0000",
      telephoneDigits: "10",
      taxRate: "",
      currency: "USD"
    },
    taxes: {
      aliasName: "TAX",
      tax1Rate: "",
      tax2Rate: "",
      tax3Rate: "",
      applyTaxOnSurcharge: true,
      applyTaxOnDeliveryCharge: false,
      includeTaxInPrice: false
    },
    services: {
      dineInEnabled: true,
      takeOutEnabled: true,
      driveThruEnabled: false,
      deliveryEnabled: true,
      dineInAlias: "Dine In",
      takeOutAlias: "Take Out",
      driveThruAlias: "Drive Thru",
      deliveryAlias: "Delivery",
      showRetailScreen: false,
      taxExempt: false,
      skipTableSelection: false,
      trackGuestCountForDineInOrders: false,
      promptCustomerNameAtDineInCompletion: false,
      promptCustomerNameAtBarTabCompletion: false,
      appetizerQuickSendEnabled: false,
      appetizerCategoryKeywords: "appetizer, appetizers"
    },
    revenue: {
      check: false,
      visa: true,
      mastercard: false,
      americanExpress: false,
      discover: false,
      debitCard: true,
      inHouseCharge: false,
      daysDue: "Due Upon Receipt",
      remoteInHouseAccountMarker: "",
      showTipSuggestionOnCheckBasedOnOrderTotal: true,
      tipSuggestionPercentages: "15,20,25",
      autoGratuityPercent: "",
      requireCashierSignIn: false,
      enforceNoSaleReason: false
    },
    receipts: {
      storeMessage: "",
      guestCheckMessage: "15% Gratuity=<15>\n20% Gratuity=<20>\n25% Gratuity=<25>",
      hideTicketNumberFromGuestCheck: false,
      hideTimeFromGuestCheck: false,
      showDeliveryCustSalesInfo: false,
      hideHoldTimeOnPrintedCheck: false,
      hideSeatNumberFromPrintedCheck: false,
      showOrderedItemsIndividually: false,
      hideVoidedItemFromPrintedGuestCheck: true,
      hideModifierCostFromPrintedCheck: true,
      hideNoCostModifierFromPrintedCheck: false,
      guestCheckPrintDescription: false,
      printTipLineOnGuestCheck: false,
      alwaysShowGuestCheckTipLine: false,
      showFoodBarSubtotalsOnGuestCheck: true
    },
    print: {
      printGuestCheckOnSend: false,
      printTwoCopiesOfGuestChecks: false,
      rePrintCheckNeedManagerOverride: false,
      smartSeatHandling: false,
      showTotalPerSeat: false,
      doNotPrintGuestCheckForDineInOrders: false,
      doNotPrintGuestCheckForTakeOutPhonedInOrders: false,
      doNotPrintGuestCheckForTakeOutWalkInOrders: false,
      doNotPrintGuestCheckForDriveThruOrders: false,
      doNotPrintGuestCheckForDeliveryOrders: false,
      customerReceiptPrinterId: "",
      kitchenPrinterId: "",
      barPrinterId: ""
    },
    staffCrm: {
      payPeriod: "Semi-Monthly",
      workWeekEndDay: "Sunday",
      clockOutReminderAfterMinutes: "",
      overTimeBasis: "By Work Week",
      overTimeAfterHours: "40",
      overTimeHourPercent: "150",
      forceHourlyEmployeeClockInBeforeUseSystem: false,
      employeeWithMultiJobSelection: false,
      takeOutDeliveryShowSearchType: false,
      enforceExactTelephoneNumberDigits: false,
      gcsSiteNumber: "",
      gcsServerIp: "",
      gcsServerPort: ""
    },
    products: {
      menuModifierFontSize: "",
      sortMenuSubItemsForcedModifiers: true,
      persistManualModifierPriceChange: false,
      hideNoteFromTouchModifierScreen: false,
      hideHalf: true,
      hideToppings: true,
      hideBarMixing: true,
      hideAll: false,
      disableFinishButtonInForcedModifiers: false,
      autoSelectSingleForcedModifier: true,
      modifierBuilderTypes: ["Taste", "Meat", "Seafood", "Vegetable", "Bar", "Deli", "Ice Cream", "Kitchen"],
      inventoryAutoDecrement: true
    },
    orderEntry: {
      showUnsentItemsInGreen: true,
      orderEntryAmountDueInYellow: false,
      onlySecureChangePriceFeatureOnAlreadySentItems: true,
      disallowEditOfExistingOpenOrderInOrderEntry: false,
      hideVoidedItemFromOrderScreen: false,
      hideExpiredHoldTime: true,
      voidItemRequireExplanation: true,
      showCouponConfirmationOnFinishInOrderEntry: false,
      couponConfirmationExcludeDineInInOrderEntry: false,
      disableHalfPortion: false,
      allowSaveOrderWithoutAnyItems: false,
      weightButtonCaption: "HALF ORDER",
      miscFeaturesLockOverrideInOrderEntry: "",
      fireKitchenFlags: [false, false, false, false, false, false],
      voidItemOrderQuickReasons: ["", "", "", "", "", "", "", ""],
      groupTicketItems: false
    },
    other: {
      confirmExitProgram: true,
      exitProgramSecurity: "",
      openOrderReminderAfterHours: "",
      changeServerSecurity: "",
      searchByOrderNumberInRecallScreen: false,
      disableSmartTicketSearch: true,
      enableAdvancedBackOfficeProtection: true,
      showSecuredCreditCardNumber: true,
      disableAutoPrintBankReport: false,
      enableBarTabPreAuthorization: false,
      barTabPreAuthorizationAmount: "0",
      operation24HourMode: false,
      showNonResettableGrandTotal: false,
      enableTableGroupTipSharing: false,
      trainingMode: false
    }
  };
}

function cloneDraft(value: StoreSettingsDraft) {
  return JSON.parse(JSON.stringify(value)) as StoreSettingsDraft;
}

function buildDraftFromRaw(rawByKey: Record<SettingKey, SettingValue>): StoreSettingsDraft {
  const defaults = createDefaultDraft();
  const store = rawByKey.store;
  const services = rawByKey.services;
  const ticketing = rawByKey.ticketing;
  const taxes = rawByKey.store_taxes;
  const revenue = rawByKey.store_revenue;
  const receipts = rawByKey.store_receipts;
  const print = rawByKey.store_print;
  const staffCrm = rawByKey.store_staff_crm;
  const products = rawByKey.store_products;
  const orderEntry = rawByKey.store_order_entry;
  const other = rawByKey.store_other;
  const inventory = rawByKey.inventory;
  const printerRouting = rawByKey.printer_routing;
  const security = rawByKey.security;

  return {
    general: {
      ...defaults.general,
      name: asText(store.name, defaults.general.name),
      address: asText(store.address, defaults.general.address),
      postalCode: asText(store.postalCode, defaults.general.postalCode),
      cityStateZip: asText(store.cityStateZip, defaults.general.cityStateZip),
      phone: asText(store.phone, defaults.general.phone),
      defaultAreaCode: asText(store.defaultAreaCode, defaults.general.defaultAreaCode),
      siteNumber: asText(store.siteNumber, defaults.general.siteNumber),
      mailingAddress: asText(store.mailingAddress, defaults.general.mailingAddress),
      mailingPostalCode: asText(store.mailingPostalCode, defaults.general.mailingPostalCode),
      mailingCityStateZip: asText(store.mailingCityStateZip, defaults.general.mailingCityStateZip),
      stationName: asText(store.stationName, defaults.general.stationName),
      serverComputerName: asText(store.serverComputerName, defaults.general.serverComputerName),
      serverTcpIpAddress: asText(store.serverTcpIpAddress, defaults.general.serverTcpIpAddress),
      serverTcpIpPort: asText(store.serverTcpIpPort, defaults.general.serverTcpIpPort),
      autoRestartAllComputers: asBool(store.autoRestartAllComputers, defaults.general.autoRestartAllComputers),
      autoShutdownAllComputers: asBool(store.autoShutdownAllComputers, defaults.general.autoShutdownAllComputers),
      autoTriggerTime: asText(store.autoTriggerTime, defaults.general.autoTriggerTime),
      displaySpecialMessageDuringLogin: asBool(
        store.displaySpecialMessageDuringLogin,
        defaults.general.displaySpecialMessageDuringLogin
      ),
      specialMessage: asText(store.specialMessage, defaults.general.specialMessage),
      dailyStartTime: asText(store.dailyStartTime, defaults.general.dailyStartTime),
      lunchStartTime: asText(store.lunchStartTime, defaults.general.lunchStartTime),
      dinnerStartTime: asText(store.dinnerStartTime, defaults.general.dinnerStartTime),
      telephoneDisplayFormat: asText(store.telephoneDisplayFormat, defaults.general.telephoneDisplayFormat),
      telephoneDigits: asText(store.telephoneDigits, defaults.general.telephoneDigits),
      taxRate: asNumberText(store.taxRate, defaults.general.taxRate),
      currency: asText(store.currency, defaults.general.currency)
    },
    taxes: {
      ...defaults.taxes,
      aliasName: asText(taxes.aliasName, defaults.taxes.aliasName),
      tax1Rate: asNumberText(taxes.tax1Rate ?? store.taxRate, defaults.taxes.tax1Rate),
      tax2Rate: asNumberText(taxes.tax2Rate, defaults.taxes.tax2Rate),
      tax3Rate: asNumberText(taxes.tax3Rate, defaults.taxes.tax3Rate),
      applyTaxOnSurcharge: asBool(taxes.applyTaxOnSurcharge, defaults.taxes.applyTaxOnSurcharge),
      applyTaxOnDeliveryCharge: asBool(taxes.applyTaxOnDeliveryCharge, defaults.taxes.applyTaxOnDeliveryCharge),
      includeTaxInPrice: asBool(taxes.includeTaxInPrice, defaults.taxes.includeTaxInPrice)
    },
    services: {
      ...defaults.services,
      dineInEnabled: asBool(services.dineIn, defaults.services.dineInEnabled),
      takeOutEnabled: asBool(services.takeOut, defaults.services.takeOutEnabled),
      driveThruEnabled: asBool(services.driveThru, defaults.services.driveThruEnabled),
      deliveryEnabled: asBool(services.delivery, defaults.services.deliveryEnabled),
      dineInAlias: asText(services.dineInAlias, defaults.services.dineInAlias),
      takeOutAlias: asText(services.takeOutAlias, defaults.services.takeOutAlias),
      driveThruAlias: asText(services.driveThruAlias, defaults.services.driveThruAlias),
      deliveryAlias: asText(services.deliveryAlias, defaults.services.deliveryAlias),
      showRetailScreen: asBool(services.showRetailScreen, defaults.services.showRetailScreen),
      taxExempt: asBool(services.taxExempt, defaults.services.taxExempt),
      skipTableSelection: asBool(services.skipTableSelection, defaults.services.skipTableSelection),
      trackGuestCountForDineInOrders: asBool(
        services.trackGuestCountForDineInOrders,
        defaults.services.trackGuestCountForDineInOrders
      ),
      promptCustomerNameAtDineInCompletion: asBool(
        services.promptCustomerNameAtDineInCompletion,
        defaults.services.promptCustomerNameAtDineInCompletion
      ),
      promptCustomerNameAtBarTabCompletion: asBool(
        services.promptCustomerNameAtBarTabCompletion,
        defaults.services.promptCustomerNameAtBarTabCompletion
      ),
      appetizerQuickSendEnabled: asBool(
        services.appetizerQuickSendEnabled,
        defaults.services.appetizerQuickSendEnabled
      ),
      appetizerCategoryKeywords: asText(
        services.appetizerCategoryKeywords,
        defaults.services.appetizerCategoryKeywords
      )
    },
    revenue: {
      ...defaults.revenue,
      check: asBool(revenue.check, defaults.revenue.check),
      visa: asBool(revenue.visa, defaults.revenue.visa),
      mastercard: asBool(revenue.mastercard, defaults.revenue.mastercard),
      americanExpress: asBool(revenue.americanExpress, defaults.revenue.americanExpress),
      discover: asBool(revenue.discover, defaults.revenue.discover),
      debitCard: asBool(revenue.debitCard, defaults.revenue.debitCard),
      inHouseCharge: asBool(revenue.inHouseCharge, defaults.revenue.inHouseCharge),
      daysDue: asText(revenue.daysDue, defaults.revenue.daysDue),
      remoteInHouseAccountMarker: asText(
        revenue.remoteInHouseAccountMarker,
        defaults.revenue.remoteInHouseAccountMarker
      ),
      showTipSuggestionOnCheckBasedOnOrderTotal: asBool(
        revenue.showTipSuggestionOnCheckBasedOnOrderTotal,
        defaults.revenue.showTipSuggestionOnCheckBasedOnOrderTotal
      ),
      tipSuggestionPercentages: asText(
        revenue.tipSuggestionPercentages,
        defaults.revenue.tipSuggestionPercentages
      ),
      autoGratuityPercent: asNumberText(revenue.autoGratuityPercent, defaults.revenue.autoGratuityPercent),
      requireCashierSignIn: asBool(revenue.requireCashierSignIn, defaults.revenue.requireCashierSignIn),
      enforceNoSaleReason: asBool(revenue.enforceNoSaleReason, defaults.revenue.enforceNoSaleReason)
    },
    receipts: {
      ...defaults.receipts,
      storeMessage: asText(receipts.storeMessage, defaults.receipts.storeMessage),
      guestCheckMessage: asText(receipts.guestCheckMessage, defaults.receipts.guestCheckMessage),
      hideTicketNumberFromGuestCheck: asBool(
        receipts.hideTicketNumberFromGuestCheck,
        defaults.receipts.hideTicketNumberFromGuestCheck
      ),
      hideTimeFromGuestCheck: asBool(receipts.hideTimeFromGuestCheck, defaults.receipts.hideTimeFromGuestCheck),
      showDeliveryCustSalesInfo: asBool(
        receipts.showDeliveryCustSalesInfo,
        defaults.receipts.showDeliveryCustSalesInfo
      ),
      hideHoldTimeOnPrintedCheck: asBool(
        receipts.hideHoldTimeOnPrintedCheck,
        defaults.receipts.hideHoldTimeOnPrintedCheck
      ),
      hideSeatNumberFromPrintedCheck: asBool(
        receipts.hideSeatNumberFromPrintedCheck,
        defaults.receipts.hideSeatNumberFromPrintedCheck
      ),
      showOrderedItemsIndividually: asBool(
        receipts.showOrderedItemsIndividually,
        defaults.receipts.showOrderedItemsIndividually
      ),
      hideVoidedItemFromPrintedGuestCheck: asBool(
        receipts.hideVoidedItemFromPrintedGuestCheck,
        defaults.receipts.hideVoidedItemFromPrintedGuestCheck
      ),
      hideModifierCostFromPrintedCheck: asBool(
        receipts.hideModifierCostFromPrintedCheck,
        defaults.receipts.hideModifierCostFromPrintedCheck
      ),
      hideNoCostModifierFromPrintedCheck: asBool(
        receipts.hideNoCostModifierFromPrintedCheck,
        defaults.receipts.hideNoCostModifierFromPrintedCheck
      ),
      guestCheckPrintDescription: asBool(receipts.guestCheckPrintDescription, defaults.receipts.guestCheckPrintDescription),
      printTipLineOnGuestCheck: asBool(receipts.printTipLineOnGuestCheck, defaults.receipts.printTipLineOnGuestCheck),
      alwaysShowGuestCheckTipLine: asBool(
        receipts.alwaysShowGuestCheckTipLine,
        defaults.receipts.alwaysShowGuestCheckTipLine
      ),
      showFoodBarSubtotalsOnGuestCheck: asBool(
        receipts.showFoodBarSubtotalsOnGuestCheck,
        defaults.receipts.showFoodBarSubtotalsOnGuestCheck
      )
    },
    print: {
      ...defaults.print,
      printGuestCheckOnSend: asBool(print.printGuestCheckOnSend, defaults.print.printGuestCheckOnSend),
      printTwoCopiesOfGuestChecks: asBool(print.printTwoCopiesOfGuestChecks, defaults.print.printTwoCopiesOfGuestChecks),
      rePrintCheckNeedManagerOverride: asBool(
        print.rePrintCheckNeedManagerOverride,
        defaults.print.rePrintCheckNeedManagerOverride
      ),
      smartSeatHandling: asBool(print.smartSeatHandling, defaults.print.smartSeatHandling),
      showTotalPerSeat: asBool(print.showTotalPerSeat, defaults.print.showTotalPerSeat),
      doNotPrintGuestCheckForDineInOrders: asBool(
        print.doNotPrintGuestCheckForDineInOrders,
        defaults.print.doNotPrintGuestCheckForDineInOrders
      ),
      doNotPrintGuestCheckForTakeOutPhonedInOrders: asBool(
        print.doNotPrintGuestCheckForTakeOutPhonedInOrders,
        defaults.print.doNotPrintGuestCheckForTakeOutPhonedInOrders
      ),
      doNotPrintGuestCheckForTakeOutWalkInOrders: asBool(
        print.doNotPrintGuestCheckForTakeOutWalkInOrders,
        defaults.print.doNotPrintGuestCheckForTakeOutWalkInOrders
      ),
      doNotPrintGuestCheckForDriveThruOrders: asBool(
        print.doNotPrintGuestCheckForDriveThruOrders,
        defaults.print.doNotPrintGuestCheckForDriveThruOrders
      ),
      doNotPrintGuestCheckForDeliveryOrders: asBool(
        print.doNotPrintGuestCheckForDeliveryOrders,
        defaults.print.doNotPrintGuestCheckForDeliveryOrders
      ),
      customerReceiptPrinterId: asText(
        print.customerReceiptPrinterId ?? printerRouting.customerReceiptPrinterId,
        defaults.print.customerReceiptPrinterId
      ),
      kitchenPrinterId: asText(
        print.kitchenPrinterId ?? printerRouting.kitchenPrinterId,
        defaults.print.kitchenPrinterId
      ),
      barPrinterId: asText(print.barPrinterId ?? printerRouting.barPrinterId, defaults.print.barPrinterId)
    },
    staffCrm: {
      ...defaults.staffCrm,
      payPeriod: asText(staffCrm.payPeriod, defaults.staffCrm.payPeriod),
      workWeekEndDay: asText(staffCrm.workWeekEndDay, defaults.staffCrm.workWeekEndDay),
      clockOutReminderAfterMinutes: asNumberText(
        staffCrm.clockOutReminderAfterMinutes,
        defaults.staffCrm.clockOutReminderAfterMinutes
      ),
      overTimeBasis: asText(staffCrm.overTimeBasis, defaults.staffCrm.overTimeBasis),
      overTimeAfterHours: asNumberText(staffCrm.overTimeAfterHours, defaults.staffCrm.overTimeAfterHours),
      overTimeHourPercent: asNumberText(staffCrm.overTimeHourPercent, defaults.staffCrm.overTimeHourPercent),
      forceHourlyEmployeeClockInBeforeUseSystem: asBool(
        staffCrm.forceHourlyEmployeeClockInBeforeUseSystem,
        defaults.staffCrm.forceHourlyEmployeeClockInBeforeUseSystem
      ),
      employeeWithMultiJobSelection: asBool(
        staffCrm.employeeWithMultiJobSelection,
        defaults.staffCrm.employeeWithMultiJobSelection
      ),
      takeOutDeliveryShowSearchType: asBool(
        staffCrm.takeOutDeliveryShowSearchType,
        defaults.staffCrm.takeOutDeliveryShowSearchType
      ),
      enforceExactTelephoneNumberDigits: asBool(
        staffCrm.enforceExactTelephoneNumberDigits,
        defaults.staffCrm.enforceExactTelephoneNumberDigits
      ),
      gcsSiteNumber: asText(staffCrm.gcsSiteNumber, defaults.staffCrm.gcsSiteNumber),
      gcsServerIp: asText(staffCrm.gcsServerIp, defaults.staffCrm.gcsServerIp),
      gcsServerPort: asText(staffCrm.gcsServerPort, defaults.staffCrm.gcsServerPort)
    },
    products: {
      ...defaults.products,
      menuModifierFontSize: asNumberText(products.menuModifierFontSize, defaults.products.menuModifierFontSize),
      sortMenuSubItemsForcedModifiers: asBool(
        products.sortMenuSubItemsForcedModifiers,
        defaults.products.sortMenuSubItemsForcedModifiers
      ),
      persistManualModifierPriceChange: asBool(
        products.persistManualModifierPriceChange,
        defaults.products.persistManualModifierPriceChange
      ),
      hideNoteFromTouchModifierScreen: asBool(
        products.hideNoteFromTouchModifierScreen,
        defaults.products.hideNoteFromTouchModifierScreen
      ),
      hideHalf: asBool(products.hideHalf, defaults.products.hideHalf),
      hideToppings: asBool(products.hideToppings, defaults.products.hideToppings),
      hideBarMixing: asBool(products.hideBarMixing, defaults.products.hideBarMixing),
      hideAll: asBool(products.hideAll, defaults.products.hideAll),
      disableFinishButtonInForcedModifiers: asBool(
        products.disableFinishButtonInForcedModifiers,
        defaults.products.disableFinishButtonInForcedModifiers
      ),
      autoSelectSingleForcedModifier: asBool(
        products.autoSelectSingleForcedModifier,
        defaults.products.autoSelectSingleForcedModifier
      ),
      modifierBuilderTypes: buildArrayFromRaw(products, "modifierBuilderType", 8, "Type"),
      inventoryAutoDecrement: asBool(inventory.autoDecrement, defaults.products.inventoryAutoDecrement)
    },
    orderEntry: {
      ...defaults.orderEntry,
      showUnsentItemsInGreen: asBool(orderEntry.showUnsentItemsInGreen, defaults.orderEntry.showUnsentItemsInGreen),
      orderEntryAmountDueInYellow: asBool(
        orderEntry.orderEntryAmountDueInYellow,
        defaults.orderEntry.orderEntryAmountDueInYellow
      ),
      onlySecureChangePriceFeatureOnAlreadySentItems: asBool(
        orderEntry.onlySecureChangePriceFeatureOnAlreadySentItems,
        defaults.orderEntry.onlySecureChangePriceFeatureOnAlreadySentItems
      ),
      disallowEditOfExistingOpenOrderInOrderEntry: asBool(
        orderEntry.disallowEditOfExistingOpenOrderInOrderEntry,
        defaults.orderEntry.disallowEditOfExistingOpenOrderInOrderEntry
      ),
      hideVoidedItemFromOrderScreen: asBool(
        orderEntry.hideVoidedItemFromOrderScreen,
        defaults.orderEntry.hideVoidedItemFromOrderScreen
      ),
      hideExpiredHoldTime: asBool(orderEntry.hideExpiredHoldTime, defaults.orderEntry.hideExpiredHoldTime),
      voidItemRequireExplanation: asBool(
        orderEntry.voidItemRequireExplanation,
        defaults.orderEntry.voidItemRequireExplanation
      ),
      showCouponConfirmationOnFinishInOrderEntry: asBool(
        orderEntry.showCouponConfirmationOnFinishInOrderEntry,
        defaults.orderEntry.showCouponConfirmationOnFinishInOrderEntry
      ),
      couponConfirmationExcludeDineInInOrderEntry: asBool(
        orderEntry.couponConfirmationExcludeDineInInOrderEntry,
        defaults.orderEntry.couponConfirmationExcludeDineInInOrderEntry
      ),
      disableHalfPortion: asBool(orderEntry.disableHalfPortion, defaults.orderEntry.disableHalfPortion),
      allowSaveOrderWithoutAnyItems: asBool(
        orderEntry.allowSaveOrderWithoutAnyItems,
        defaults.orderEntry.allowSaveOrderWithoutAnyItems
      ),
      weightButtonCaption: asText(orderEntry.weightButtonCaption, defaults.orderEntry.weightButtonCaption),
      miscFeaturesLockOverrideInOrderEntry: asText(
        orderEntry.miscFeaturesLockOverrideInOrderEntry,
        defaults.orderEntry.miscFeaturesLockOverrideInOrderEntry
      ),
      fireKitchenFlags: buildBooleanArrayFromRaw(orderEntry, "fireKitchen", 6),
      voidItemOrderQuickReasons: buildArrayFromRaw(orderEntry, "voidItemOrderQuickReason", 8, ""),
      groupTicketItems: asBool(ticketing.groupTicketItems, defaults.orderEntry.groupTicketItems)
    },
    other: {
      ...defaults.other,
      confirmExitProgram: asBool(other.confirmExitProgram, defaults.other.confirmExitProgram),
      exitProgramSecurity: asText(other.exitProgramSecurity, defaults.other.exitProgramSecurity),
      openOrderReminderAfterHours: asNumberText(
        other.openOrderReminderAfterHours,
        defaults.other.openOrderReminderAfterHours
      ),
      changeServerSecurity: asText(other.changeServerSecurity, defaults.other.changeServerSecurity),
      searchByOrderNumberInRecallScreen: asBool(
        other.searchByOrderNumberInRecallScreen,
        defaults.other.searchByOrderNumberInRecallScreen
      ),
      disableSmartTicketSearch: asBool(other.disableSmartTicketSearch, defaults.other.disableSmartTicketSearch),
      enableAdvancedBackOfficeProtection: asBool(
        other.enableAdvancedBackOfficeProtection,
        defaults.other.enableAdvancedBackOfficeProtection
      ),
      showSecuredCreditCardNumber: asBool(other.showSecuredCreditCardNumber, defaults.other.showSecuredCreditCardNumber),
      disableAutoPrintBankReport: asBool(other.disableAutoPrintBankReport, defaults.other.disableAutoPrintBankReport),
      enableBarTabPreAuthorization: asBool(
        other.enableBarTabPreAuthorization,
        defaults.other.enableBarTabPreAuthorization
      ),
      barTabPreAuthorizationAmount: asNumberText(
        other.barTabPreAuthorizationAmount,
        defaults.other.barTabPreAuthorizationAmount
      ),
      operation24HourMode: asBool(other.operation24HourMode, defaults.other.operation24HourMode),
      showNonResettableGrandTotal: asBool(
        other.showNonResettableGrandTotal,
        defaults.other.showNonResettableGrandTotal
      ),
      enableTableGroupTipSharing: asBool(
        other.enableTableGroupTipSharing,
        defaults.other.enableTableGroupTipSharing
      ),
      trainingMode: asBool(security.trainingMode, defaults.other.trainingMode)
    }
  };
}

export default function StoreSettings() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [activeTab, setActiveTab] = useState<PrimaryTab>("general");
  const [taxTab, setTaxTab] = useState<TaxTab>("tax1");
  const [serviceTab, setServiceTab] = useState<ServiceTab>("dineIn");
  const [revenueTab, setRevenueTab] = useState<RevenueTab>("payments");
  const [receiptsTab, setReceiptsTab] = useState<ReceiptsTab>("guestCheck");
  const [printTab, setPrintTab] = useState<PrintTab>("guestCheck");
  const [productsTab, setProductsTab] = useState<ProductsTab>("modifiers");
  const [draft, setDraft] = useState<StoreSettingsDraft>(() => createDefaultDraft());
  const [snapshot, setSnapshot] = useState<StoreSettingsDraft>(() => createDefaultDraft());
  const [rawByKey, setRawByKey] = useState<Record<SettingKey, SettingValue>>({} as Record<SettingKey, SettingValue>);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"ok" | "error" | "">("");

  const updateSection = <K extends keyof StoreSettingsDraft>(section: K, patch: Partial<StoreSettingsDraft[K]>) => {
    setDraft((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        ...patch
      }
    }));
  };

  const load = async () => {
    setLoading(true);
    setStatusMessage("");
    setStatusType("");
    const loadedPairs = await Promise.all(
      SETTING_KEYS.map(async (key) => {
        try {
          const setting = await apiFetch(`/settings/${key}`);
          return [key, asObject(setting?.value)] as const;
        } catch {
          return [key, {} as SettingValue] as const;
        }
      })
    );

    const loaded = Object.fromEntries(loadedPairs) as Record<SettingKey, SettingValue>;
    const nextDraft = buildDraftFromRaw(loaded);
    setRawByKey(loaded);
    setDraft(nextDraft);
    setSnapshot(cloneDraft(nextDraft));
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => {
      setLoading(false);
      setStatusType("error");
      setStatusMessage("Unable to load store settings.");
    });
  }, []);

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(snapshot), [draft, snapshot]);

  const saveAll = async () => {
    if (saving) return;
    setSaving(true);
    setStatusType("");
    setStatusMessage("");

    try {
      const storeValue = {
        ...(rawByKey.store || {}),
        name: draft.general.name,
        address: draft.general.address,
        postalCode: draft.general.postalCode,
        cityStateZip: draft.general.cityStateZip,
        phone: draft.general.phone,
        defaultAreaCode: draft.general.defaultAreaCode,
        siteNumber: draft.general.siteNumber,
        mailingAddress: draft.general.mailingAddress,
        mailingPostalCode: draft.general.mailingPostalCode,
        mailingCityStateZip: draft.general.mailingCityStateZip,
        stationName: draft.general.stationName,
        serverComputerName: draft.general.serverComputerName,
        serverTcpIpAddress: draft.general.serverTcpIpAddress,
        serverTcpIpPort: draft.general.serverTcpIpPort,
        autoRestartAllComputers: draft.general.autoRestartAllComputers,
        autoShutdownAllComputers: draft.general.autoShutdownAllComputers,
        autoTriggerTime: draft.general.autoTriggerTime,
        displaySpecialMessageDuringLogin: draft.general.displaySpecialMessageDuringLogin,
        specialMessage: draft.general.specialMessage,
        dailyStartTime: draft.general.dailyStartTime,
        lunchStartTime: draft.general.lunchStartTime,
        dinnerStartTime: draft.general.dinnerStartTime,
        telephoneDisplayFormat: draft.general.telephoneDisplayFormat,
        telephoneDigits: draft.general.telephoneDigits,
        taxRate: toNullableNumber(draft.general.taxRate),
        currency: draft.general.currency
      };

      const servicesValue = {
        ...(rawByKey.services || {}),
        dineIn: draft.services.dineInEnabled,
        takeOut: draft.services.takeOutEnabled,
        driveThru: draft.services.driveThruEnabled,
        delivery: draft.services.deliveryEnabled,
        dineInAlias: draft.services.dineInAlias,
        takeOutAlias: draft.services.takeOutAlias,
        driveThruAlias: draft.services.driveThruAlias,
        deliveryAlias: draft.services.deliveryAlias,
        showRetailScreen: draft.services.showRetailScreen,
        taxExempt: draft.services.taxExempt,
        skipTableSelection: draft.services.skipTableSelection,
        trackGuestCountForDineInOrders: draft.services.trackGuestCountForDineInOrders,
        promptCustomerNameAtDineInCompletion: draft.services.promptCustomerNameAtDineInCompletion,
        promptCustomerNameAtBarTabCompletion: draft.services.promptCustomerNameAtBarTabCompletion,
        appetizerQuickSendEnabled: draft.services.appetizerQuickSendEnabled,
        appetizerCategoryKeywords: draft.services.appetizerCategoryKeywords
      };

      const taxesValue = {
        ...(rawByKey.store_taxes || {}),
        aliasName: draft.taxes.aliasName,
        tax1Rate: toOptionalNumber(draft.taxes.tax1Rate),
        tax2Rate: toOptionalNumber(draft.taxes.tax2Rate),
        tax3Rate: toOptionalNumber(draft.taxes.tax3Rate),
        applyTaxOnSurcharge: draft.taxes.applyTaxOnSurcharge,
        applyTaxOnDeliveryCharge: draft.taxes.applyTaxOnDeliveryCharge,
        includeTaxInPrice: draft.taxes.includeTaxInPrice
      };

      const revenueValue = {
        ...(rawByKey.store_revenue || {}),
        check: draft.revenue.check,
        visa: draft.revenue.visa,
        mastercard: draft.revenue.mastercard,
        americanExpress: draft.revenue.americanExpress,
        discover: draft.revenue.discover,
        debitCard: draft.revenue.debitCard,
        inHouseCharge: draft.revenue.inHouseCharge,
        daysDue: draft.revenue.daysDue,
        remoteInHouseAccountMarker: draft.revenue.remoteInHouseAccountMarker,
        showTipSuggestionOnCheckBasedOnOrderTotal: draft.revenue.showTipSuggestionOnCheckBasedOnOrderTotal,
        tipSuggestionPercentages: draft.revenue.tipSuggestionPercentages,
        autoGratuityPercent: toOptionalNumber(draft.revenue.autoGratuityPercent),
        requireCashierSignIn: draft.revenue.requireCashierSignIn,
        enforceNoSaleReason: draft.revenue.enforceNoSaleReason
      };

      const receiptsValue = {
        ...(rawByKey.store_receipts || {}),
        storeMessage: draft.receipts.storeMessage,
        guestCheckMessage: draft.receipts.guestCheckMessage,
        hideTicketNumberFromGuestCheck: draft.receipts.hideTicketNumberFromGuestCheck,
        hideTimeFromGuestCheck: draft.receipts.hideTimeFromGuestCheck,
        showDeliveryCustSalesInfo: draft.receipts.showDeliveryCustSalesInfo,
        hideHoldTimeOnPrintedCheck: draft.receipts.hideHoldTimeOnPrintedCheck,
        hideSeatNumberFromPrintedCheck: draft.receipts.hideSeatNumberFromPrintedCheck,
        showOrderedItemsIndividually: draft.receipts.showOrderedItemsIndividually,
        hideVoidedItemFromPrintedGuestCheck: draft.receipts.hideVoidedItemFromPrintedGuestCheck,
        hideModifierCostFromPrintedCheck: draft.receipts.hideModifierCostFromPrintedCheck,
        hideNoCostModifierFromPrintedCheck: draft.receipts.hideNoCostModifierFromPrintedCheck,
        guestCheckPrintDescription: draft.receipts.guestCheckPrintDescription,
        printTipLineOnGuestCheck: draft.receipts.printTipLineOnGuestCheck,
        alwaysShowGuestCheckTipLine: draft.receipts.alwaysShowGuestCheckTipLine,
        showFoodBarSubtotalsOnGuestCheck: draft.receipts.showFoodBarSubtotalsOnGuestCheck
      };

      const printValue = {
        ...(rawByKey.store_print || {}),
        printGuestCheckOnSend: draft.print.printGuestCheckOnSend,
        printTwoCopiesOfGuestChecks: draft.print.printTwoCopiesOfGuestChecks,
        rePrintCheckNeedManagerOverride: draft.print.rePrintCheckNeedManagerOverride,
        smartSeatHandling: draft.print.smartSeatHandling,
        showTotalPerSeat: draft.print.showTotalPerSeat,
        doNotPrintGuestCheckForDineInOrders: draft.print.doNotPrintGuestCheckForDineInOrders,
        doNotPrintGuestCheckForTakeOutPhonedInOrders: draft.print.doNotPrintGuestCheckForTakeOutPhonedInOrders,
        doNotPrintGuestCheckForTakeOutWalkInOrders: draft.print.doNotPrintGuestCheckForTakeOutWalkInOrders,
        doNotPrintGuestCheckForDriveThruOrders: draft.print.doNotPrintGuestCheckForDriveThruOrders,
        doNotPrintGuestCheckForDeliveryOrders: draft.print.doNotPrintGuestCheckForDeliveryOrders,
        customerReceiptPrinterId: draft.print.customerReceiptPrinterId,
        kitchenPrinterId: draft.print.kitchenPrinterId,
        barPrinterId: draft.print.barPrinterId
      };

      const staffCrmValue = {
        ...(rawByKey.store_staff_crm || {}),
        payPeriod: draft.staffCrm.payPeriod,
        workWeekEndDay: draft.staffCrm.workWeekEndDay,
        clockOutReminderAfterMinutes: toOptionalNumber(draft.staffCrm.clockOutReminderAfterMinutes),
        overTimeBasis: draft.staffCrm.overTimeBasis,
        overTimeAfterHours: toOptionalNumber(draft.staffCrm.overTimeAfterHours),
        overTimeHourPercent: toOptionalNumber(draft.staffCrm.overTimeHourPercent),
        forceHourlyEmployeeClockInBeforeUseSystem: draft.staffCrm.forceHourlyEmployeeClockInBeforeUseSystem,
        employeeWithMultiJobSelection: draft.staffCrm.employeeWithMultiJobSelection,
        takeOutDeliveryShowSearchType: draft.staffCrm.takeOutDeliveryShowSearchType,
        enforceExactTelephoneNumberDigits: draft.staffCrm.enforceExactTelephoneNumberDigits,
        gcsSiteNumber: draft.staffCrm.gcsSiteNumber,
        gcsServerIp: draft.staffCrm.gcsServerIp,
        gcsServerPort: draft.staffCrm.gcsServerPort
      };

      const productsValue = {
        ...(rawByKey.store_products || {}),
        menuModifierFontSize: toOptionalNumber(draft.products.menuModifierFontSize),
        sortMenuSubItemsForcedModifiers: draft.products.sortMenuSubItemsForcedModifiers,
        persistManualModifierPriceChange: draft.products.persistManualModifierPriceChange,
        hideNoteFromTouchModifierScreen: draft.products.hideNoteFromTouchModifierScreen,
        hideHalf: draft.products.hideHalf,
        hideToppings: draft.products.hideToppings,
        hideBarMixing: draft.products.hideBarMixing,
        hideAll: draft.products.hideAll,
        disableFinishButtonInForcedModifiers: draft.products.disableFinishButtonInForcedModifiers,
        autoSelectSingleForcedModifier: draft.products.autoSelectSingleForcedModifier,
        ...draft.products.modifierBuilderTypes.reduce<Record<string, string>>((acc, label, index) => {
          acc[`modifierBuilderType${index + 1}`] = label;
          return acc;
        }, {})
      };

      const orderEntryValue = {
        ...(rawByKey.store_order_entry || {}),
        showUnsentItemsInGreen: draft.orderEntry.showUnsentItemsInGreen,
        orderEntryAmountDueInYellow: draft.orderEntry.orderEntryAmountDueInYellow,
        onlySecureChangePriceFeatureOnAlreadySentItems:
          draft.orderEntry.onlySecureChangePriceFeatureOnAlreadySentItems,
        disallowEditOfExistingOpenOrderInOrderEntry:
          draft.orderEntry.disallowEditOfExistingOpenOrderInOrderEntry,
        hideVoidedItemFromOrderScreen: draft.orderEntry.hideVoidedItemFromOrderScreen,
        hideExpiredHoldTime: draft.orderEntry.hideExpiredHoldTime,
        voidItemRequireExplanation: draft.orderEntry.voidItemRequireExplanation,
        showCouponConfirmationOnFinishInOrderEntry:
          draft.orderEntry.showCouponConfirmationOnFinishInOrderEntry,
        couponConfirmationExcludeDineInInOrderEntry:
          draft.orderEntry.couponConfirmationExcludeDineInInOrderEntry,
        disableHalfPortion: draft.orderEntry.disableHalfPortion,
        allowSaveOrderWithoutAnyItems: draft.orderEntry.allowSaveOrderWithoutAnyItems,
        weightButtonCaption: draft.orderEntry.weightButtonCaption,
        miscFeaturesLockOverrideInOrderEntry: draft.orderEntry.miscFeaturesLockOverrideInOrderEntry,
        ...draft.orderEntry.fireKitchenFlags.reduce<Record<string, boolean>>((acc, enabled, index) => {
          acc[`fireKitchen${index + 1}`] = enabled;
          return acc;
        }, {}),
        ...draft.orderEntry.voidItemOrderQuickReasons.reduce<Record<string, string>>((acc, value, index) => {
          acc[`voidItemOrderQuickReason${index + 1}`] = value;
          return acc;
        }, {})
      };

      const otherValue = {
        ...(rawByKey.store_other || {}),
        confirmExitProgram: draft.other.confirmExitProgram,
        exitProgramSecurity: draft.other.exitProgramSecurity,
        openOrderReminderAfterHours: toOptionalNumber(draft.other.openOrderReminderAfterHours),
        changeServerSecurity: draft.other.changeServerSecurity,
        searchByOrderNumberInRecallScreen: draft.other.searchByOrderNumberInRecallScreen,
        disableSmartTicketSearch: draft.other.disableSmartTicketSearch,
        enableAdvancedBackOfficeProtection: draft.other.enableAdvancedBackOfficeProtection,
        showSecuredCreditCardNumber: draft.other.showSecuredCreditCardNumber,
        disableAutoPrintBankReport: draft.other.disableAutoPrintBankReport,
        enableBarTabPreAuthorization: draft.other.enableBarTabPreAuthorization,
        barTabPreAuthorizationAmount: toOptionalNumber(draft.other.barTabPreAuthorizationAmount),
        operation24HourMode: draft.other.operation24HourMode,
        showNonResettableGrandTotal: draft.other.showNonResettableGrandTotal,
        enableTableGroupTipSharing: draft.other.enableTableGroupTipSharing
      };

      const ticketingValue = {
        ...(rawByKey.ticketing || {}),
        groupTicketItems: draft.orderEntry.groupTicketItems
      };

      const inventoryValue = {
        ...(rawByKey.inventory || {}),
        autoDecrement: draft.products.inventoryAutoDecrement
      };

      const printerRoutingValue = {
        ...(rawByKey.printer_routing || {}),
        customerReceiptPrinterId: draft.print.customerReceiptPrinterId || undefined,
        kitchenPrinterId: draft.print.kitchenPrinterId || undefined,
        barPrinterId: draft.print.barPrinterId || undefined
      };

      const securityValue = {
        ...(rawByKey.security || {}),
        trainingMode: draft.other.trainingMode
      };

      await Promise.all([
        apiFetch("/settings/store", { method: "PATCH", body: JSON.stringify({ value: storeValue }) }),
        apiFetch("/settings/services", { method: "PATCH", body: JSON.stringify({ value: servicesValue }) }),
        apiFetch("/settings/ticketing", { method: "PATCH", body: JSON.stringify({ value: ticketingValue }) }),
        apiFetch("/settings/store_taxes", { method: "PATCH", body: JSON.stringify({ value: taxesValue }) }),
        apiFetch("/settings/store_revenue", { method: "PATCH", body: JSON.stringify({ value: revenueValue }) }),
        apiFetch("/settings/store_receipts", { method: "PATCH", body: JSON.stringify({ value: receiptsValue }) }),
        apiFetch("/settings/store_print", { method: "PATCH", body: JSON.stringify({ value: printValue }) }),
        apiFetch("/settings/store_staff_crm", {
          method: "PATCH",
          body: JSON.stringify({ value: staffCrmValue })
        }),
        apiFetch("/settings/store_products", { method: "PATCH", body: JSON.stringify({ value: productsValue }) }),
        apiFetch("/settings/store_order_entry", {
          method: "PATCH",
          body: JSON.stringify({ value: orderEntryValue })
        }),
        apiFetch("/settings/store_other", { method: "PATCH", body: JSON.stringify({ value: otherValue }) }),
        apiFetch("/settings/inventory", { method: "PATCH", body: JSON.stringify({ value: inventoryValue }) }),
        apiFetch("/settings/printer_routing", {
          method: "PATCH",
          body: JSON.stringify({ value: printerRoutingValue })
        }),
        apiFetch("/settings/security", { method: "PATCH", body: JSON.stringify({ value: securityValue }) })
      ]);

      const nextSnapshot = cloneDraft(draft);
      setSnapshot(nextSnapshot);
      setStatusType("ok");
      setStatusMessage("Store settings saved.");

      setRawByKey((prev) => ({
        ...prev,
        store: asObject(storeValue),
        services: asObject(servicesValue),
        ticketing: asObject(ticketingValue),
        store_taxes: asObject(taxesValue),
        store_revenue: asObject(revenueValue),
        store_receipts: asObject(receiptsValue),
        store_print: asObject(printValue),
        store_staff_crm: asObject(staffCrmValue),
        store_products: asObject(productsValue),
        store_order_entry: asObject(orderEntryValue),
        store_other: asObject(otherValue),
        inventory: asObject(inventoryValue),
        printer_routing: asObject(printerRoutingValue),
        security: asObject(securityValue)
      }));
    } catch (err) {
      setStatusType("error");
      setStatusMessage(err instanceof Error ? err.message : "Unable to save store settings.");
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setDraft(cloneDraft(snapshot));
    setStatusType("");
    setStatusMessage("");
  };

  if (loading) {
    return (
      <div className="screen-shell">
        <header className="screen-header">
          <div>
            <h2>Store Settings</h2>
            <p>Loading settings...</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="store-settings-shell">
      <aside className="store-settings-sidebar">
        <div className="store-settings-brand">
          <img className="store-settings-brand-mark" src="/branding/websys-icon.svg" alt="WebSys" />
          <div>
            <strong>WebSys POS</strong>
            <span>Configuration</span>
          </div>
        </div>
        <nav className="store-side-nav">
          {SIDEBAR_TAB_ORDER.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`store-side-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {PRIMARY_TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
      </aside>

      <section className="store-settings-panel">
        <header className="store-settings-topbar">
          <div>
            <h2>Store Settings</h2>
            <p>Manage your store configuration and server preferences.</p>
          </div>
          <div className="store-settings-user">
            <span className="store-settings-avatar">
              {(currentUser?.displayName || currentUser?.username || "A").slice(0, 1).toUpperCase()}
            </span>
            <span>{currentUser?.displayName || currentUser?.username || "Admin"}</span>
            <span className="store-settings-user-caret">v</span>
          </div>
        </header>

        <div className="store-settings-body">
          <div className="store-settings-body-head">
            <h3>{PRIMARY_TAB_LABELS[activeTab]}</h3>
            <p>{TAB_DESCRIPTIONS[activeTab]}</p>
          </div>
          {activeTab === "general" && (
            <div className="store-overview-grid">
              <div className="store-card-block store-overview-main">
                <h4>Store Information</h4>
                <p className="store-muted">Manage your store profile, address, phone, and business hours.</p>
                <div className="store-field-grid two-col">
                  <label className="store-field">
                    <span>Store Name</span>
                    <input
                      value={draft.general.name}
                      onChange={(e) => updateSection("general", { name: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Station Name</span>
                    <input
                      value={draft.general.stationName}
                      onChange={(e) => updateSection("general", { stationName: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Premise Address</span>
                    <input
                      value={draft.general.address}
                      onChange={(e) => updateSection("general", { address: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Phone Number</span>
                    <input
                      value={draft.general.phone}
                      onChange={(e) => updateSection("general", { phone: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Premise Postal Code</span>
                    <input
                      value={draft.general.postalCode}
                      onChange={(e) => updateSection("general", { postalCode: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>City / State</span>
                    <input
                      value={draft.general.cityStateZip}
                      onChange={(e) => updateSection("general", { cityStateZip: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Mailing Address</span>
                    <input
                      value={draft.general.mailingAddress}
                      onChange={(e) => updateSection("general", { mailingAddress: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Telephone Display Format</span>
                    <input
                      value={draft.general.telephoneDisplayFormat}
                      onChange={(e) => updateSection("general", { telephoneDisplayFormat: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Mailing Postal Code</span>
                    <input
                      value={draft.general.mailingPostalCode}
                      onChange={(e) => updateSection("general", { mailingPostalCode: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Mailing City / State</span>
                    <input
                      value={draft.general.mailingCityStateZip}
                      onChange={(e) => updateSection("general", { mailingCityStateZip: e.target.value })}
                    />
                  </label>
                </div>

                <div className="store-time-grid">
                  <label className="store-field">
                    <span>Daily Start Time</span>
                    <input
                      value={draft.general.dailyStartTime}
                      onChange={(e) => updateSection("general", { dailyStartTime: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Lunch Start Time</span>
                    <input
                      value={draft.general.lunchStartTime}
                      onChange={(e) => updateSection("general", { lunchStartTime: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Dinner Start Time</span>
                    <input
                      value={draft.general.dinnerStartTime}
                      onChange={(e) => updateSection("general", { dinnerStartTime: e.target.value })}
                    />
                  </label>
                </div>

                <div className="store-field-grid two-col">
                  <label className="store-field">
                    <span>Currency</span>
                    <input
                      value={draft.general.currency}
                      onChange={(e) => updateSection("general", { currency: e.target.value.toUpperCase() })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Telephone Digits</span>
                    <input
                      value={draft.general.telephoneDigits}
                      onChange={(e) => updateSection("general", { telephoneDigits: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="store-overview-side">
                <div className="store-card-block">
                  <h4>Server Settings</h4>
                  <div className="store-field-grid two-col">
                    <label className="store-field">
                      <span>Server Name</span>
                      <input
                        value={draft.general.serverComputerName}
                        onChange={(e) => updateSection("general", { serverComputerName: e.target.value })}
                      />
                    </label>
                    <label className="store-field">
                      <span>TCP/IP Port</span>
                      <input
                        value={draft.general.serverTcpIpPort}
                        onChange={(e) => updateSection("general", { serverTcpIpPort: e.target.value })}
                      />
                    </label>
                    <label className="store-field">
                      <span>Server TCP/IP Address</span>
                      <input
                        value={draft.general.serverTcpIpAddress}
                        onChange={(e) => updateSection("general", { serverTcpIpAddress: e.target.value })}
                      />
                    </label>
                    <label className="store-field">
                      <span>Auto Trigger Time</span>
                      <input
                        value={draft.general.autoTriggerTime}
                        onChange={(e) => updateSection("general", { autoTriggerTime: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="store-check-grid">
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.general.autoRestartAllComputers}
                        onChange={(e) => updateSection("general", { autoRestartAllComputers: e.target.checked })}
                      />
                      <span>Auto Restart All Computers</span>
                    </label>
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.general.autoShutdownAllComputers}
                        onChange={(e) => updateSection("general", { autoShutdownAllComputers: e.target.checked })}
                      />
                      <span>Auto Shut Down All Computers</span>
                    </label>
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.general.displaySpecialMessageDuringLogin}
                        onChange={(e) =>
                          updateSection("general", { displaySpecialMessageDuringLogin: e.target.checked })
                        }
                      />
                      <span>Display Special Message During Login</span>
                    </label>
                  </div>
                </div>

                <div className="store-card-block">
                  <h4>System Automation</h4>
                  <div className="store-field-grid two-col">
                    <label className="store-field">
                      <span>Default Area Code</span>
                      <input
                        value={draft.general.defaultAreaCode}
                        onChange={(e) => updateSection("general", { defaultAreaCode: e.target.value })}
                      />
                    </label>
                    <label className="store-field">
                      <span>Site Number</span>
                      <input
                        value={draft.general.siteNumber}
                        onChange={(e) => updateSection("general", { siteNumber: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="store-field">
                    <span>Special Message</span>
                    <textarea
                      rows={6}
                      value={draft.general.specialMessage}
                      onChange={(e) => updateSection("general", { specialMessage: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "taxes" && (
            <div className="store-card-block">
              <div className="store-subtabs">
                {(Object.keys(TAX_TAB_LABELS) as TaxTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`store-subtab-btn ${taxTab === tab ? "active" : ""}`}
                    onClick={() => setTaxTab(tab)}
                  >
                    {TAX_TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              {taxTab === "tax1" && (
                <div className="store-field-grid two-col">
                  <label className="store-field">
                    <span>Alias Name</span>
                    <input
                      value={draft.taxes.aliasName}
                      onChange={(e) => updateSection("taxes", { aliasName: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Tax 1 (%)</span>
                    <input
                      value={draft.taxes.tax1Rate}
                      onChange={(e) => updateSection("taxes", { tax1Rate: e.target.value })}
                    />
                  </label>
                  <label className="store-check">
                    <input
                      type="checkbox"
                      checked={draft.taxes.applyTaxOnSurcharge}
                      onChange={(e) => updateSection("taxes", { applyTaxOnSurcharge: e.target.checked })}
                    />
                    <span>Apply Tax On Surcharge</span>
                  </label>
                  <label className="store-check">
                    <input
                      type="checkbox"
                      checked={draft.taxes.applyTaxOnDeliveryCharge}
                      onChange={(e) => updateSection("taxes", { applyTaxOnDeliveryCharge: e.target.checked })}
                    />
                    <span>Apply Tax On Delivery Charge</span>
                  </label>
                </div>
              )}

              {taxTab === "tax2" && (
                <div className="store-field-grid two-col">
                  <label className="store-field">
                    <span>Tax 2 Alias</span>
                    <input
                      value={draft.taxes.aliasName}
                      onChange={(e) => updateSection("taxes", { aliasName: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Tax 2 (%)</span>
                    <input
                      value={draft.taxes.tax2Rate}
                      onChange={(e) => updateSection("taxes", { tax2Rate: e.target.value })}
                    />
                  </label>
                </div>
              )}

              {taxTab === "tax3" && (
                <div className="store-field-grid two-col">
                  <label className="store-field">
                    <span>Tax 3 Alias</span>
                    <input
                      value={draft.taxes.aliasName}
                      onChange={(e) => updateSection("taxes", { aliasName: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Tax 3 (%)</span>
                    <input
                      value={draft.taxes.tax3Rate}
                      onChange={(e) => updateSection("taxes", { tax3Rate: e.target.value })}
                    />
                  </label>
                </div>
              )}

              {taxTab === "options" && (
                <div className="store-field-grid two-col">
                  <label className="store-check">
                    <input
                      type="checkbox"
                      checked={draft.taxes.includeTaxInPrice}
                      onChange={(e) => updateSection("taxes", { includeTaxInPrice: e.target.checked })}
                    />
                    <span>Include Tax In Item Price</span>
                  </label>
                  <label className="store-field">
                    <span>Default Tax Rate (Store)</span>
                    <input
                      value={draft.general.taxRate}
                      onChange={(e) => updateSection("general", { taxRate: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {activeTab === "services" && (
            <div className="store-card-block">
              <div className="store-subtabs">
                {(Object.keys(SERVICE_TAB_LABELS) as ServiceTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`store-subtab-btn ${serviceTab === tab ? "active" : ""}`}
                    onClick={() => setServiceTab(tab)}
                  >
                    {SERVICE_TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              <div className="store-field-grid two-col">
                {serviceTab === "dineIn" && (
                  <>
                    <label className="store-check strong-check">
                      <input
                        type="checkbox"
                        checked={draft.services.dineInEnabled}
                        onChange={(e) => updateSection("services", { dineInEnabled: e.target.checked })}
                      />
                      <span>Dine In Enabled</span>
                    </label>
                    <label className="store-field">
                      <span>Alias Name</span>
                      <input
                        value={draft.services.dineInAlias}
                        onChange={(e) => updateSection("services", { dineInAlias: e.target.value })}
                      />
                    </label>
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.services.showRetailScreen}
                        onChange={(e) => updateSection("services", { showRetailScreen: e.target.checked })}
                      />
                      <span>Show Retail Screen</span>
                    </label>
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.services.taxExempt}
                        onChange={(e) => updateSection("services", { taxExempt: e.target.checked })}
                      />
                      <span>Tax Exempt</span>
                    </label>
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.services.skipTableSelection}
                        onChange={(e) => updateSection("services", { skipTableSelection: e.target.checked })}
                      />
                      <span>Skip Table Selection</span>
                    </label>
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.services.trackGuestCountForDineInOrders}
                        onChange={(e) =>
                          updateSection("services", { trackGuestCountForDineInOrders: e.target.checked })
                        }
                      />
                      <span>Track Guest Count For Dine In Orders</span>
                    </label>
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.services.promptCustomerNameAtDineInCompletion}
                        onChange={(e) =>
                          updateSection("services", {
                            promptCustomerNameAtDineInCompletion: e.target.checked
                          })
                        }
                      />
                      <span>Prompt Customer Name At Dine In Completion</span>
                    </label>
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.services.promptCustomerNameAtBarTabCompletion}
                        onChange={(e) =>
                          updateSection("services", {
                            promptCustomerNameAtBarTabCompletion: e.target.checked
                          })
                        }
                      />
                      <span>Prompt Customer Name At Bar Tab Completion</span>
                    </label>
                    <label className="store-check">
                      <input
                        type="checkbox"
                        checked={draft.services.appetizerQuickSendEnabled}
                        onChange={(e) =>
                          updateSection("services", {
                            appetizerQuickSendEnabled: e.target.checked
                          })
                        }
                      />
                      <span>Enable Appetizer Send Button During Dine In</span>
                    </label>
                    <label className="store-field">
                      <span>Appetizer Category Keywords (comma-separated)</span>
                      <input
                        value={draft.services.appetizerCategoryKeywords}
                        onChange={(e) =>
                          updateSection("services", {
                            appetizerCategoryKeywords: e.target.value
                          })
                        }
                        placeholder="appetizer, appetizers"
                      />
                    </label>
                  </>
                )}

                {serviceTab === "takeOut" && (
                  <>
                    <label className="store-check strong-check">
                      <input
                        type="checkbox"
                        checked={draft.services.takeOutEnabled}
                        onChange={(e) => updateSection("services", { takeOutEnabled: e.target.checked })}
                      />
                      <span>Take Out Enabled</span>
                    </label>
                    <label className="store-field">
                      <span>Alias Name</span>
                      <input
                        value={draft.services.takeOutAlias}
                        onChange={(e) => updateSection("services", { takeOutAlias: e.target.value })}
                      />
                    </label>
                  </>
                )}

                {serviceTab === "driveThru" && (
                  <>
                    <label className="store-check strong-check">
                      <input
                        type="checkbox"
                        checked={draft.services.driveThruEnabled}
                        onChange={(e) => updateSection("services", { driveThruEnabled: e.target.checked })}
                      />
                      <span>Drive Thru Enabled</span>
                    </label>
                    <label className="store-field">
                      <span>Alias Name</span>
                      <input
                        value={draft.services.driveThruAlias}
                        onChange={(e) => updateSection("services", { driveThruAlias: e.target.value })}
                      />
                    </label>
                  </>
                )}

                {serviceTab === "delivery" && (
                  <>
                    <label className="store-check strong-check">
                      <input
                        type="checkbox"
                        checked={draft.services.deliveryEnabled}
                        onChange={(e) => updateSection("services", { deliveryEnabled: e.target.checked })}
                      />
                      <span>Delivery Enabled</span>
                    </label>
                    <label className="store-field">
                      <span>Alias Name</span>
                      <input
                        value={draft.services.deliveryAlias}
                        onChange={(e) => updateSection("services", { deliveryAlias: e.target.value })}
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "revenue" && (
            <div className="store-card-block">
              <div className="store-subtabs">
                {(Object.keys(REVENUE_TAB_LABELS) as RevenueTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`store-subtab-btn ${revenueTab === tab ? "active" : ""}`}
                    onClick={() => setRevenueTab(tab)}
                  >
                    {REVENUE_TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              {revenueTab === "payments" && (
                <div className="store-section-grid two-col">
                  <div className="store-check-grid">
                    <label className="store-check"><input type="checkbox" checked={draft.revenue.check} onChange={(e) => updateSection("revenue", { check: e.target.checked })} /><span>Check</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.revenue.visa} onChange={(e) => updateSection("revenue", { visa: e.target.checked })} /><span>Visa</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.revenue.mastercard} onChange={(e) => updateSection("revenue", { mastercard: e.target.checked })} /><span>Mastercard</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.revenue.americanExpress} onChange={(e) => updateSection("revenue", { americanExpress: e.target.checked })} /><span>American Express</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.revenue.discover} onChange={(e) => updateSection("revenue", { discover: e.target.checked })} /><span>Discover</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.revenue.debitCard} onChange={(e) => updateSection("revenue", { debitCard: e.target.checked })} /><span>ATM / Debit Card</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.revenue.inHouseCharge} onChange={(e) => updateSection("revenue", { inHouseCharge: e.target.checked })} /><span>In House Charge</span></label>
                  </div>
                  <div className="store-field-grid">
                    <label className="store-field">
                      <span>Days Due</span>
                      <input
                        value={draft.revenue.daysDue}
                        onChange={(e) => updateSection("revenue", { daysDue: e.target.value })}
                      />
                    </label>
                    <label className="store-field">
                      <span>Remote In House Account Marker</span>
                      <input
                        value={draft.revenue.remoteInHouseAccountMarker}
                        onChange={(e) =>
                          updateSection("revenue", { remoteInHouseAccountMarker: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </div>
              )}

              {revenueTab === "gratuity" && (
                <div className="store-field-grid two-col">
                  <label className="store-check">
                    <input
                      type="checkbox"
                      checked={draft.revenue.showTipSuggestionOnCheckBasedOnOrderTotal}
                      onChange={(e) =>
                        updateSection("revenue", {
                          showTipSuggestionOnCheckBasedOnOrderTotal: e.target.checked
                        })
                      }
                    />
                    <span>Show Tip Suggestion On Check Based On Order Total</span>
                  </label>
                  <label className="store-field">
                    <span>Tip Suggestion Percentages</span>
                    <input
                      value={draft.revenue.tipSuggestionPercentages}
                      onChange={(e) =>
                        updateSection("revenue", { tipSuggestionPercentages: e.target.value })
                      }
                      placeholder="15,20,25"
                    />
                  </label>
                  <label className="store-field">
                    <span>Auto Gratuity Percent</span>
                    <input
                      value={draft.revenue.autoGratuityPercent}
                      onChange={(e) => updateSection("revenue", { autoGratuityPercent: e.target.value })}
                    />
                  </label>
                </div>
              )}

              {revenueTab === "cashier" && (
                <div className="store-check-grid">
                  <label className="store-check">
                    <input
                      type="checkbox"
                      checked={draft.revenue.requireCashierSignIn}
                      onChange={(e) =>
                        updateSection("revenue", { requireCashierSignIn: e.target.checked })
                      }
                    />
                    <span>Cashier Sign In / Sign Out Required</span>
                  </label>
                  <label className="store-check">
                    <input
                      type="checkbox"
                      checked={draft.revenue.enforceNoSaleReason}
                      onChange={(e) => updateSection("revenue", { enforceNoSaleReason: e.target.checked })}
                    />
                    <span>Access No Sale Require Explanation</span>
                  </label>
                </div>
              )}

              {revenueTab === "options" && (
                <p className="store-muted">Revenue and processor integration options can be extended from Payments settings.</p>
              )}
            </div>
          )}

          {activeTab === "receipts" && (
            <div className="store-card-block">
              <div className="store-subtabs">
                {(Object.keys(RECEIPTS_TAB_LABELS) as ReceiptsTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`store-subtab-btn ${receiptsTab === tab ? "active" : ""}`}
                    onClick={() => setReceiptsTab(tab)}
                  >
                    {RECEIPTS_TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              {receiptsTab === "guestCheck" && (
                <div className="store-section-grid two-col">
                  <div className="store-check-grid">
                    <label className="store-field">
                      <span>Store Message</span>
                      <input
                        value={draft.receipts.storeMessage}
                        onChange={(e) => updateSection("receipts", { storeMessage: e.target.value })}
                      />
                    </label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.hideTicketNumberFromGuestCheck} onChange={(e) => updateSection("receipts", { hideTicketNumberFromGuestCheck: e.target.checked })} /><span>Hide Ticket Number From Guest Check</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.hideTimeFromGuestCheck} onChange={(e) => updateSection("receipts", { hideTimeFromGuestCheck: e.target.checked })} /><span>Hide Time From Guest Check</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.showDeliveryCustSalesInfo} onChange={(e) => updateSection("receipts", { showDeliveryCustSalesInfo: e.target.checked })} /><span>Show Delivery Cust Sales Info</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.hideVoidedItemFromPrintedGuestCheck} onChange={(e) => updateSection("receipts", { hideVoidedItemFromPrintedGuestCheck: e.target.checked })} /><span>Hide Voided Item From Printed Guest Check</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.hideModifierCostFromPrintedCheck} onChange={(e) => updateSection("receipts", { hideModifierCostFromPrintedCheck: e.target.checked })} /><span>Hide Modifier Cost From Printed Check</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.hideNoCostModifierFromPrintedCheck} onChange={(e) => updateSection("receipts", { hideNoCostModifierFromPrintedCheck: e.target.checked })} /><span>Hide No Cost Modifier From Printed Check</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.guestCheckPrintDescription} onChange={(e) => updateSection("receipts", { guestCheckPrintDescription: e.target.checked })} /><span>Guest Check Print Description</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.printTipLineOnGuestCheck} onChange={(e) => updateSection("receipts", { printTipLineOnGuestCheck: e.target.checked })} /><span>Print Tip Line On Guest Check</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.alwaysShowGuestCheckTipLine} onChange={(e) => updateSection("receipts", { alwaysShowGuestCheckTipLine: e.target.checked })} /><span>Always Show Guest Check Tip Line</span></label>
                    <label className="store-check"><input type="checkbox" checked={draft.receipts.showFoodBarSubtotalsOnGuestCheck} onChange={(e) => updateSection("receipts", { showFoodBarSubtotalsOnGuestCheck: e.target.checked })} /><span>Show Food / Bar Subtotals On Guest Check</span></label>
                  </div>
                  <label className="store-field">
                    <span>Guest Check Message</span>
                    <textarea
                      rows={16}
                      value={draft.receipts.guestCheckMessage}
                      onChange={(e) => updateSection("receipts", { guestCheckMessage: e.target.value })}
                    />
                  </label>
                </div>
              )}

              {receiptsTab === "kitchenBar" && (
                <div className="store-check-grid">
                  <label className="store-check"><input type="checkbox" checked={draft.receipts.hideHoldTimeOnPrintedCheck} onChange={(e) => updateSection("receipts", { hideHoldTimeOnPrintedCheck: e.target.checked })} /><span>Hide Hold Time On Printed Check</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.receipts.hideSeatNumberFromPrintedCheck} onChange={(e) => updateSection("receipts", { hideSeatNumberFromPrintedCheck: e.target.checked })} /><span>Hide Seat # From Printed Check</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.receipts.showOrderedItemsIndividually} onChange={(e) => updateSection("receipts", { showOrderedItemsIndividually: e.target.checked })} /><span>Show Ordered Items Individually</span></label>
                </div>
              )}

              {receiptsTab === "options" && (
                <p className="store-muted">Receipt tips and per-station print behavior are fully persisted and available to printer logic.</p>
              )}
            </div>
          )}

          {activeTab === "print" && (
            <div className="store-card-block">
              <div className="store-subtabs">
                {(Object.keys(PRINT_TAB_LABELS) as PrintTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`store-subtab-btn ${printTab === tab ? "active" : ""}`}
                    onClick={() => setPrintTab(tab)}
                  >
                    {PRINT_TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              {(printTab === "guestCheck" || printTab === "kitchenBar") && (
                <div className="store-check-grid">
                  <label className="store-check"><input type="checkbox" checked={draft.print.printGuestCheckOnSend} onChange={(e) => updateSection("print", { printGuestCheckOnSend: e.target.checked })} /><span>Print Guest Check On Send</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.print.printTwoCopiesOfGuestChecks} onChange={(e) => updateSection("print", { printTwoCopiesOfGuestChecks: e.target.checked })} /><span>Print Two Copies Of Guest Checks</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.print.rePrintCheckNeedManagerOverride} onChange={(e) => updateSection("print", { rePrintCheckNeedManagerOverride: e.target.checked })} /><span>Re-Print Check Need Manager Override</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.print.smartSeatHandling} onChange={(e) => updateSection("print", { smartSeatHandling: e.target.checked })} /><span>Smart Seat Handling</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.print.showTotalPerSeat} onChange={(e) => updateSection("print", { showTotalPerSeat: e.target.checked })} /><span>Show Total Per Seat</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.print.doNotPrintGuestCheckForDineInOrders} onChange={(e) => updateSection("print", { doNotPrintGuestCheckForDineInOrders: e.target.checked })} /><span>Do Not Print Guest Check For Dine-In Orders</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.print.doNotPrintGuestCheckForTakeOutPhonedInOrders} onChange={(e) => updateSection("print", { doNotPrintGuestCheckForTakeOutPhonedInOrders: e.target.checked })} /><span>Do Not Print Guest Check For Take Out (Phoned In) Orders</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.print.doNotPrintGuestCheckForTakeOutWalkInOrders} onChange={(e) => updateSection("print", { doNotPrintGuestCheckForTakeOutWalkInOrders: e.target.checked })} /><span>Do Not Print Guest Check For Take Out (Walk In) Orders</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.print.doNotPrintGuestCheckForDriveThruOrders} onChange={(e) => updateSection("print", { doNotPrintGuestCheckForDriveThruOrders: e.target.checked })} /><span>Do Not Print Guest Check For Drive Thru Orders</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.print.doNotPrintGuestCheckForDeliveryOrders} onChange={(e) => updateSection("print", { doNotPrintGuestCheckForDeliveryOrders: e.target.checked })} /><span>Do Not Print Guest Check For Delivery Orders</span></label>
                </div>
              )}

              {(printTab === "options" || printTab === "customer") && (
                <div className="store-field-grid three-col">
                  <label className="store-field">
                    <span>Customer Receipt Printer ID</span>
                    <input
                      value={draft.print.customerReceiptPrinterId}
                      onChange={(e) => updateSection("print", { customerReceiptPrinterId: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Kitchen Printer ID</span>
                    <input
                      value={draft.print.kitchenPrinterId}
                      onChange={(e) => updateSection("print", { kitchenPrinterId: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Bar Printer ID</span>
                    <input
                      value={draft.print.barPrinterId}
                      onChange={(e) => updateSection("print", { barPrinterId: e.target.value })}
                    />
                  </label>
                </div>
              )}

              {(printTab === "multilingual" || printTab === "packager") && (
                <p className="store-muted">Multilingual, packager, and customer receipt profiles are saved and ready for integration-specific templates.</p>
              )}
            </div>
          )}

          {activeTab === "staffCrm" && (
            <div className="store-card-block">
              <div className="store-section-grid two-col">
                <div className="store-field-grid">
                  <label className="store-field">
                    <span>Pay Period</span>
                    <select
                      value={draft.staffCrm.payPeriod}
                      onChange={(e) => updateSection("staffCrm", { payPeriod: e.target.value })}
                    >
                      <option value="Weekly">Weekly</option>
                      <option value="Bi-Weekly">Bi-Weekly</option>
                      <option value="Semi-Monthly">Semi-Monthly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </label>
                  <label className="store-field">
                    <span>Work Week End Day</span>
                    <select
                      value={draft.staffCrm.workWeekEndDay}
                      onChange={(e) => updateSection("staffCrm", { workWeekEndDay: e.target.value })}
                    >
                      {[
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday"
                      ].map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="store-field">
                    <span>Clock Out Reminder After (Minutes)</span>
                    <input
                      value={draft.staffCrm.clockOutReminderAfterMinutes}
                      onChange={(e) =>
                        updateSection("staffCrm", { clockOutReminderAfterMinutes: e.target.value })
                      }
                    />
                  </label>
                  <label className="store-check"><input type="checkbox" checked={draft.staffCrm.forceHourlyEmployeeClockInBeforeUseSystem} onChange={(e) => updateSection("staffCrm", { forceHourlyEmployeeClockInBeforeUseSystem: e.target.checked })} /><span>Force Hourly Employee Clock In Before Use System</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.staffCrm.employeeWithMultiJobSelection} onChange={(e) => updateSection("staffCrm", { employeeWithMultiJobSelection: e.target.checked })} /><span>Employee With Multi Job Selection</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.staffCrm.takeOutDeliveryShowSearchType} onChange={(e) => updateSection("staffCrm", { takeOutDeliveryShowSearchType: e.target.checked })} /><span>Take Out / Delivery Show Search Type</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.staffCrm.enforceExactTelephoneNumberDigits} onChange={(e) => updateSection("staffCrm", { enforceExactTelephoneNumberDigits: e.target.checked })} /><span>Enforce Exact Telephone Number Digits</span></label>
                </div>

                <div className="store-field-grid">
                  <label className="store-field">
                    <span>Over Time Basis</span>
                    <select
                      value={draft.staffCrm.overTimeBasis}
                      onChange={(e) => updateSection("staffCrm", { overTimeBasis: e.target.value })}
                    >
                      <option value="By Work Week">By Work Week</option>
                      <option value="By Day">By Day</option>
                    </select>
                  </label>
                  <label className="store-field">
                    <span>Over Time After (Hours)</span>
                    <input
                      value={draft.staffCrm.overTimeAfterHours}
                      onChange={(e) => updateSection("staffCrm", { overTimeAfterHours: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Over Time Hour %</span>
                    <input
                      value={draft.staffCrm.overTimeHourPercent}
                      onChange={(e) => updateSection("staffCrm", { overTimeHourPercent: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>GCS Site Number</span>
                    <input
                      value={draft.staffCrm.gcsSiteNumber}
                      onChange={(e) => updateSection("staffCrm", { gcsSiteNumber: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>GCS Server IP</span>
                    <input
                      value={draft.staffCrm.gcsServerIp}
                      onChange={(e) => updateSection("staffCrm", { gcsServerIp: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>GCS Server Port</span>
                    <input
                      value={draft.staffCrm.gcsServerPort}
                      onChange={(e) => updateSection("staffCrm", { gcsServerPort: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "products" && (
            <div className="store-card-block">
              <div className="store-subtabs">
                {(Object.keys(PRODUCTS_TAB_LABELS) as ProductsTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`store-subtab-btn ${productsTab === tab ? "active" : ""}`}
                    onClick={() => setProductsTab(tab)}
                  >
                    {PRODUCTS_TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              {productsTab === "modifiers" && (
                <div className="store-field-grid two-col">
                  <label className="store-field">
                    <span>Menu / Modifier Font Size</span>
                    <input
                      value={draft.products.menuModifierFontSize}
                      onChange={(e) => updateSection("products", { menuModifierFontSize: e.target.value })}
                    />
                  </label>
                  <label className="store-check"><input type="checkbox" checked={draft.products.sortMenuSubItemsForcedModifiers} onChange={(e) => updateSection("products", { sortMenuSubItemsForcedModifiers: e.target.checked })} /><span>Sort Menu Sub Items / Forced Modifiers</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.products.persistManualModifierPriceChange} onChange={(e) => updateSection("products", { persistManualModifierPriceChange: e.target.checked })} /><span>Persist Manual Modifier Price Change</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.products.hideNoteFromTouchModifierScreen} onChange={(e) => updateSection("products", { hideNoteFromTouchModifierScreen: e.target.checked })} /><span>Hide NOTE From Touch Modifier Screen</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.products.hideHalf} onChange={(e) => updateSection("products", { hideHalf: e.target.checked })} /><span>Hide 'Half'</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.products.hideToppings} onChange={(e) => updateSection("products", { hideToppings: e.target.checked })} /><span>Hide 'Toppings'</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.products.hideBarMixing} onChange={(e) => updateSection("products", { hideBarMixing: e.target.checked })} /><span>Hide 'Bar Mixing'</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.products.hideAll} onChange={(e) => updateSection("products", { hideAll: e.target.checked })} /><span>Hide 'All'</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.products.disableFinishButtonInForcedModifiers} onChange={(e) => updateSection("products", { disableFinishButtonInForcedModifiers: e.target.checked })} /><span>Disable FINISH Button In Forced Modifiers</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.products.autoSelectSingleForcedModifier} onChange={(e) => updateSection("products", { autoSelectSingleForcedModifier: e.target.checked })} /><span>Auto Select Single Forced Modifier</span></label>
                </div>
              )}

              {productsTab === "modifiers" && (
                <div className="store-field-grid two-col">
                  {draft.products.modifierBuilderTypes.map((value, index) => (
                    <label key={`builder-${index + 1}`} className="store-field">
                      <span>Modifier Builder Type {index + 1}</span>
                      <input
                        value={value}
                        onChange={(e) => {
                          const next = [...draft.products.modifierBuilderTypes];
                          next[index] = e.target.value;
                          updateSection("products", { modifierBuilderTypes: next });
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}

              {productsTab === "inventory" && (
                <div className="store-check-grid">
                  <label className="store-check">
                    <input
                      type="checkbox"
                      checked={draft.products.inventoryAutoDecrement}
                      onChange={(e) => updateSection("products", { inventoryAutoDecrement: e.target.checked })}
                    />
                    <span>Inventory Auto Decrement On Paid Orders</span>
                  </label>
                </div>
              )}

              {(productsTab === "pizza" || productsTab === "options") && (
                <p className="store-muted">Pizza and advanced product options are persisted for phased rollout.</p>
              )}
            </div>
          )}

          {activeTab === "orderEntry" && (
            <div className="store-card-block">
              <div className="store-section-grid two-col">
                <div className="store-check-grid">
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.showUnsentItemsInGreen} onChange={(e) => updateSection("orderEntry", { showUnsentItemsInGreen: e.target.checked })} /><span>Show Unsent Items In Green</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.orderEntryAmountDueInYellow} onChange={(e) => updateSection("orderEntry", { orderEntryAmountDueInYellow: e.target.checked })} /><span>Order Entry Amount Due In Yellow</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.onlySecureChangePriceFeatureOnAlreadySentItems} onChange={(e) => updateSection("orderEntry", { onlySecureChangePriceFeatureOnAlreadySentItems: e.target.checked })} /><span>Only Secure Change Price Feature On Already Sent Items</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.disallowEditOfExistingOpenOrderInOrderEntry} onChange={(e) => updateSection("orderEntry", { disallowEditOfExistingOpenOrderInOrderEntry: e.target.checked })} /><span>Disallow Edit Of Existing Open Order In Order Entry</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.hideVoidedItemFromOrderScreen} onChange={(e) => updateSection("orderEntry", { hideVoidedItemFromOrderScreen: e.target.checked })} /><span>Hide Voided Item From Order Screen</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.hideExpiredHoldTime} onChange={(e) => updateSection("orderEntry", { hideExpiredHoldTime: e.target.checked })} /><span>Hide Expired Hold Time</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.voidItemRequireExplanation} onChange={(e) => updateSection("orderEntry", { voidItemRequireExplanation: e.target.checked })} /><span>Void Item Require Explanation</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.showCouponConfirmationOnFinishInOrderEntry} onChange={(e) => updateSection("orderEntry", { showCouponConfirmationOnFinishInOrderEntry: e.target.checked })} /><span>Show Coupon Confirmation On Finish In Order Entry</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.couponConfirmationExcludeDineInInOrderEntry} onChange={(e) => updateSection("orderEntry", { couponConfirmationExcludeDineInInOrderEntry: e.target.checked })} /><span>Coupon Confirmation Exclude Dine-In In Order Entry</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.disableHalfPortion} onChange={(e) => updateSection("orderEntry", { disableHalfPortion: e.target.checked })} /><span>Disable 'Half Portion'</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.allowSaveOrderWithoutAnyItems} onChange={(e) => updateSection("orderEntry", { allowSaveOrderWithoutAnyItems: e.target.checked })} /><span>Allow Save Order Without Any Items</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.orderEntry.groupTicketItems} onChange={(e) => updateSection("orderEntry", { groupTicketItems: e.target.checked })} /><span>Group Ticket Items</span></label>
                </div>

                <div className="store-field-grid">
                  <label className="store-field">
                    <span>Weight Button Caption</span>
                    <input
                      value={draft.orderEntry.weightButtonCaption}
                      onChange={(e) => updateSection("orderEntry", { weightButtonCaption: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Misc. Features Lock Override In Order Entry</span>
                    <input
                      value={draft.orderEntry.miscFeaturesLockOverrideInOrderEntry}
                      onChange={(e) =>
                        updateSection("orderEntry", { miscFeaturesLockOverrideInOrderEntry: e.target.value })
                      }
                    />
                  </label>

                  <div className="store-inline-box">
                    <span>Fire Kitchen</span>
                    <div className="store-check-grid compact">
                      {draft.orderEntry.fireKitchenFlags.map((enabled, index) => (
                        <label key={`fire-kitchen-${index + 1}`} className="store-check compact-check">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => {
                              const next = [...draft.orderEntry.fireKitchenFlags];
                              next[index] = e.target.checked;
                              updateSection("orderEntry", { fireKitchenFlags: next });
                            }}
                          />
                          <span>Fire Kitchen {index + 1}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="store-inline-box">
                    <span>Void Item / Order Quick Reason</span>
                    <div className="store-quick-grid">
                      {draft.orderEntry.voidItemOrderQuickReasons.map((value, index) => (
                        <input
                          key={`quick-reason-${index + 1}`}
                          value={value}
                          onChange={(e) => {
                            const next = [...draft.orderEntry.voidItemOrderQuickReasons];
                            next[index] = e.target.value;
                            updateSection("orderEntry", { voidItemOrderQuickReasons: next });
                          }}
                          placeholder={`Reason ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "other" && (
            <div className="store-card-block">
              <div className="store-section-grid two-col">
                <div className="store-field-grid">
                  <label className="store-check"><input type="checkbox" checked={draft.other.confirmExitProgram} onChange={(e) => updateSection("other", { confirmExitProgram: e.target.checked })} /><span>Confirm Exit Program</span></label>
                  <label className="store-field">
                    <span>Exit Program Security</span>
                    <input
                      value={draft.other.exitProgramSecurity}
                      onChange={(e) => updateSection("other", { exitProgramSecurity: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Open Order Reminder After (Hours)</span>
                    <input
                      value={draft.other.openOrderReminderAfterHours}
                      onChange={(e) => updateSection("other", { openOrderReminderAfterHours: e.target.value })}
                    />
                  </label>
                  <label className="store-field">
                    <span>Change Server Security</span>
                    <input
                      value={draft.other.changeServerSecurity}
                      onChange={(e) => updateSection("other", { changeServerSecurity: e.target.value })}
                    />
                  </label>
                  <label className="store-check"><input type="checkbox" checked={draft.other.searchByOrderNumberInRecallScreen} onChange={(e) => updateSection("other", { searchByOrderNumberInRecallScreen: e.target.checked })} /><span>Search By Order Number In Recall Screen</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.other.disableSmartTicketSearch} onChange={(e) => updateSection("other", { disableSmartTicketSearch: e.target.checked })} /><span>Disable Smart Ticket Search</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.other.enableAdvancedBackOfficeProtection} onChange={(e) => updateSection("other", { enableAdvancedBackOfficeProtection: e.target.checked })} /><span>Enable Advanced Back Office Protection</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.other.trainingMode} onChange={(e) => updateSection("other", { trainingMode: e.target.checked })} /><span>Training Mode</span></label>
                </div>

                <div className="store-field-grid">
                  <label className="store-check"><input type="checkbox" checked={draft.other.showSecuredCreditCardNumber} onChange={(e) => updateSection("other", { showSecuredCreditCardNumber: e.target.checked })} /><span>Show Secured Credit Card Number</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.other.disableAutoPrintBankReport} onChange={(e) => updateSection("other", { disableAutoPrintBankReport: e.target.checked })} /><span>Disable Auto Print Bank Report</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.other.enableBarTabPreAuthorization} onChange={(e) => updateSection("other", { enableBarTabPreAuthorization: e.target.checked })} /><span>Enable Bar Tab Pre-Authorization</span></label>
                  <label className="store-field">
                    <span>Bar Tab Pre-Authorization Amount</span>
                    <input
                      value={draft.other.barTabPreAuthorizationAmount}
                      onChange={(e) => updateSection("other", { barTabPreAuthorizationAmount: e.target.value })}
                    />
                  </label>
                  <label className="store-check"><input type="checkbox" checked={draft.other.operation24HourMode} onChange={(e) => updateSection("other", { operation24HourMode: e.target.checked })} /><span>24 Hour Operation Mode</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.other.showNonResettableGrandTotal} onChange={(e) => updateSection("other", { showNonResettableGrandTotal: e.target.checked })} /><span>Show Non Resettable Grand Total</span></label>
                  <label className="store-check"><input type="checkbox" checked={draft.other.enableTableGroupTipSharing} onChange={(e) => updateSection("other", { enableTableGroupTipSharing: e.target.checked })} /><span>Enable Table Group Tip Sharing</span></label>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="store-settings-footer">
          <div className="store-settings-status">
            {statusMessage ? <span className={`store-status-pill ${statusType}`}>{statusMessage}</span> : null}
            {isDirty && !statusMessage ? <span className="store-status-pill">Unsaved changes</span> : null}
          </div>
          <div className="store-settings-actions">
            <div className="store-settings-actions-left">
              <button type="button" className="terminal-btn ghost subtle" onClick={() => navigate("/settings/data-source")}>
                Data Source
              </button>
              <button type="button" className="terminal-btn ghost subtle" onClick={() => navigate("/settings/payments")}>
                Payments
              </button>
              <button type="button" className="terminal-btn ghost subtle" onClick={() => navigate("/back-office")}>
                Back Office
              </button>
            </div>
            <div className="store-settings-actions-right">
              <button type="button" className="terminal-btn ghost" onClick={resetChanges} disabled={saving || !isDirty}>
                Cancel
              </button>
              <button type="button" className="terminal-btn primary" onClick={() => void saveAll()} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
