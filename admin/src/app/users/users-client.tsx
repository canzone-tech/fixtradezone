"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
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

async function readPayload<T>(
  response: Response,
): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getMessage(
  payload: unknown,
  fallback: string,
): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload
  ) {
    const message = payload.message;

    if (typeof message === "string") {
      return message;
    }

    if (
      Array.isArray(message) &&
      typeof message[0] === "string"
    ) {
      return message[0];
    }
  }

  return fallback;
}

export default function UsersClient() {
  const router = useRouter();

  const [currentUser, setCurrentUser] =
    useState<AdminUser | null>(null);

  const [usersPayload, setUsersPayload] =
    useState<UsersPayload | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] =
    useState<UserStatus | "">("");

  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] =
    useState(false);

  const [workingUserId, setWorkingUserId] =
    useState<string | null>(null);

  const [creating, setCreating] =
    useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [createForm, setCreateForm] =
    useState<CreateUserForm>(emptyCreateForm);

  const isSuperAdmin =
    currentUser?.roles.includes("SUPER_ADMIN") ??
    false;

  const can = useCallback(
    (permission: string) =>
      isSuperAdmin ||
      currentUser?.permissions.includes(permission) ===
        true,
    [currentUser, isSuperAdmin],
  );

  const loadUsers = useCallback(
    async (
      page = 1,
      searchValue = search,
      statusValue = status,
    ) => {
      setLoadingUsers(true);
      setError("");

      try {
        const params = new URLSearchParams();

        params.set("page", String(page));
        params.set("limit", "20");

        const normalizedSearch =
          searchValue.trim();

        if (normalizedSearch) {
          params.set(
            "search",
            normalizedSearch,
          );
        }

        if (statusValue) {
          params.set(
            "status",
            statusValue,
          );
        }

        const response = await fetch(
          `/api/admin/users?${params.toString()}`,
          {
            cache: "no-store",
          },
        );

        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const payload =
          await readPayload<UsersPayload & {
            message?: string;
          }>(response);

        if (
          !response.ok ||
          !payload ||
          !Array.isArray(payload.users)
        ) {
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
          caught instanceof Error
            ? caught.message
            : "Unable to load users.",
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
        const response = await fetch(
          "/api/auth/session",
          {
            cache: "no-store",
          },
        );

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const payload =
          await readPayload<{
            user?: AdminUser;
            message?: string;
          }>(response);

        if (
          !response.ok ||
          !payload?.user
        ) {
          throw new Error(
            getMessage(
              payload,
              "Unable to load administrator session.",
            ),
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

  const accountCount = useMemo(
    () => usersPayload?.pagination.total ?? 0,
    [usersPayload],
  );

  async function submitSearch(
    event: FormEvent<HTMLFormElement>,
  ) {
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

  async function createUser(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setCreating(true);
    setError("");
    setNotice("");

    const body: Record<string, string> = {
      email: createForm.email.trim(),
      password: createForm.password,
    };

    const optionalFields: Array<
      keyof Omit<
        CreateUserForm,
        "email" | "password"
      >
    > = [
      "username",
      "phone",
      "firstName",
      "lastName",
    ];

    for (const field of optionalFields) {
      const value =
        createForm[field].trim();

      if (value) {
        body[field] = value;
      }
    }

    try {
      const response = await fetch(
        "/api/admin/users",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      const payload =
        await readPayload<MutationPayload>(
          response,
        );

      if (!response.ok) {
        throw new Error(
          getMessage(
            payload,
            "Unable to create user.",
          ),
        );
      }

      setCreateForm(emptyCreateForm);

      setNotice(
        payload?.message ??
          "User created successfully.",
      );

      await loadUsers(1, "", "");
      setSearch("");
      setStatus("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create user.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(
    user: AdminUser,
    nextStatus:
      | "ACTIVE"
      | "SUSPENDED"
      | "BLOCKED",
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
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      const payload =
        await readPayload<MutationPayload>(
          response,
        );

      if (!response.ok) {
        throw new Error(
          getMessage(
            payload,
            "Unable to update user status.",
          ),
        );
      }

      setNotice(
        payload?.message ??
          "User status updated.",
      );

      await loadUsers(
        usersPayload?.pagination.page ?? 1,
      );
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

  async function toggleAdminRole(
    user: AdminUser,
  ) {
    const hasAdmin =
      user.roles.includes("ADMIN");

    const desiredRoles = user.roles
      .filter(
        (role) =>
          role !== "USER" &&
          role !== "SUPER_ADMIN" &&
          role !== "ADMIN",
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
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            roleNames: desiredRoles,
          }),
        },
      );

      const payload =
        await readPayload<MutationPayload>(
          response,
        );

      if (!response.ok) {
        throw new Error(
          getMessage(
            payload,
            "Unable to update user roles.",
          ),
        );
      }

      setNotice(
        payload?.message ??
          "User roles updated.",
      );

      await loadUsers(
        usersPayload?.pagination.page ?? 1,
      );
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

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingMark}>
          FT
        </div>
        <p>Loading users workspace…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <span className={styles.eyebrow}>
            USER OPERATIONS
          </span>
          <h1>Users</h1>
          <p>
            Search, provision and manage platform
            accounts.
          </p>
        </div>

        <div className={styles.topbarActions}>
          <span className={styles.identity}>
            {currentUser?.email}
          </span>

          <Link
            className={styles.backLink}
            href="/dashboard"
          >
            ← Overview
          </Link>
        </div>
      </header>

      <div className={styles.content}>
        {error ? (
          <div
            className={`${styles.alert} ${styles.alertError}`}
          >
            {error}
          </div>
        ) : null}

        {notice ? (
          <div
            className={`${styles.alert} ${styles.alertSuccess}`}
          >
            {notice}
          </div>
        ) : null}

        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <div>
              <span className={styles.eyebrow}>
                DIRECTORY
              </span>
              <h2>Platform users</h2>
            </div>

            <strong>
              {accountCount}{" "}
              {accountCount === 1
                ? "account"
                : "accounts"}
            </strong>
          </div>

          <form
            className={styles.filters}
            onSubmit={submitSearch}
          >
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search email, username, phone or name"
              maxLength={100}
            />

            <select
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target
                    .value as UserStatus | "",
                )
              }
            >
              <option value="">
                All statuses
              </option>
              <option value="ACTIVE">
                ACTIVE
              </option>
              <option value="PENDING">
                PENDING
              </option>
              <option value="SUSPENDED">
                SUSPENDED
              </option>
              <option value="BLOCKED">
                BLOCKED
              </option>
            </select>

            <button
              type="submit"
              disabled={loadingUsers}
            >
              {loadingUsers
                ? "Loading…"
                : "Search"}
            </button>

            <button
              className={styles.secondaryButton}
              type="button"
              disabled={loadingUsers}
              onClick={() =>
                void clearFilters()
              }
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
                  usersPayload.users.map(
                    (user) => {
                      const founder =
                        user.roles.includes(
                          "SUPER_ADMIN",
                        );

                      const self =
                        currentUser?.id ===
                        user.id;

                      const protectedUser =
                        founder || self;

                      const busy =
                        workingUserId ===
                        user.id;

                      return (
                        <tr key={user.id}>
                          <td>
                            <div
                              className={
                                styles.userIdentity
                              }
                            >
                              <strong>
                                {user.email}
                              </strong>

                              <small>
                                {user.username
                                  ? `@${user.username}`
                                  : "No username"}
                              </small>

                              {(user.firstName ||
                                user.lastName) && (
                                <small>
                                  {[
                                    user.firstName,
                                    user.lastName,
                                  ]
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
                            <div
                              className={
                                styles.roleTags
                              }
                            >
                              {user.roles.map(
                                (role) => (
                                  <span
                                    key={role}
                                  >
                                    {role}
                                  </span>
                                ),
                              )}
                            </div>
                          </td>

                          <td>
                            {new Date(
                              user.createdAt,
                            ).toLocaleDateString()}
                          </td>

                          <td>
                            {protectedUser ? (
                              <small
                                className={
                                  styles.protectedText
                                }
                              >
                                {founder
                                  ? "Founder protected"
                                  : "Self-management blocked"}
                              </small>
                            ) : (
                              <div
                                className={
                                  styles.actions
                                }
                              >
                                {can(
                                  "users.status.manage",
                                ) ? (
                                  <>
                                    {user.status !==
                                    "ACTIVE" ? (
                                      <button
                                        type="button"
                                        disabled={
                                          busy
                                        }
                                        onClick={() =>
                                          void updateStatus(
                                            user,
                                            "ACTIVE",
                                          )
                                        }
                                      >
                                        Activate
                                      </button>
                                    ) : null}

                                    {user.status !==
                                    "SUSPENDED" ? (
                                      <button
                                        type="button"
                                        disabled={
                                          busy
                                        }
                                        onClick={() =>
                                          void updateStatus(
                                            user,
                                            "SUSPENDED",
                                          )
                                        }
                                      >
                                        Suspend
                                      </button>
                                    ) : null}

                                    {user.status !==
                                    "BLOCKED" ? (
                                      <button
                                        type="button"
                                        disabled={
                                          busy
                                        }
                                        onClick={() =>
                                          void updateStatus(
                                            user,
                                            "BLOCKED",
                                          )
                                        }
                                      >
                                        Block
                                      </button>
                                    ) : null}
                                  </>
                                ) : null}

                                {can(
                                  "users.roles.manage",
                                ) ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void toggleAdminRole(
                                        user,
                                      )
                                    }
                                  >
                                    {user.roles.includes(
                                      "ADMIN",
                                    )
                                      ? "Remove ADMIN"
                                      : "Make ADMIN"}
                                  </button>
                                ) : null}

                                {!can(
                                  "users.status.manage",
                                ) &&
                                !can(
                                  "users.roles.manage",
                                ) ? (
                                  <small
                                    className={
                                      styles.protectedText
                                    }
                                  >
                                    Read only
                                  </small>
                                ) : null}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className={
                        styles.emptyState
                      }
                    >
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {usersPayload &&
          usersPayload.pagination.totalPages >
            1 ? (
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={
                  loadingUsers ||
                  usersPayload.pagination.page <= 1
                }
                onClick={() =>
                  void loadUsers(
                    usersPayload.pagination.page -
                      1,
                  )
                }
              >
                Previous
              </button>

              <span>
                Page{" "}
                {usersPayload.pagination.page} of{" "}
                {
                  usersPayload.pagination
                    .totalPages
                }
              </span>

              <button
                type="button"
                disabled={
                  loadingUsers ||
                  usersPayload.pagination.page >=
                    usersPayload.pagination
                      .totalPages
                }
                onClick={() =>
                  void loadUsers(
                    usersPayload.pagination.page +
                      1,
                  )
                }
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
                <span className={styles.eyebrow}>
                  CREATE ACCOUNT
                </span>
                <h2>Add platform user</h2>
              </div>

              <small>
                New users start PENDING + USER.
              </small>
            </div>

            <form
              className={styles.createGrid}
              onSubmit={createUser}
            >
              <label>
                Email
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      email:
                        event.target.value,
                    })
                  }
                  required
                  maxLength={191}
                  autoComplete="off"
                />
              </label>

              <label>
                Temporary password
                <input
                  type="password"
                  value={
                    createForm.password
                  }
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      password:
                        event.target.value,
                    })
                  }
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>

              <label>
                Username
                <input
                  value={
                    createForm.username
                  }
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      username:
                        event.target.value,
                    })
                  }
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9._-]+"
                  autoComplete="off"
                />
              </label>

              <label>
                Phone
                <input
                  value={createForm.phone}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      phone:
                        event.target.value,
                    })
                  }
                  placeholder="+919876543210"
                  pattern="\+[1-9][0-9]{7,14}"
                  autoComplete="off"
                />
              </label>

              <label>
                First name
                <input
                  value={
                    createForm.firstName
                  }
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      firstName:
                        event.target.value,
                    })
                  }
                  maxLength={100}
                  autoComplete="off"
                />
              </label>

              <label>
                Last name
                <input
                  value={
                    createForm.lastName
                  }
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      lastName:
                        event.target.value,
                    })
                  }
                  maxLength={100}
                  autoComplete="off"
                />
              </label>

              <div
                className={
                  styles.createActions
                }
              >
                <button
                  type="submit"
                  disabled={creating}
                >
                  {creating
                    ? "Creating…"
                    : "Create user"}
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}
