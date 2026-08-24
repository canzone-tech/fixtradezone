"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import type { AdminUser } from "@/lib/auth";
import styles from "./users.module.css";

type UserStatus = AdminUser["status"];

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UsersPayload {
  users: AdminUser[];
  pagination: Pagination;
}

interface MutationPayload {
  message?: string;
  user?: AdminUser;
}

type CreationMode = "AUTO" | "MANUAL" | "AUTO_OR_MANUAL";

interface RegistrationPolicy {
  emailRequired: boolean;
  mobileRequired: boolean;
  passwordMode: CreationMode;
  usernameMode: CreationMode;
  usernamePrefixEnabled: boolean;
  usernamePrefix: string | null;
}

interface CreateMutationPayload extends MutationPayload {
  temporaryPassword?: string;
  mustChangePassword?: boolean;
}

interface CreatedCredentials {
  username: string;
  temporaryPassword: string;
}

interface ImpersonationMutationPayload {
  message?: string;
  impersonation?: {
    subject?: AdminUser;
  };
}

interface CreateUserForm {
  email: string;
  password: string;
  username: string;
  phone: string;
  firstName: string;
  lastName: string;
}

const emptyCreateForm: CreateUserForm = {
  email: "",
  password: "",
  username: "",
  phone: "",
  firstName: "",
  lastName: "",
};

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

export default function UsersClient() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

  const [usersPayload, setUsersPayload] = useState<UsersPayload | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");

  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [workingUserId, setWorkingUserId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);

  const [registrationPolicy, setRegistrationPolicy] =
    useState<RegistrationPolicy | null>(null);

  const [createdCredentials, setCreatedCredentials] =
    useState<CreatedCredentials | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [createForm, setCreateForm] = useState<CreateUserForm>(emptyCreateForm);

  const isSuperAdmin = currentUser?.roles.includes("SUPER_ADMIN") ?? false;

  const can = useCallback(
    (permission: string) =>
      isSuperAdmin || currentUser?.permissions.includes(permission) === true,
    [currentUser, isSuperAdmin],
  );

  const loadUsers = useCallback(
    async (page = 1, searchValue = search, statusValue = status) => {
      setLoadingUsers(true);
      setError("");

      try {
        const params = new URLSearchParams();

        params.set("page", String(page));
        params.set("limit", "20");

        const normalizedSearch = searchValue.trim();

        if (normalizedSearch) {
          params.set("search", normalizedSearch);
        }

        if (statusValue) {
          params.set("status", statusValue);
        }

        const response = await fetch(`/api/admin/users?${params.toString()}`, {
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const payload = await readPayload<
          UsersPayload & {
            message?: string;
          }
        >(response);

        if (!response.ok || !payload || !Array.isArray(payload.users)) {
          throw new Error(
            getMessage(
              payload,
              response.status === 403
                ? "You do not have users.read permission."
                : "Unable to load users.",
            ),
          );
        }

        setUsersPayload(payload);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Unable to load users.",
        );
      } finally {
        setLoadingUsers(false);
      }
    },
    [router, search, status],
  );

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });

        if (response.status === 401 || response.status === 403) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const payload = await readPayload<{
          user?: AdminUser;
          message?: string;
        }>(response);

        if (!response.ok || !payload?.user) {
          throw new Error(
            getMessage(payload, "Unable to load administrator session."),
          );
        }

        if (mounted) {
          setCurrentUser(payload.user);
        }

        await loadUsers(1, "", "");
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load users workspace.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      mounted = false;
    };
  }, [loadUsers, router]);

  useEffect(() => {
    let mounted = true;

    void fetch("/api/auth/registration-policy", {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await readPayload<
          RegistrationPolicy & {
            message?: string;
          }
        >(response);

        if (!response.ok || !payload) {
          throw new Error(
            getMessage(payload, "Unable to load registration policy."),
          );
        }

        if (mounted) {
          setRegistrationPolicy(payload);
        }
      })
      .catch((caught: unknown) => {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load registration policy.",
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const accountCount = useMemo(
    () => usersPayload?.pagination.total ?? 0,
    [usersPayload],
  );

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setNotice("");
    await loadUsers(1);
  }

  async function clearFilters() {
    setSearch("");
    setStatus("");
    setNotice("");

    await loadUsers(1, "", "");
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const policy = registrationPolicy;

    if (!policy) {
      setError("Registration policy is unavailable.");
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");
    setCreatedCredentials(null);

    if (policy.passwordMode === "MANUAL" && createForm.password.length < 12) {
      setCreating(false);
      setError("Password must contain at least 12 characters.");
      return;
    }

    if (policy.usernameMode === "MANUAL" && !createForm.username.trim()) {
      setCreating(false);
      setError("Username is required by the current registration policy.");
      return;
    }

    if (policy.emailRequired && !createForm.email.trim()) {
      setCreating(false);
      setError("Email is required by the current registration policy.");
      return;
    }

    if (policy.mobileRequired && !createForm.phone.trim()) {
      setCreating(false);
      setError("Mobile is required by the current registration policy.");
      return;
    }

    const body: Record<string, string> = {};

    const email = createForm.email.trim();
    const phone = createForm.phone.trim();
    const username = createForm.username.trim().toLowerCase();
    const firstName = createForm.firstName.trim();
    const lastName = createForm.lastName.trim();

    if (email) {
      body.email = email;
    }

    if (phone) {
      body.phone = phone;
    }

    if (policy.usernameMode !== "AUTO" && username) {
      body.username = username;
    }

    if (policy.passwordMode !== "AUTO" && createForm.password) {
      body.password = createForm.password;
    }

    if (firstName) {
      body.firstName = firstName;
    }

    if (lastName) {
      body.lastName = lastName;
    }

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      const payload = await readPayload<CreateMutationPayload>(response);

      if (!response.ok) {
        throw new Error(getMessage(payload, "Unable to create user."));
      }

      if (payload?.user && typeof payload.temporaryPassword === "string") {
        setCreatedCredentials({
          username: payload.user.username ?? username ?? "Generated username",
          temporaryPassword: payload.temporaryPassword,
        });
      }

      setCreateForm(emptyCreateForm);

      setNotice(payload?.message ?? "User created successfully.");

      await loadUsers(1, "", "");
      setSearch("");
      setStatus("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to create user.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(
    user: AdminUser,
    nextStatus: "ACTIVE" | "SUSPENDED" | "BLOCKED",
  ) {
    if (
      !window.confirm(
        `Change ${user.email} status from ${user.status} to ${nextStatus}?`,
      )
    ) {
      return;
    }

    setWorkingUserId(user.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      const payload = await readPayload<MutationPayload>(response);

      if (!response.ok) {
        throw new Error(getMessage(payload, "Unable to update user status."));
      }

      setNotice(payload?.message ?? "User status updated.");

      await loadUsers(usersPayload?.pagination.page ?? 1);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update user status.",
      );
    } finally {
      setWorkingUserId(null);
    }
  }

  async function toggleAdminRole(user: AdminUser) {
    const hasAdmin = user.roles.includes("ADMIN");

    const desiredRoles = user.roles.filter(
      (role) => role !== "USER" && role !== "SUPER_ADMIN" && role !== "ADMIN",
    );

    if (!hasAdmin) {
      desiredRoles.push("ADMIN");
    }

    if (
      !window.confirm(
        hasAdmin
          ? `Remove ADMIN role from ${user.email}?`
          : `Assign ADMIN role to ${user.email}?`,
      )
    ) {
      return;
    }

    setWorkingUserId(user.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}/roles`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roleNames: desiredRoles,
          }),
        },
      );

      const payload = await readPayload<MutationPayload>(response);

      if (!response.ok) {
        throw new Error(getMessage(payload, "Unable to update user roles."));
      }

      setNotice(payload?.message ?? "User roles updated.");

      await loadUsers(usersPayload?.pagination.page ?? 1);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update user roles.",
      );
    } finally {
      setWorkingUserId(null);
    }
  }

  async function startImpersonation(user: AdminUser) {
    if (
      !window.confirm(
        `Login as ${user.email}? This audited support session will use the user's live account identity.`,
      )
    ) {
      return;
    }

    setWorkingUserId(user.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}/impersonation`,
        {
          method: "POST",
        },
      );

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const payload = await readPayload<ImpersonationMutationPayload>(response);

      if (!response.ok) {
        throw new Error(
          getMessage(payload, "Unable to start user impersonation."),
        );
      }

      if (payload?.impersonation?.subject?.id !== user.id) {
        throw new Error("Impersonation service returned an invalid user.");
      }

      router.push("/user/impersonation");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to start user impersonation.",
      );
    } finally {
      setWorkingUserId(null);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingMark}>FT</div>
        <p>Loading users workspace…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <span className={styles.eyebrow}>USER OPERATIONS</span>
          <h1>Users</h1>
          <p>Search, provision and manage platform accounts.</p>
        </div>

        <div className={styles.topbarActions}>
          <span className={styles.identity}>{currentUser?.email}</span>

          <Link className={styles.backLink} href="/dashboard">
            ← Overview
          </Link>
        </div>
      </header>

      <FlashMessage message={error} type="error" onClose={() => setError("")} />

      {!error ? (
        <FlashMessage
          message={notice}
          type="success"
          autoDismissMs={4500}
          onClose={() => setNotice("")}
        />
      ) : null}

      <div className={styles.content}>
        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <div>
              <span className={styles.eyebrow}>DIRECTORY</span>
              <h2>Platform users</h2>
            </div>

            <strong>
              {accountCount} {accountCount === 1 ? "account" : "accounts"}
            </strong>
          </div>

          <form className={styles.filters} onSubmit={submitSearch}>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email, username, phone or name"
              maxLength={100}
            />

            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as UserStatus | "")
              }
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PENDING">PENDING</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>

            <button type="submit" disabled={loadingUsers}>
              {loadingUsers ? "Loading…" : "Search"}
            </button>

            <button
              className={styles.secondaryButton}
              type="button"
              disabled={loadingUsers}
              onClick={() => void clearFilters()}
            >
              Clear
            </button>
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Created</th>
                  <th>Controls</th>
                </tr>
              </thead>

              <tbody>
                {usersPayload?.users.length ? (
                  usersPayload.users.map((user) => {
                    const founder = user.roles.includes("SUPER_ADMIN");

                    const self = currentUser?.id === user.id;

                    const protectedUser = founder || self;

                    const busy = workingUserId === user.id;

                    const canImpersonateUser =
                      can("users.impersonate") &&
                      user.status === "ACTIVE" &&
                      user.roles.includes("USER") &&
                      !user.roles.includes("ADMIN") &&
                      !founder &&
                      !self;

                    return (
                      <tr key={user.id}>
                        <td>
                          <div className={styles.userIdentity}>
                            <strong>{user.email}</strong>

                            <small>
                              {user.username
                                ? `@${user.username}`
                                : "No username"}
                            </small>

                            {(user.firstName || user.lastName) && (
                              <small>
                                {[user.firstName, user.lastName]
                                  .filter(Boolean)
                                  .join(" ")}
                              </small>
                            )}
                          </div>
                        </td>

                        <td>
                          <span
                            className={`${styles.status} ${
                              styles[
                                `status${user.status}` as keyof typeof styles
                              ]
                            }`}
                          >
                            {user.status}
                          </span>
                        </td>

                        <td>
                          <div className={styles.roleTags}>
                            {user.roles.map((role) => (
                              <span key={role}>{role}</span>
                            ))}
                          </div>
                        </td>

                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>

                        <td>
                          {protectedUser ? (
                            <small className={styles.protectedText}>
                              {founder
                                ? "Founder protected"
                                : "Self-management blocked"}
                            </small>
                          ) : (
                            <div className={styles.actions}>
                              {canImpersonateUser ? (
                                <button
                                  type="button"
                                  className={styles.impersonateButton}
                                  disabled={busy}
                                  onClick={() => void startImpersonation(user)}
                                >
                                  {busy ? "Opening…" : "Login as User"}
                                </button>
                              ) : null}

                              {can("users.status.manage") ? (
                                <>
                                  {user.status !== "ACTIVE" ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void updateStatus(user, "ACTIVE")
                                      }
                                    >
                                      Activate
                                    </button>
                                  ) : null}

                                  {user.status !== "SUSPENDED" ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void updateStatus(user, "SUSPENDED")
                                      }
                                    >
                                      Suspend
                                    </button>
                                  ) : null}

                                  {user.status !== "BLOCKED" ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void updateStatus(user, "BLOCKED")
                                      }
                                    >
                                      Block
                                    </button>
                                  ) : null}
                                </>
                              ) : null}

                              {can("users.roles.manage") ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void toggleAdminRole(user)}
                                >
                                  {user.roles.includes("ADMIN")
                                    ? "Remove ADMIN"
                                    : "Make ADMIN"}
                                </button>
                              ) : null}

                              {!can("users.status.manage") &&
                              !can("users.roles.manage") &&
                              !canImpersonateUser ? (
                                <small className={styles.protectedText}>
                                  Read only
                                </small>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className={styles.emptyState}>
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {usersPayload && usersPayload.pagination.totalPages > 1 ? (
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={loadingUsers || usersPayload.pagination.page <= 1}
                onClick={() => void loadUsers(usersPayload.pagination.page - 1)}
              >
                Previous
              </button>

              <span>
                Page {usersPayload.pagination.page} of{" "}
                {usersPayload.pagination.totalPages}
              </span>

              <button
                type="button"
                disabled={
                  loadingUsers ||
                  usersPayload.pagination.page >=
                    usersPayload.pagination.totalPages
                }
                onClick={() => void loadUsers(usersPayload.pagination.page + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>

        {can("users.create") ? (
          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div>
                <span className={styles.eyebrow}>CREATE ACCOUNT</span>
                <h2>Add platform user</h2>
              </div>

              <small>New users start PENDING + USER.</small>
            </div>

            {createdCredentials ? (
              <div className={styles.credentialNotice}>
                <div>
                  <strong>Temporary credentials — shown once</strong>

                  <span>
                    Username: <b>{createdCredentials.username}</b>
                  </span>

                  <code>{createdCredentials.temporaryPassword}</code>

                  <p>
                    Copy this password before leaving or refreshing this page.
                    The user must replace it after first login.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      createdCredentials.temporaryPassword,
                    )
                  }
                >
                  Copy password
                </button>
              </div>
            ) : null}

            {registrationPolicy ? (
              <>
                <div className={styles.createPolicy}>
                  <span>
                    Password: <b>{registrationPolicy.passwordMode}</b>
                  </span>

                  <span>
                    Username: <b>{registrationPolicy.usernameMode}</b>
                  </span>

                  <span>
                    Email:{" "}
                    <b>
                      {registrationPolicy.emailRequired
                        ? "REQUIRED"
                        : "OPTIONAL"}
                    </b>
                  </span>

                  <span>
                    Mobile:{" "}
                    <b>
                      {registrationPolicy.mobileRequired
                        ? "REQUIRED"
                        : "OPTIONAL"}
                    </b>
                  </span>
                </div>

                <form className={styles.createGrid} onSubmit={createUser}>
                  <label>
                    Email
                    {registrationPolicy.emailRequired ? " *" : ""}
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(event) =>
                        setCreateForm({
                          ...createForm,
                          email: event.target.value,
                        })
                      }
                      required={registrationPolicy.emailRequired}
                      maxLength={191}
                      autoComplete="off"
                    />
                  </label>

                  <label>
                    Phone
                    {registrationPolicy.mobileRequired ? " *" : ""}
                    <input
                      value={createForm.phone}
                      onChange={(event) =>
                        setCreateForm({
                          ...createForm,
                          phone: event.target.value,
                        })
                      }
                      required={registrationPolicy.mobileRequired}
                      placeholder="+919876543210"
                      pattern="\+[1-9][0-9]{7,14}"
                      autoComplete="off"
                    />
                  </label>

                  {registrationPolicy.usernameMode !== "AUTO" ? (
                    <label>
                      Username
                      {registrationPolicy.usernameMode === "MANUAL" ? " *" : ""}
                      <input
                        value={createForm.username}
                        onChange={(event) =>
                          setCreateForm({
                            ...createForm,
                            username: event.target.value.toLowerCase(),
                          })
                        }
                        required={registrationPolicy.usernameMode === "MANUAL"}
                        minLength={3}
                        maxLength={30}
                        pattern="[a-z0-9._-]+"
                        autoComplete="off"
                      />
                    </label>
                  ) : (
                    <div className={styles.autoPolicy}>
                      <strong>Username generated automatically</strong>

                      <span>
                        {registrationPolicy.usernamePrefixEnabled &&
                        registrationPolicy.usernamePrefix
                          ? `Prefix: ${registrationPolicy.usernamePrefix}`
                          : "Platform sequence will allocate the username."}
                      </span>
                    </div>
                  )}

                  {registrationPolicy.passwordMode !== "AUTO" ? (
                    <label>
                      Password
                      {registrationPolicy.passwordMode === "MANUAL" ? " *" : ""}
                      <input
                        type="password"
                        value={createForm.password}
                        onChange={(event) =>
                          setCreateForm({
                            ...createForm,
                            password: event.target.value,
                          })
                        }
                        required={registrationPolicy.passwordMode === "MANUAL"}
                        minLength={
                          registrationPolicy.passwordMode === "MANUAL"
                            ? 12
                            : undefined
                        }
                        maxLength={128}
                        autoComplete="new-password"
                        placeholder={
                          registrationPolicy.passwordMode === "AUTO_OR_MANUAL"
                            ? "Blank = generate temporary password"
                            : ""
                        }
                      />
                    </label>
                  ) : (
                    <div className={styles.autoPolicy}>
                      <strong>
                        Temporary password generated automatically
                      </strong>

                      <span>
                        It will be displayed exactly once after successful
                        creation.
                      </span>
                    </div>
                  )}

                  <label>
                    First name
                    <input
                      value={createForm.firstName}
                      onChange={(event) =>
                        setCreateForm({
                          ...createForm,
                          firstName: event.target.value,
                        })
                      }
                      maxLength={100}
                      autoComplete="off"
                    />
                  </label>

                  <label>
                    Last name
                    <input
                      value={createForm.lastName}
                      onChange={(event) =>
                        setCreateForm({
                          ...createForm,
                          lastName: event.target.value,
                        })
                      }
                      maxLength={100}
                      autoComplete="off"
                    />
                  </label>

                  <div className={styles.createActions}>
                    <button type="submit" disabled={creating}>
                      {creating ? "Creating…" : "Create user"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className={styles.createPolicy}>
                Loading registration policy…
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
