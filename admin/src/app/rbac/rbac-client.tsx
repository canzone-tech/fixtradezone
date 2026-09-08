"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";

interface Permission {
  id: string;
  code: string;
  description: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  permissions: Permission[];
}

interface RolesPayload {
  roles: Role[];
  message?: string;
}

interface PermissionsPayload {
  permissions: Permission[];
  message?: string;
}

interface UpdatePayload {
  message?: string;
  role?: Role;
}

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = payload.message;

    if (typeof message === "string") {
      return message;
    }

    if (Array.isArray(message) && typeof message[0] === "string") {
      return message[0];
    }
  }

  return fallback;
}

function permissionGroup(code: string): string {
  const [prefix] = code.split(/[._-]/);

  const names: Record<string, string> = {
    dashboard: "Dashboard",
    users: "Users",
    rbac: "Roles & Permissions",
    packages: "Packages",
    deposits: "Deposits",
    payouts: "Payouts",
    referrals: "Referrals",
    trades: "Trade Activity",
    simulation: "Simulated Activity",
    settings: "Settings",
    audit: "Audit",
    cms: "CMS / Templates",
  };

  return names[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export default function RbacClient() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);

  const [permissions, setPermissions] = useState<Permission[]>([]);

  const [selectedRoleName, setSelectedRoleName] = useState("ADMIN");

  const [draftPermissions, setDraftPermissions] = useState<Set<string>>(
    new Set(),
  );

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");

  const isSuperAdmin = currentUser?.roles.includes("SUPER_ADMIN") ?? false;

  const can = useCallback(
    (permission: string) =>
      isSuperAdmin || currentUser?.permissions.includes(permission) === true,
    [currentUser, isSuperAdmin],
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.name === selectedRoleName) ?? null,
    [roles, selectedRoleName],
  );

  const editable =
    selectedRole?.name === "ADMIN" && isSuperAdmin && can("rbac.manage");

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>();

    for (const permission of permissions) {
      const group = permissionGroup(permission.code);

      const existing = groups.get(group) ?? [];

      existing.push(permission);
      groups.set(group, existing);
    }

    return [...groups.entries()]
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => a.code.localeCompare(b.code)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [permissions]);

  const originalPermissionCodes = useMemo(
    () =>
      new Set(
        selectedRole?.permissions.map((permission) => permission.code) ?? [],
      ),
    [selectedRole],
  );

  const dirty = useMemo(() => {
    if (originalPermissionCodes.size !== draftPermissions.size) {
      return true;
    }

    for (const code of originalPermissionCodes) {
      if (!draftPermissions.has(code)) {
        return true;
      }
    }

    return false;
  }, [draftPermissions, originalPermissionCodes]);

  const syncDraft = useCallback((role: Role | null) => {
    setDraftPermissions(
      new Set(role?.permissions.map((permission) => permission.code) ?? []),
    );
  }, []);

  const loadWorkspace = useCallback(async () => {
    try {
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });

      if (sessionResponse.status === 401 || sessionResponse.status === 403) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const sessionPayload = await readPayload<{
        user?: AdminUser;
        message?: string;
      }>(sessionResponse);

      if (!sessionResponse.ok || !sessionPayload?.user) {
        throw new Error(
          getMessage(sessionPayload, "Unable to load administrator session."),
        );
      }

      setCurrentUser(sessionPayload.user);

      const [rolesResponse, permissionsResponse] = await Promise.all([
        fetch("/api/admin/rbac/roles", {
          cache: "no-store",
        }),
        fetch("/api/admin/rbac/permissions", {
          cache: "no-store",
        }),
      ]);

      if (rolesResponse.status === 401 || permissionsResponse.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const rolesPayload = await readPayload<RolesPayload>(rolesResponse);

      const permissionsPayload =
        await readPayload<PermissionsPayload>(permissionsResponse);

      if (
        !rolesResponse.ok ||
        !rolesPayload ||
        !Array.isArray(rolesPayload.roles)
      ) {
        throw new Error(
          getMessage(
            rolesPayload,
            rolesResponse.status === 403
              ? "You do not have rbac.read permission."
              : "Unable to load roles.",
          ),
        );
      }

      if (
        !permissionsResponse.ok ||
        !permissionsPayload ||
        !Array.isArray(permissionsPayload.permissions)
      ) {
        throw new Error(
          getMessage(
            permissionsPayload,
            permissionsResponse.status === 403
              ? "You do not have rbac.read permission."
              : "Unable to load permissions.",
          ),
        );
      }

      const nextRoles = rolesPayload.roles;

      setRoles(nextRoles);

      setPermissions(permissionsPayload.permissions);

      const preferredRole =
        nextRoles.find((role) => role.name === "ADMIN") ?? nextRoles[0] ?? null;

      if (preferredRole) {
        setSelectedRoleName(preferredRole.name);

        syncDraft(preferredRole);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load roles and permissions.",
      );
    } finally {
      setLoading(false);
    }
  }, [router, syncDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadWorkspace]);

  function selectRole(role: Role) {
    if (saving) {
      return;
    }

    if (dirty && !window.confirm("Discard unsaved permission changes?")) {
      return;
    }

    setError("");
    setNotice("");
    setSelectedRoleName(role.name);
    syncDraft(role);
  }

  function togglePermission(code: string) {
    if (!editable || saving) {
      return;
    }

    setNotice("");

    setDraftPermissions((current) => {
      const next = new Set(current);

      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }

      return next;
    });
  }

  function resetChanges() {
    syncDraft(selectedRole);
    setError("");
    setNotice("");
  }

  function selectAll() {
    if (!editable || saving) {
      return;
    }

    setDraftPermissions(
      new Set(permissions.map((permission) => permission.code)),
    );
  }

  function clearAll() {
    if (!editable || saving) {
      return;
    }

    setDraftPermissions(new Set());
  }

  async function savePermissions() {
    if (!selectedRole || !editable || !dirty || saving) {
      return;
    }

    if (
      !window.confirm(
        `Replace the ADMIN permission scope with ${draftPermissions.size} selected permissions?`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/rbac/roles/${encodeURIComponent(selectedRole.name)}/permissions`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            permissionCodes: [...draftPermissions].sort(),
          }),
        },
      );

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const payload = await readPayload<UpdatePayload>(response);

      if (!response.ok || !payload?.role) {
        throw new Error(
          getMessage(
            payload,
            response.status === 403
              ? "Only SUPER_ADMIN can modify the ADMIN permission scope."
              : "Unable to update role permissions.",
          ),
        );
      }

      setRoles((current) =>
        current.map((role) =>
          role.id === payload.role?.id ? payload.role : role,
        ),
      );

      syncDraft(payload.role);

      setNotice(payload.message ?? "Role permissions updated successfully.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update role permissions.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="ftz-rbac-loading">
        <div className="ftz-rbac-loading-mark">FT</div>
        <p>Loading roles & permissions…</p>
      </div>
    );
  }

  return (
    <div className="ftz-page ftz-rbac-page">
      <header className="ftz-rbac-header">
        <div>
          <span className="ftz-rbac-eyebrow">ACCESS CONTROL</span>

          <h1>Roles & Permissions</h1>

          <p>Review platform access and control the ADMIN permission scope.</p>
        </div>

        <div className="ftz-rbac-header-meta">
          <span className="ftz-rbac-identity">{currentUser?.email}</span>

          <span className="ftz-rbac-secure">
            <i className="iconoir-shield-check" />
            RBAC Protected
          </span>
        </div>
      </header>

      <div className="ftz-rbac-content">
        {error ? (
          <div className="ftz-rbac-alert is-error">
            <i className="iconoir-warning-triangle" />
            <span>{error}</span>
          </div>
        ) : null}

        {notice ? (
          <div className="ftz-rbac-alert is-success">
            <i className="iconoir-check-circle" />
            <span>{notice}</span>
          </div>
        ) : null}

        <section className="ftz-rbac-summary">
          <article className="ftz-rbac-stat">
            <div className="ftz-rbac-stat-icon">
              <i className="iconoir-group" />
            </div>

            <div>
              <span>Platform Roles</span>
              <strong>{roles.length}</strong>
            </div>
          </article>

          <article className="ftz-rbac-stat">
            <div className="ftz-rbac-stat-icon">
              <i className="iconoir-key" />
            </div>

            <div>
              <span>Permissions</span>
              <strong>{permissions.length}</strong>
            </div>
          </article>

          <article className="ftz-rbac-stat">
            <div className="ftz-rbac-stat-icon">
              <i className="iconoir-lock" />
            </div>

            <div>
              <span>Selected Scope</span>
              <strong>{draftPermissions.size}</strong>
            </div>
          </article>
        </section>

        <div className="ftz-rbac-workspace">
          <aside className="ftz-rbac-roles ftz-card">
            <div className="ftz-rbac-section-heading">
              <div>
                <span className="ftz-rbac-eyebrow">ROLES</span>
                <h2>Access levels</h2>
              </div>
            </div>

            <div className="ftz-rbac-role-list">
              {roles.map((role) => {
                const selected = selectedRoleName === role.name;

                const locked =
                  role.name === "SUPER_ADMIN" || role.name === "USER";

                return (
                  <button
                    key={role.id}
                    type="button"
                    className={`ftz-rbac-role ${selected ? "is-selected" : ""}`}
                    onClick={() => selectRole(role)}
                  >
                    <span className="ftz-rbac-role-icon">
                      <i
                        className={
                          role.name === "SUPER_ADMIN"
                            ? "iconoir-crown"
                            : role.name === "ADMIN"
                              ? "iconoir-shield"
                              : "iconoir-user"
                        }
                      />
                    </span>

                    <span className="ftz-rbac-role-copy">
                      <strong>{role.name}</strong>

                      <small>{role.description || "Platform role"}</small>

                      <em>
                        {role.name === "SUPER_ADMIN"
                          ? "All permissions (bypass)"
                          : `${role.permissions.length} permissions`}
                      </em>
                    </span>

                    {locked ? (
                      <i className="iconoir-lock ftz-rbac-role-lock" />
                    ) : (
                      <i className="iconoir-nav-arrow-right ftz-rbac-role-lock" />
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="ftz-rbac-permissions ftz-card">
            <div className="ftz-rbac-section-heading">
              <div>
                <span className="ftz-rbac-eyebrow">PERMISSION SCOPE</span>

                <h2>{selectedRole?.name ?? "Role"}</h2>

                <p>
                  {selectedRole?.description ??
                    "Select a role to review its permissions."}
                </p>
              </div>

              <div className="ftz-rbac-scope-badges">
                <span
                  className={`ftz-rbac-status ${
                    selectedRole?.status === "ACTIVE" ? "is-active" : ""
                  }`}
                >
                  {selectedRole?.status ?? "UNKNOWN"}
                </span>

                {editable ? (
                  <span className="ftz-rbac-editable">
                    <i className="iconoir-edit-pencil" />
                    Editable
                  </span>
                ) : (
                  <span className="ftz-rbac-readonly">
                    <i className="iconoir-lock" />
                    Protected
                  </span>
                )}
              </div>
            </div>

            {selectedRole?.name === "SUPER_ADMIN" ? (
              <div className="ftz-rbac-protection-note">
                <i className="iconoir-crown" />
                <div>
                  <strong>Founder authority is protected</strong>
                  <span>
                    SUPER_ADMIN permissions are implicit and cannot be modified.
                  </span>
                </div>
              </div>
            ) : null}

            {selectedRole?.name === "USER" ? (
              <div className="ftz-rbac-protection-note">
                <i className="iconoir-lock" />
                <div>
                  <strong>Base USER role is protected</strong>
                  <span>
                    Base user permissions are read-only in this operation.
                  </span>
                </div>
              </div>
            ) : null}

            {selectedRole?.name === "ADMIN" && !isSuperAdmin ? (
              <div className="ftz-rbac-protection-note">
                <i className="iconoir-shield" />
                <div>
                  <strong>Founder approval required</strong>
                  <span>
                    Only SUPER_ADMIN can modify the ADMIN permission scope.
                  </span>
                </div>
              </div>
            ) : null}

            <div className="ftz-rbac-toolbar">
              <div>
                <strong>{draftPermissions.size}</strong>
                <span> of {permissions.length} selected</span>
              </div>

              {editable ? (
                <div className="ftz-rbac-toolbar-actions">
                  <button
                    type="button"
                    className="ftz-rbac-button is-secondary"
                    onClick={selectAll}
                    disabled={saving}
                  >
                    Select all
                  </button>

                  <button
                    type="button"
                    className="ftz-rbac-button is-secondary"
                    onClick={clearAll}
                    disabled={saving}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>

            <div className="ftz-rbac-permission-groups">
              {groupedPermissions.map((group) => (
                <section className="ftz-rbac-permission-group" key={group.name}>
                  <div className="ftz-rbac-group-heading">
                    <h3>{group.name}</h3>

                    <span>
                      {
                        group.items.filter((permission) =>
                          draftPermissions.has(permission.code),
                        ).length
                      }
                      /{group.items.length}
                    </span>
                  </div>

                  <div className="ftz-rbac-permission-list">
                    {group.items.map((permission) => {
                      const checked = draftPermissions.has(permission.code);

                      return (
                        <label
                          className={`ftz-rbac-permission ${checked ? "is-checked" : ""} ${!editable ? "is-readonly" : ""}`}
                          key={permission.id}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!editable || saving}
                            onChange={() => togglePermission(permission.code)}
                          />

                          <span className="ftz-rbac-checkbox">
                            <i className="iconoir-check" />
                          </span>

                          <span className="ftz-rbac-permission-copy">
                            <strong>{permission.code}</strong>

                            <small>
                              {permission.description || "Platform permission"}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {editable ? (
              <footer className="ftz-rbac-savebar">
                <div>
                  {dirty ? (
                    <>
                      <strong>Unsaved changes</strong>
                      <span>
                        Review the ADMIN permission scope before saving.
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>Permission scope saved</strong>
                      <span>No pending changes.</span>
                    </>
                  )}
                </div>

                <div className="ftz-rbac-save-actions">
                  <button
                    type="button"
                    className="ftz-rbac-button is-secondary"
                    disabled={!dirty || saving}
                    onClick={resetChanges}
                  >
                    Reset
                  </button>

                  <button
                    type="button"
                    className="ftz-rbac-button is-primary"
                    disabled={!dirty || saving}
                    onClick={() => void savePermissions()}
                  >
                    {saving ? "Saving…" : "Save permissions"}
                  </button>
                </div>
              </footer>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
