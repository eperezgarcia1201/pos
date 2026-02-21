import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import {
  LEGACY_SECURITY_RULES,
  PERMISSION_OPTIONS,
  evaluateLegacySecurity,
  normalizeLegacySecurityOverrides,
  normalizeOptionalSecurityLevel,
  normalizePermissionMap,
  normalizePermissionOverrides,
  normalizeSecurityLevel,
  resolveLegacySecurityConfig,
  type LegacySecurityRuleOverrideMap,
  type PermissionOverrideMap
} from "../lib/securityCatalog";

type Role = {
  id: string;
  name: string;
  permissions?: Record<string, boolean>;
  securityLevel?: number;
  legacySecurityConfig?: LegacySecurityRuleOverrideMap;
};

type UserSecurityRecord = {
  id: string;
  username: string;
  displayName?: string | null;
  roleId: string;
  roleName?: string | null;
  active: boolean;
  hasPin?: boolean;
  rolePermissions?: Record<string, boolean>;
  permissionOverrides?: PermissionOverrideMap;
  roleSecurityLevel?: number;
  securityLevel?: number | null;
  roleLegacySecurityConfig?: LegacySecurityRuleOverrideMap;
  legacySecurityOverrides?: LegacySecurityRuleOverrideMap;
};

const SECURITY_LEVEL_OPTIONS = [
  { value: 1, label: "1 - Lowest Access" },
  { value: 2, label: "2 - Basic Access" },
  { value: 3, label: "3 - Standard Access" },
  { value: 4, label: "4 - Elevated Access" },
  { value: 5, label: "5 - Highest Access" }
];

function levelText(levelValue: unknown) {
  const level = normalizeSecurityLevel(levelValue, 3);
  const option = SECURITY_LEVEL_OPTIONS.find((item) => item.value === level);
  return option?.label ?? `Level ${level}`;
}

const permissionLabelByKey = new Map(PERMISSION_OPTIONS.map((permission) => [permission.key, permission.label]));

export default function SecuritySettings() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserSecurityRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permissionOverrides, setPermissionOverrides] = useState<PermissionOverrideMap>({});
  const [securityLevelOverride, setSecurityLevelOverride] = useState<number | null>(null);
  const [legacySecurityOverrides, setLegacySecurityOverrides] = useState<LegacySecurityRuleOverrideMap>({});
  const [legacyRuleFilter, setLegacyRuleFilter] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");

  const load = async () => {
    const [rolesRaw, usersRaw] = await Promise.all([apiFetch("/roles"), apiFetch("/users")]);
    const nextRoles = Array.isArray(rolesRaw) ? (rolesRaw as Role[]) : [];
    const nextUsers = Array.isArray(usersRaw) ? (usersRaw as UserSecurityRecord[]) : [];
    setRoles(nextRoles);
    setUsers(nextUsers);
    setSelectedUserId((current) => {
      if (current && nextUsers.some((user) => user.id === current)) return current;
      return nextUsers[0]?.id ?? "";
    });
  };

  useEffect(() => {
    load().catch((err) => setStatusError(err instanceof Error ? err.message : "Unable to load security settings."));
  }, []);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedUser?.roleId) ?? null,
    [roles, selectedUser?.roleId]
  );

  useEffect(() => {
    if (!selectedUser) return;
    setPermissionOverrides(normalizePermissionOverrides(selectedUser.permissionOverrides));
    setSecurityLevelOverride(normalizeOptionalSecurityLevel(selectedUser.securityLevel));
    setLegacySecurityOverrides(normalizeLegacySecurityOverrides(selectedUser.legacySecurityOverrides));
    setStatusError("");
    setStatusNotice("");
  }, [selectedUser]);

  const rolePermissions = useMemo(
    () => normalizePermissionMap(selectedUser?.rolePermissions ?? selectedRole?.permissions),
    [selectedUser?.rolePermissions, selectedRole?.permissions]
  );

  const effectivePermissions = useMemo(() => {
    const resolved = { ...rolePermissions };
    for (const [key, value] of Object.entries(permissionOverrides)) {
      resolved[key] = value === "allow";
    }
    return resolved;
  }, [rolePermissions, permissionOverrides]);

  const roleSecurityLevel = useMemo(
    () => normalizeSecurityLevel(selectedUser?.roleSecurityLevel ?? selectedRole?.securityLevel, 3),
    [selectedRole?.securityLevel, selectedUser?.roleSecurityLevel]
  );

  const effectiveSecurityLevel = securityLevelOverride ?? roleSecurityLevel;

  const roleLegacyResolved = useMemo(
    () => resolveLegacySecurityConfig(selectedUser?.roleLegacySecurityConfig ?? selectedRole?.legacySecurityConfig),
    [selectedRole?.legacySecurityConfig, selectedUser?.roleLegacySecurityConfig]
  );

  const effectiveLegacyResolved = useMemo(
    () => resolveLegacySecurityConfig(roleLegacyResolved, legacySecurityOverrides),
    [roleLegacyResolved, legacySecurityOverrides]
  );

  const evaluatedLegacy = useMemo(
    () => evaluateLegacySecurity(effectiveLegacyResolved, effectiveSecurityLevel),
    [effectiveLegacyResolved, effectiveSecurityLevel]
  );

  const filteredLegacyRules = useMemo(() => {
    const filter = legacyRuleFilter.trim().toLowerCase();
    if (!filter) return LEGACY_SECURITY_RULES;
    return LEGACY_SECURITY_RULES.filter((rule) => {
      const area = permissionLabelByKey.get(rule.permission) ?? rule.permission;
      return (
        rule.name.toLowerCase().includes(filter) ||
        rule.description.toLowerCase().includes(filter) ||
        area.toLowerCase().includes(filter)
      );
    });
  }, [legacyRuleFilter]);

  const setLegacyMinLevelOverride = (ruleKey: string, value: string) => {
    setLegacySecurityOverrides((prev) => {
      const next = { ...prev };
      const current = { ...(next[ruleKey] ?? {}) };
      if (value === "inherit") {
        delete current.minLevel;
      } else {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 5) {
          current.minLevel = parsed;
        }
      }
      if (typeof current.minLevel === "undefined" && typeof current.enforced === "undefined") {
        delete next[ruleKey];
      } else {
        next[ruleKey] = current;
      }
      return next;
    });
  };

  const setLegacyEnforcedOverride = (ruleKey: string, value: string) => {
    setLegacySecurityOverrides((prev) => {
      const next = { ...prev };
      const current = { ...(next[ruleKey] ?? {}) };
      if (value === "inherit") {
        delete current.enforced;
      } else {
        current.enforced = value === "true";
      }
      if (typeof current.minLevel === "undefined" && typeof current.enforced === "undefined") {
        delete next[ruleKey];
      } else {
        next[ruleKey] = current;
      }
      return next;
    });
  };

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Security Settings</h2>
          <p>Set per-user permission overrides, security levels, and legacy rule enforcement.</p>
        </div>
      </header>

      <div className="screen-content security-user-settings">
        <div className="security-user-settings-layout">
          <section className="security-user-list">
            {users.map((user) => {
              const roleName = user.roleName ?? roles.find((role) => role.id === user.roleId)?.name ?? "Unassigned";
              const name = user.displayName?.trim() || user.username;
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`security-user-item ${selectedUserId === user.id ? "active" : ""}`}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <strong>{name}</strong>
                  <span>@{user.username}</span>
                  <span>{roleName}</span>
                  <span>{user.active ? "Active" : "Inactive"} / PIN {user.hasPin ? "Set" : "Missing"}</span>
                </button>
              );
            })}
          </section>

          <section className="security-user-editor">
            {!selectedUser && <p className="hint">Select an employee to edit security overrides.</p>}
            {selectedUser && (
              <>
                <div className="security-user-summary">
                  <strong>{selectedUser.displayName?.trim() || selectedUser.username}</strong>
                  <span>
                    Role: {selectedUser.roleName ?? selectedRole?.name ?? "Unassigned"} | Role level:{" "}
                    {levelText(roleSecurityLevel)}
                  </span>
                  <span>
                    Effective level: {levelText(effectiveSecurityLevel)} | User level override:{" "}
                    {securityLevelOverride ? `Level ${securityLevelOverride}` : "Inherit role"}
                  </span>
                </div>

                <div className="form-row">
                  <label className="field">
                    <span>User Security Level</span>
                    <select
                      value={securityLevelOverride === null ? "inherit" : String(securityLevelOverride)}
                      onChange={(e) =>
                        setSecurityLevelOverride(
                          e.target.value === "inherit"
                            ? null
                            : normalizeSecurityLevel(Number(e.target.value), roleSecurityLevel)
                        )
                      }
                    >
                      <option value="inherit">Inherit role ({levelText(roleSecurityLevel)})</option>
                      {SECURITY_LEVEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    value={legacyRuleFilter}
                    onChange={(e) => setLegacyRuleFilter(e.target.value)}
                    placeholder="Search legacy security rule..."
                  />
                  <div className="security-user-actions">
                    <button
                      type="button"
                      onClick={async () => {
                        setStatusError("");
                        setStatusNotice("");
                        try {
                          await apiFetch(`/users/${selectedUser.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              permissionOverrides,
                              securityLevel: securityLevelOverride,
                              legacySecurityOverrides
                            })
                          });
                          await load();
                          setStatusNotice("Security overrides saved.");
                        } catch (err) {
                          setStatusError(err instanceof Error ? err.message : "Unable to save security overrides.");
                        }
                      }}
                    >
                      Save User Security
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPermissionOverrides({});
                        setSecurityLevelOverride(null);
                        setLegacySecurityOverrides({});
                        setStatusNotice("Overrides cleared locally. Save to apply.");
                      }}
                    >
                      Clear Overrides
                    </button>
                  </div>
                </div>

                <div className="security-permissions">
                  <div className="security-permissions-header">
                    <span>Permission</span>
                    <span>Role Default</span>
                    <span>User Override</span>
                    <span>Effective</span>
                  </div>
                  {PERMISSION_OPTIONS.map((permission) => {
                    const roleAllowed = Boolean(rolePermissions[permission.key]);
                    const override = permissionOverrides[permission.key];
                    const effectiveAllowed = override ? override === "allow" : roleAllowed;
                    return (
                      <div key={permission.key} className="security-permission-row">
                        <div className="security-permission-name">
                          <strong>{permission.label}</strong>
                          <span>{permission.hint}</span>
                        </div>
                        <span className={`security-pill ${roleAllowed ? "on" : "off"}`}>
                          {roleAllowed ? "Allow" : "Deny"}
                        </span>
                        <select
                          value={override ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPermissionOverrides((prev) => {
                              const next = { ...prev };
                              if (value === "allow" || value === "deny") {
                                next[permission.key] = value;
                              } else {
                                delete next[permission.key];
                              }
                              return next;
                            });
                          }}
                        >
                          <option value="">Inherit role</option>
                          <option value="allow">Force Allow</option>
                          <option value="deny">Force Deny</option>
                        </select>
                        <span className={`security-pill ${effectiveAllowed ? "on" : "off"}`}>
                          {effectiveAllowed ? "Allow" : "Deny"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="legacy-rule-table legacy-user-table">
                  <div className="legacy-rule-header legacy-user-header">
                    <span>Rule</span>
                    <span>Role Default</span>
                    <span>User Min Level</span>
                    <span>User Enforced</span>
                    <span>Effective</span>
                  </div>
                  {filteredLegacyRules.map((rule) => {
                    const roleRule = roleLegacyResolved[rule.key] ?? {
                      minLevel: rule.defaultMinLevel,
                      enforced: rule.defaultEnforced
                    };
                    const userOverride = legacySecurityOverrides[rule.key];
                    const evaluatedRule = evaluatedLegacy[rule.key] ?? {
                      minLevel: roleRule.minLevel,
                      enforced: roleRule.enforced,
                      allowed: true
                    };
                    const permissionAccess = Boolean(
                      effectivePermissions.all || effectivePermissions[rule.permission]
                    );
                    const finalAllowed = permissionAccess && evaluatedRule.allowed;
                    return (
                      <div key={rule.key} className="legacy-rule-row legacy-user-row">
                        <div className="legacy-rule-name">
                          <strong>{rule.name}</strong>
                          <span>{rule.description}</span>
                        </div>
                        <div className="legacy-role-default">
                          <span className="security-pill on">L{roleRule.minLevel}</span>
                          <small>{roleRule.enforced ? "Enforced" : "Optional"}</small>
                        </div>
                        <select
                          value={typeof userOverride?.minLevel === "number" ? String(userOverride.minLevel) : "inherit"}
                          onChange={(e) => setLegacyMinLevelOverride(rule.key, e.target.value)}
                        >
                          <option value="inherit">Inherit (L{roleRule.minLevel})</option>
                          {SECURITY_LEVEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              Level {option.value}
                            </option>
                          ))}
                        </select>
                        <select
                          value={typeof userOverride?.enforced === "boolean" ? String(userOverride.enforced) : "inherit"}
                          onChange={(e) => setLegacyEnforcedOverride(rule.key, e.target.value)}
                        >
                          <option value="inherit">
                            Inherit ({roleRule.enforced ? "Enforced" : "Optional"})
                          </option>
                          <option value="true">Enforced</option>
                          <option value="false">Optional</option>
                        </select>
                        <div className="legacy-rule-effective">
                          <span className={`security-pill ${finalAllowed ? "on" : "off"}`}>
                            {finalAllowed ? "Allowed" : "Blocked"}
                          </span>
                          <small>
                            L{evaluatedRule.minLevel} / {evaluatedRule.enforced ? "Enforced" : "Optional"} /{" "}
                            {(permissionLabelByKey.get(rule.permission) ?? rule.permission) + " access "}
                            {permissionAccess ? "on" : "off"}
                          </small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {statusError && <p className="hint">{statusError}</p>}
            {statusNotice && <p className="hint">{statusNotice}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
