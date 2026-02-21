type PermissionDomain =
  | "all"
  | "orders"
  | "menu"
  | "tables"
  | "cash"
  | "reports"
  | "inventory"
  | "users"
  | "settings"
  | "timeclock";

export type LegacySecurityRuleDefinition = {
  key: string;
  name: string;
  description: string;
  permission: PermissionDomain;
  defaultMinLevel: number;
  defaultEnforced: boolean;
};

export type LegacySecurityRuleOverride = {
  minLevel?: number;
  enforced?: boolean;
};

export type LegacySecurityRuleOverrideMap = Record<string, LegacySecurityRuleOverride>;

export const LEGACY_SECURITY_RULES: LegacySecurityRuleDefinition[] = [
  {
    key: "access_delivery_status",
    name: "Security: Access Delivery Status",
    description: "View and update delivery status details.",
    permission: "orders",
    defaultMinLevel: 3,
    defaultEnforced: true
  },
  {
    key: "access_driver_tracking",
    name: "Security: Access Driver Tracking",
    description: "View and manage driver tracking and delivery assignments.",
    permission: "orders",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "adjust_price_in_order_entry",
    name: "Security: Adjust Price in Order Entry",
    description: "Change item pricing during order entry.",
    permission: "orders",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "approve_cash_register_discrepancies",
    name: "Security: Approve Cash Register Discrepancies",
    description: "Approve cash variance and drawer discrepancies.",
    permission: "cash",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "access_back_office",
    name: "Security: Access Back Office",
    description: "Enter protected back office modules.",
    permission: "settings",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "cash_discount_amount_entry",
    name: "Security: Cash Discount Amount Entry",
    description: "Manually enter cash discount values.",
    permission: "cash",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "apply_credit_usage_require_manager",
    name: "Security: Apply Credit Usage Require Manager",
    description: "Apply customer credits with manager-level approval.",
    permission: "cash",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "access_daily_closing_report",
    name: "Security: Access Daily Closing Report",
    description: "View and print daily close reports.",
    permission: "reports",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "discounts_require_manager",
    name: "Security: Discounts Require Manager",
    description: "Apply discounts that require elevated approval.",
    permission: "orders",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "edit_delivery_compensation_amount",
    name: "Security: Edit Delivery Compensation Amount",
    description: "Modify delivery compensation values.",
    permission: "orders",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "edit_unpaid_employee_time_cards",
    name: "Security: Edit Unpaid Employee Time Cards",
    description: "Change unpaid time card records.",
    permission: "timeclock",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "create_new_orders",
    name: "Security: Create New Orders",
    description: "Create new customer tickets/orders.",
    permission: "orders",
    defaultMinLevel: 2,
    defaultEnforced: true
  },
  {
    key: "exclusive_cash_register_access",
    name: "Security: Exclusive Cash Register Access",
    description: "Restrict register access to assigned user.",
    permission: "cash",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "exclusive_server_access",
    name: "Security: Exclusive Server Access",
    description: "Restrict ticket access to assigned server.",
    permission: "orders",
    defaultMinLevel: 3,
    defaultEnforced: true
  },
  {
    key: "approval_clock_in_not_on_schedule",
    name: "Security: Approval of Clock In Time Not On Schedule",
    description: "Approve early/late clock-ins outside schedule.",
    permission: "timeclock",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "issue_refund_to_customer",
    name: "Security: Issue Refund To Customer",
    description: "Issue refunds on orders.",
    permission: "cash",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "maintain_customer_credits",
    name: "Security: Maintain Customer Credits",
    description: "Create/update customer credit balances.",
    permission: "cash",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "maintain_gift_certificates",
    name: "Security: Maintain Gift Certificates",
    description: "Create/update gift certificates.",
    permission: "cash",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "access_manual_modifier_screen",
    name: "Security: Access Manual Modifier Screen",
    description: "Use manual add/no/note modifiers.",
    permission: "orders",
    defaultMinLevel: 3,
    defaultEnforced: true
  },
  {
    key: "access_misc_features_operations",
    name: "Security: Access Miscellaneous Features in Operations",
    description: "Access miscellaneous operations functions.",
    permission: "orders",
    defaultMinLevel: 3,
    defaultEnforced: true
  },
  {
    key: "do_not_print_duplicate_order_to_bar",
    name: "Security: Do Not Print Duplicate Order To Bar",
    description: "Suppress duplicate bar ticket printing.",
    permission: "orders",
    defaultMinLevel: 3,
    defaultEnforced: false
  },
  {
    key: "do_not_print_duplicate_order_to_kitchen",
    name: "Security: Do Not Print Duplicate Order To Kitchen",
    description: "Suppress duplicate kitchen ticket printing.",
    permission: "orders",
    defaultMinLevel: 3,
    defaultEnforced: false
  },
  {
    key: "access_no_sale_feature",
    name: "Security: Access No Sale Feature",
    description: "Open drawer without sale.",
    permission: "cash",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "access_no_sale_require_explanation",
    name: "Security: Access No Sale Require Explanation",
    description: "Require explanation on no-sale events.",
    permission: "cash",
    defaultMinLevel: 3,
    defaultEnforced: true
  },
  {
    key: "access_no_sale_require_manager",
    name: "Security: Access No Sale Require Manager",
    description: "Require manager-level access for no-sale.",
    permission: "cash",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "apply_gratuity_require_manager",
    name: "Security: Apply Gratuity Require Manager in Order Entry",
    description: "Apply manual gratuity with manager-level access.",
    permission: "orders",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "issue_payout_to_vendor",
    name: "Security: Issue Payout To Vendor",
    description: "Issue vendor payouts from cash module.",
    permission: "cash",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "recall_existing_order",
    name: "Security: Recall Existing Order",
    description: "Recall and reopen existing orders.",
    permission: "orders",
    defaultMinLevel: 3,
    defaultEnforced: true
  },
  {
    key: "accept_gift_certificate_redemption",
    name: "Security: Accept Gift Certificate Redemption",
    description: "Accept gift certificates as payment.",
    permission: "cash",
    defaultMinLevel: 3,
    defaultEnforced: true
  },
  {
    key: "cashier_sign_in_sign_out",
    name: "Security: Cashier Sign In/Cashier Sign Out",
    description: "Perform cashier sign-in and sign-out workflow.",
    permission: "cash",
    defaultMinLevel: 3,
    defaultEnforced: true
  },
  {
    key: "apply_surcharge_require_manager",
    name: "Security: Apply Surcharge Require Manager",
    description: "Apply surcharge with manager-level access.",
    permission: "orders",
    defaultMinLevel: 5,
    defaultEnforced: true
  },
  {
    key: "accept_complimentary_payment",
    name: "Security: Accept Complimentary Payment",
    description: "Close tickets with complimentary tender.",
    permission: "cash",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "accept_in_house_charge_payment",
    name: "Security: Accept In House Charge Payment",
    description: "Post in-house charge settlements.",
    permission: "cash",
    defaultMinLevel: 4,
    defaultEnforced: true
  },
  {
    key: "void_order_or_items",
    name: "Security: Void Order or Items",
    description: "Void whole ticket or individual items.",
    permission: "orders",
    defaultMinLevel: 5,
    defaultEnforced: true
  }
];

const LEGACY_RULE_KEY_SET = new Set(LEGACY_SECURITY_RULES.map((rule) => rule.key));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeSecurityLevel(value: unknown, fallback = 3) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) {
    return value;
  }
  return fallback;
}

export function normalizeOptionalSecurityLevel(value: unknown): number | null {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) {
    return value;
  }
  return null;
}

export function normalizeLegacySecurityOverrides(value: unknown): LegacySecurityRuleOverrideMap {
  if (!isRecord(value)) return {};
  const next: LegacySecurityRuleOverrideMap = {};

  for (const [key, raw] of Object.entries(value)) {
    if (!LEGACY_RULE_KEY_SET.has(key)) continue;
    if (!isRecord(raw)) continue;

    const normalized: LegacySecurityRuleOverride = {};
    if (typeof raw.minLevel === "number" && Number.isInteger(raw.minLevel) && raw.minLevel >= 1 && raw.minLevel <= 5) {
      normalized.minLevel = raw.minLevel;
    }
    if (typeof raw.enforced === "boolean") {
      normalized.enforced = raw.enforced;
    }
    if (typeof normalized.minLevel === "undefined" && typeof normalized.enforced === "undefined") {
      continue;
    }
    next[key] = normalized;
  }

  return next;
}

export function resolveLegacySecurityConfig(
  roleConfigValue: unknown,
  userOverrideValue?: unknown
) {
  const roleConfig = normalizeLegacySecurityOverrides(roleConfigValue);
  const userOverrides = normalizeLegacySecurityOverrides(userOverrideValue);
  const resolved: Record<string, { minLevel: number; enforced: boolean }> = {};

  for (const rule of LEGACY_SECURITY_RULES) {
    const roleRule = roleConfig[rule.key];
    const userRule = userOverrides[rule.key];
    resolved[rule.key] = {
      minLevel: userRule?.minLevel ?? roleRule?.minLevel ?? rule.defaultMinLevel,
      enforced: userRule?.enforced ?? roleRule?.enforced ?? rule.defaultEnforced
    };
  }

  return resolved;
}

export function evaluateLegacySecurityConfig(
  resolvedConfig: Record<string, { minLevel: number; enforced: boolean }>,
  securityLevelValue: unknown
) {
  const securityLevel = normalizeSecurityLevel(securityLevelValue, 3);
  const evaluated: Record<string, { minLevel: number; enforced: boolean; allowed: boolean }> = {};

  for (const rule of LEGACY_SECURITY_RULES) {
    const current = resolvedConfig[rule.key] ?? {
      minLevel: rule.defaultMinLevel,
      enforced: rule.defaultEnforced
    };
    const allowed = !current.enforced || securityLevel >= current.minLevel;
    evaluated[rule.key] = {
      minLevel: current.minLevel,
      enforced: current.enforced,
      allowed
    };
  }

  return evaluated;
}
