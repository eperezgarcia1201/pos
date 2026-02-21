import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import {
  LEGACY_SECURITY_RULES,
  PERMISSION_OPTIONS,
  normalizeLegacySecurityOverrides,
  normalizePermissionMap,
  normalizeSecurityLevel,
  type LegacySecurityRuleOverrideMap
} from "../lib/securityCatalog";

type Role = {
  id: string;
  name: string;
  permissions?: Record<string, boolean>;
  securityLevel?: number;
  legacySecurityConfig?: LegacySecurityRuleOverrideMap;
};

type User = {
  id: string;
  username: string;
  displayName?: string;
  roleId: string;
  language?: "en" | "es";
  active?: boolean;
  hasPin?: boolean;
};

type UserForm = {
  displayName: string;
  username: string;
  password: string;
  pin: string;
  roleId: string;
  language: "en" | "es";
  active: boolean;
};

type EditUserForm = {
  username: string;
  displayName: string;
  password: string;
  pin: string;
  roleId: string;
  language: "en" | "es";
  active: boolean;
};

const permissionLabelByKey = new Map(PERMISSION_OPTIONS.map((option) => [option.key, option.label]));

const SECURITY_LEVEL_OPTIONS = [
  { value: 1, label: "1 - Lowest Access" },
  { value: 2, label: "2 - Basic Access" },
  { value: 3, label: "3 - Standard Access" },
  { value: 4, label: "4 - Elevated Access" },
  { value: 5, label: "5 - Highest Access" }
];

function levelText(levelValue: unknown) {
  const level = normalizeSecurityLevel(levelValue, 3);
  const matched = SECURITY_LEVEL_OPTIONS.find((option) => option.value === level);
  return matched?.label ?? `Level ${level}`;
}

function buildDefaultNewUser(roleId = ""): UserForm {
  return {
    displayName: "",
    username: "",
    password: "",
    pin: "",
    roleId,
    language: "en",
    active: true
  };
}

function buildDefaultEditUser(): EditUserForm {
  return {
    username: "",
    displayName: "",
    password: "",
    pin: "",
    roleId: "",
    language: "en",
    active: true
  };
}

export default function StaffManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newRole, setNewRole] = useState("");
  const [newUser, setNewUser] = useState<UserForm>(buildDefaultNewUser());
  const [selectedUserId, setSelectedUserId] = useState("");
  const [editUser, setEditUser] = useState<EditUserForm>(buildDefaultEditUser());

  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({});
  const [roleSecurityLevel, setRoleSecurityLevel] = useState(3);
  const [roleLegacyConfig, setRoleLegacyConfig] = useState<LegacySecurityRuleOverrideMap>({});
  const [legacyRuleFilter, setLegacyRuleFilter] = useState("");

  const [staffError, setStaffError] = useState("");
  const [staffNotice, setStaffNotice] = useState("");
  const [roleError, setRoleError] = useState("");
  const [roleNotice, setRoleNotice] = useState("");

  const load = async () => {
    const [roleListRaw, userListRaw] = await Promise.all([apiFetch("/roles"), apiFetch("/users")]);
    const roleList = Array.isArray(roleListRaw) ? (roleListRaw as Role[]) : [];
    const userList = Array.isArray(userListRaw) ? (userListRaw as User[]) : [];
    setRoles(roleList);
    setUsers(userList);
    setSelectedRoleId((current) => {
      if (current && roleList.some((role) => role.id === current)) return current;
      return roleList[0]?.id ?? "";
    });
    setSelectedUserId((current) => {
      if (current && userList.some((user) => user.id === current)) return current;
      return "";
    });
  };

  useEffect(() => {
    load().catch((err) => setRoleError(err instanceof Error ? err.message : "Unable to load staff settings."));
  }, []);

  useEffect(() => {
    if (roles.length === 0) return;
    setNewUser((prev) => (prev.roleId ? prev : { ...prev, roleId: roles[0].id }));
  }, [roles]);

  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedRoleId) ?? null, [roles, selectedRoleId]);
  const selectedUser = useMemo(() => users.find((user) => user.id === selectedUserId) ?? null, [users, selectedUserId]);

  useEffect(() => {
    if (!selectedRole) return;
    setRolePermissions(normalizePermissionMap(selectedRole.permissions));
    setRoleSecurityLevel(normalizeSecurityLevel(selectedRole.securityLevel, 3));
    setRoleLegacyConfig(normalizeLegacySecurityOverrides(selectedRole.legacySecurityConfig));
  }, [selectedRole]);

  useEffect(() => {
    if (!selectedUser) return;
    setEditUser({
      username: selectedUser.username,
      displayName: selectedUser.displayName || "",
      password: "",
      pin: "",
      roleId: selectedUser.roleId,
      language: selectedUser.language === "es" ? "es" : "en",
      active: selectedUser.active ?? true
    });
  }, [selectedUser]);

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

  const roleLegacyEvaluated = useMemo(() => {
    const next: Record<string, { minLevel: number; enforced: boolean; allowed: boolean }> = {};
    for (const rule of LEGACY_SECURITY_RULES) {
      const override = roleLegacyConfig[rule.key];
      const minLevel = override?.minLevel ?? rule.defaultMinLevel;
      const enforced = override?.enforced ?? rule.defaultEnforced;
      next[rule.key] = {
        minLevel,
        enforced,
        allowed: !enforced || roleSecurityLevel >= minLevel
      };
    }
    return next;
  }, [roleLegacyConfig, roleSecurityLevel]);

  const setRoleLegacyMinLevel = (ruleKey: string, value: string) => {
    setRoleLegacyConfig((prev) => {
      const next = { ...prev };
      const current = { ...(next[ruleKey] ?? {}) };
      if (value === "default") {
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

  const setRoleLegacyEnforced = (ruleKey: string, value: string) => {
    setRoleLegacyConfig((prev) => {
      const next = { ...prev };
      const current = { ...(next[ruleKey] ?? {}) };
      if (value === "default") {
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

  const deleteSelectedUser = async () => {
    if (!selectedUserId) {
      setStaffError("Select an employee to delete.");
      return;
    }
    setStaffError("");
    setStaffNotice("");
    const user = users.find((entry) => entry.id === selectedUserId);
    const userLabel = user?.displayName || user?.username || "this employee";
    const confirmed = window.confirm(`Delete ${userLabel}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await apiFetch(`/users/${selectedUserId}`, {
        method: "DELETE"
      });
      setEditUser(buildDefaultEditUser());
      setSelectedUserId("");
      await load();
      setStaffNotice("Employee deleted.");
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Unable to delete employee.");
    }
  };

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Staff & Roles</h2>
          <p>Manage users, role permissions, and legacy security access rules.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel">
          <h3>Roles</h3>
          <div className="form-row">
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="Role name..."
            />
            <button
              type="button"
              onClick={async () => {
                setRoleError("");
                setRoleNotice("");
                const name = newRole.trim();
                if (name.length < 2) {
                  setRoleError("Role name must be at least 2 characters.");
                  return;
                }
                if (roles.some((role) => role.name.toLowerCase() === name.toLowerCase())) {
                  setRoleError("Role already exists.");
                  return;
                }
                try {
                  await apiFetch("/roles", {
                    method: "POST",
                    body: JSON.stringify({ name })
                  });
                  setNewRole("");
                  await load();
                  setRoleNotice("Role created.");
                } catch (err) {
                  setRoleError(err instanceof Error ? err.message : "Unable to add role.");
                }
              }}
            >
              Add
            </button>
          </div>
          <div className="list role-list">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={selectedRoleId === role.id ? "active" : ""}
                onClick={() => setSelectedRoleId(role.id)}
              >
                <strong>{role.name}</strong>
                <span>{levelText(role.securityLevel)}</span>
              </button>
            ))}
          </div>
          {roleError && <p className="hint">{roleError}</p>}
          {roleNotice && <p className="hint">{roleNotice}</p>}
        </section>

        <section className="panel span-2">
          <h3>Role Permissions</h3>
          {!selectedRole && <p className="hint">Create or select a role to configure permissions.</p>}
          {selectedRole && (
            <>
              <div className="form-row">
                <label className="field">
                  <span>Role</span>
                  <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Minimum Security Level</span>
                  <select
                    value={roleSecurityLevel}
                    onChange={(e) => setRoleSecurityLevel(normalizeSecurityLevel(Number(e.target.value), 3))}
                  >
                    {SECURITY_LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedRoleId) return;
                    setRoleError("");
                    setRoleNotice("");
                    try {
                      await apiFetch(`/roles/${selectedRoleId}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          permissions: rolePermissions,
                          securityLevel: roleSecurityLevel,
                          legacySecurityConfig: roleLegacyConfig
                        })
                      });
                      await load();
                      setRoleNotice("Role permissions saved.");
                    } catch (err) {
                      setRoleError(err instanceof Error ? err.message : "Unable to save role permissions.");
                    }
                  }}
                >
                  Save Permissions
                </button>
              </div>

              <div className="role-permission-grid">
                {PERMISSION_OPTIONS.map((permission) => (
                  <label
                    key={permission.key}
                    className={`role-permission-item ${rolePermissions[permission.key] ? "active" : ""}`}
                  >
                    <div>
                      <strong>{permission.label}</strong>
                      <span>{permission.hint}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(rolePermissions[permission.key])}
                      onChange={(e) =>
                        setRolePermissions((prev) => ({ ...prev, [permission.key]: e.target.checked }))
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="form-row">
                <input
                  value={legacyRuleFilter}
                  onChange={(e) => setLegacyRuleFilter(e.target.value)}
                  placeholder="Search security rule..."
                />
              </div>

              <div className="legacy-rule-table">
                <div className="legacy-rule-header">
                  <span>Rule</span>
                  <span>Area</span>
                  <span>Min Level</span>
                  <span>Security Enforced</span>
                  <span>Effective</span>
                </div>
                {filteredLegacyRules.map((rule) => {
                  const override = roleLegacyConfig[rule.key];
                  const evaluated = roleLegacyEvaluated[rule.key] ?? {
                    minLevel: rule.defaultMinLevel,
                    enforced: rule.defaultEnforced,
                    allowed: true
                  };
                  return (
                    <div key={rule.key} className="legacy-rule-row">
                      <div className="legacy-rule-name">
                        <strong>{rule.name}</strong>
                        <span>{rule.description}</span>
                      </div>
                      <span className="legacy-rule-area">{permissionLabelByKey.get(rule.permission) ?? rule.permission}</span>
                      <select
                        value={typeof override?.minLevel === "number" ? String(override.minLevel) : "default"}
                        onChange={(e) => setRoleLegacyMinLevel(rule.key, e.target.value)}
                      >
                        <option value="default">Default ({rule.defaultMinLevel})</option>
                        {SECURITY_LEVEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            Level {option.value}
                          </option>
                        ))}
                      </select>
                      <select
                        value={typeof override?.enforced === "boolean" ? String(override.enforced) : "default"}
                        onChange={(e) => setRoleLegacyEnforced(rule.key, e.target.value)}
                      >
                        <option value="default">
                          Default ({rule.defaultEnforced ? "Enforced" : "Not Enforced"})
                        </option>
                        <option value="true">Enforced</option>
                        <option value="false">Not Enforced</option>
                      </select>
                      <div className="legacy-rule-effective">
                        <span className={`security-pill ${evaluated.allowed ? "on" : "off"}`}>
                          {evaluated.allowed ? "Allowed" : "Blocked"}
                        </span>
                        <small>
                          L{evaluated.minLevel} / {evaluated.enforced ? "Enforced" : "Optional"}
                        </small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {roleError && <p className="hint">{roleError}</p>}
          {roleNotice && <p className="hint">{roleNotice}</p>}
        </section>

        <section className="panel span-2 staff-users-friendly">
          <h3>Employees</h3>
          <p className="staff-users-help">Create employees, then select one from the list to edit below.</p>
          <div className="form-row staff-users-form">
            <input
              className="staff-users-field staff-users-display"
              value={newUser.displayName}
              onChange={(e) => setNewUser((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="Display name"
            />
            <input
              className="staff-users-field staff-users-username"
              value={newUser.username}
              onChange={(e) => setNewUser((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="Username"
            />
            <input
              className="staff-users-field staff-users-password"
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Password"
            />
            <input
              className="staff-users-field staff-users-pin"
              value={newUser.pin}
              onChange={(e) => setNewUser((prev) => ({ ...prev, pin: e.target.value }))}
              placeholder="Access code (PIN)"
            />
            <select
              className="staff-users-select staff-users-role"
              value={newUser.roleId}
              onChange={(e) => setNewUser((prev) => ({ ...prev, roleId: e.target.value }))}
            >
              <option value="">Role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <div className="role-picker staff-users-role-picker">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  className={newUser.roleId === role.id ? "active" : ""}
                  onClick={() => setNewUser((prev) => ({ ...prev, roleId: role.id }))}
                >
                  {role.name}
                </button>
              ))}
            </div>
            <select
              className="staff-users-select staff-users-language"
              value={newUser.language}
              onChange={(e) => setNewUser((prev) => ({ ...prev, language: e.target.value === "es" ? "es" : "en" }))}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
            </select>
            <select
              className="staff-users-select staff-users-active"
              value={newUser.active ? "yes" : "no"}
              onChange={(e) => setNewUser((prev) => ({ ...prev, active: e.target.value === "yes" }))}
            >
              <option value="yes">Active</option>
              <option value="no">Inactive</option>
            </select>
            <button
              type="button"
              className="staff-users-add-btn"
                onClick={async () => {
                  setStaffError("");
                  setStaffNotice("");
                  if (!newUser.username || newUser.username.length < 3) {
                    setStaffError("Username must be at least 3 characters.");
                    return;
                }
                if (!newUser.password || newUser.password.length < 6) {
                  setStaffError("Password must be at least 6 characters.");
                  return;
                }
                if (!newUser.roleId) {
                  setStaffError("Select a role.");
                  return;
                }
                if (newUser.pin && !/^\d{4,10}$/.test(newUser.pin)) {
                  setStaffError("Access code must be 4-10 digits.");
                  return;
                }
                try {
                  await apiFetch("/users", {
                    method: "POST",
                    body: JSON.stringify({
                      username: newUser.username,
                      password: newUser.password,
                      pin: newUser.pin || undefined,
                      roleId: newUser.roleId,
                      displayName: newUser.displayName || undefined,
                      language: newUser.language,
                      active: newUser.active
                    })
                  });
                  setNewUser(buildDefaultNewUser(roles[0]?.id ?? ""));
                  await load();
                  setStaffNotice("Employee added.");
                } catch (err) {
                  setStaffError(err instanceof Error ? err.message : "Unable to add employee.");
                }
              }}
            >
              Add
            </button>
          </div>
          {staffError && <p className="hint">{staffError}</p>}
          {staffNotice && <p className="hint">{staffNotice}</p>}
          <div className="staff-users-workspace">
            <div className="table-list staff-users-table">
              <div className="table-header staff-users-grid staff-users-table-header">
                <span>User</span>
                <span>Display</span>
                <span>Role</span>
                <span>Language</span>
                <span>PIN</span>
              </div>
              {users.length === 0 ? <div className="staff-users-empty">No employees found.</div> : null}
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={`table-row button-row staff-users-grid staff-users-table-row ${selectedUserId === user.id ? "active" : ""}`}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <span>{user.username}</span>
                  <span>{user.displayName ?? "-"}</span>
                  <span>{roles.find((role) => role.id === user.roleId)?.name ?? "-"}</span>
                  <span>{user.language === "es" ? "Spanish" : "English"}</span>
                  <span>{user.hasPin ? "Set" : "Missing"}</span>
                </button>
              ))}
            </div>

            <aside className="staff-users-side-panel">
              <p className="staff-users-side-label">Selected Employee</p>
              <strong className="staff-users-side-name">
                {selectedUser ? selectedUser.displayName || selectedUser.username : "No employee selected"}
              </strong>
              <span className="staff-users-side-meta">
                {selectedUser ? `${selectedUser.username} • ${selectedUser.language === "es" ? "Spanish" : "English"}` : "Tap a row in the list"}
              </span>
              <button
                type="button"
                className="staff-users-edit-btn"
                disabled={!selectedUserId}
                onClick={() => {
                  document.getElementById("staff-edit-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Edit Selected
              </button>
              <button
                type="button"
                className="staff-users-delete-btn"
                disabled={!selectedUserId}
                onClick={() => void deleteSelectedUser()}
              >
                Delete Selected
              </button>
            </aside>
          </div>
          <div id="staff-edit-panel" className="staff-edit-card">
            <div className="staff-edit-card-head">
              <h4>Edit Employee</h4>
              <span className="staff-edit-card-subtitle">
                {selectedUser ? `Selected: ${selectedUser.username}` : "Select an employee from the list"}
              </span>
            </div>
            {!selectedUserId && <p className="hint">Select an employee to edit details.</p>}
            {selectedUserId && (
              <>
                <div className="staff-edit-grid">
                  <input
                    value={editUser.username}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, username: e.target.value }))}
                    placeholder="Username"
                  />
                  <input
                    value={editUser.displayName}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Display name"
                  />
                  <input
                    type="password"
                    value={editUser.password}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="New password"
                  />
                  <input
                    value={editUser.pin}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, pin: e.target.value }))}
                    placeholder="New access code"
                  />
                </div>

                <div className="staff-edit-role-row">
                  <select
                    className="staff-edit-select"
                    value={editUser.roleId}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, roleId: e.target.value }))}
                  >
                    <option value="">Role</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <div className="role-picker staff-edit-role-picker">
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        className={editUser.roleId === role.id ? "active" : ""}
                        onClick={() => setEditUser((prev) => ({ ...prev, roleId: role.id }))}
                      >
                        {role.name}
                      </button>
                    ))}
                  </div>
                  <select
                    className="staff-edit-select"
                    value={editUser.language}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, language: e.target.value === "es" ? "es" : "en" }))}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                  </select>
                  <select
                    className="staff-edit-select"
                    value={editUser.active ? "yes" : "no"}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, active: e.target.value === "yes" }))}
                  >
                    <option value="yes">Active</option>
                    <option value="no">Inactive</option>
                  </select>
                </div>

                <div className="staff-edit-actions">
                  <button
                    type="button"
                    className="staff-edit-save-btn"
                    onClick={async () => {
                      setStaffError("");
                      setStaffNotice("");
                      if (!editUser.username || editUser.username.trim().length < 3) {
                        setStaffError("Username must be at least 3 characters.");
                        return;
                      }
                      if (editUser.pin && !/^\d{4,10}$/.test(editUser.pin)) {
                        setStaffError("Access code must be 4-10 digits.");
                        return;
                      }
                      try {
                        await apiFetch(`/users/${selectedUserId}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            username: editUser.username.trim(),
                            displayName: editUser.displayName || undefined,
                            password: editUser.password || undefined,
                            pin: editUser.pin || undefined,
                            roleId: editUser.roleId || undefined,
                            language: editUser.language,
                            active: editUser.active
                          })
                        });
                        setEditUser(buildDefaultEditUser());
                        setSelectedUserId("");
                        await load();
                        setStaffNotice("Employee updated.");
                      } catch (err) {
                        setStaffError(err instanceof Error ? err.message : "Unable to update employee.");
                      }
                    }}
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    className="staff-users-delete-btn"
                    onClick={() => void deleteSelectedUser()}
                  >
                    Delete Employee
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
