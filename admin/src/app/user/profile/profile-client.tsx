"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";
import styles from "./profile.module.css";

interface ErrorPayload {
  message?: string;
  redirectTo?: string;
}

interface ProfileUpdatePayload extends ErrorPayload {
  user?: UserDirectSession["user"];
}

interface CountryDialOption {
  code: string;
  label: string;
}

const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: "+91", label: "India (+91)" },
  { code: "+1", label: "United States / Canada (+1)" },
  { code: "+44", label: "United Kingdom (+44)" },
  { code: "+971", label: "United Arab Emirates (+971)" },
  { code: "+966", label: "Saudi Arabia (+966)" },
  { code: "+974", label: "Qatar (+974)" },
  { code: "+965", label: "Kuwait (+965)" },
  { code: "+973", label: "Bahrain (+973)" },
  { code: "+968", label: "Oman (+968)" },
  { code: "+92", label: "Pakistan (+92)" },
  { code: "+880", label: "Bangladesh (+880)" },
  { code: "+977", label: "Nepal (+977)" },
  { code: "+94", label: "Sri Lanka (+94)" },
  { code: "+65", label: "Singapore (+65)" },
  { code: "+60", label: "Malaysia (+60)" },
  { code: "+62", label: "Indonesia (+62)" },
  { code: "+63", label: "Philippines (+63)" },
  { code: "+66", label: "Thailand (+66)" },
  { code: "+84", label: "Vietnam (+84)" },
  { code: "+86", label: "China (+86)" },
  { code: "+852", label: "Hong Kong (+852)" },
  { code: "+81", label: "Japan (+81)" },
  { code: "+82", label: "South Korea (+82)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+64", label: "New Zealand (+64)" },
  { code: "+49", label: "Germany (+49)" },
  { code: "+33", label: "France (+33)" },
  { code: "+39", label: "Italy (+39)" },
  { code: "+34", label: "Spain (+34)" },
  { code: "+31", label: "Netherlands (+31)" },
  { code: "+41", label: "Switzerland (+41)" },
  { code: "+46", label: "Sweden (+46)" },
  { code: "+47", label: "Norway (+47)" },
  { code: "+45", label: "Denmark (+45)" },
  { code: "+353", label: "Ireland (+353)" },
  { code: "+48", label: "Poland (+48)" },
  { code: "+351", label: "Portugal (+351)" },
  { code: "+30", label: "Greece (+30)" },
  { code: "+90", label: "Turkey (+90)" },
  { code: "+7", label: "Russia / Kazakhstan (+7)" },
  { code: "+380", label: "Ukraine (+380)" },
  { code: "+27", label: "South Africa (+27)" },
  { code: "+234", label: "Nigeria (+234)" },
  { code: "+254", label: "Kenya (+254)" },
  { code: "+233", label: "Ghana (+233)" },
  { code: "+20", label: "Egypt (+20)" },
  { code: "+212", label: "Morocco (+212)" },
  { code: "+55", label: "Brazil (+55)" },
  { code: "+54", label: "Argentina (+54)" },
  { code: "+52", label: "Mexico (+52)" },
];

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatDate(value: string | null): string {
  return value ? formatPlatformDateTime(value) : "No login recorded";
}

function splitPhone(value: string | null | undefined) {
  const normalized = (value ?? "").trim().replace(/[\s()-]/g, "");

  if (!normalized) {
    return { countryCode: "+91", mobileNumber: "" };
  }

  const match = [...COUNTRY_DIAL_OPTIONS]
    .sort((left, right) => right.code.length - left.code.length)
    .find((option) => normalized.startsWith(option.code));

  if (!match) {
    return {
      countryCode: "",
      mobileNumber: normalized.replace(/^\+/, "").replace(/\D/g, ""),
    };
  }

  return {
    countryCode: match.code,
    mobileNumber: normalized.slice(match.code.length).replace(/\D/g, ""),
  };
}

function combinedPhone(countryCode: string, mobileNumber: string) {
  const digits = mobileNumber.replace(/\D/g, "");
  return digits ? `${countryCode}${digits}` : "";
}

export default function UserProfileClient() {
  const router = useRouter();

  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [mobileNumber, setMobileNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/user/session", {
          method: "GET",
          cache: "no-store",
        });

        const payload = await readPayload<UserDirectSession & ErrorPayload>(
          response,
        );

        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (response.status === 403) {
          router.replace(
            payload?.redirectTo === "/dashboard" ? "/dashboard" : "/login",
          );
          router.refresh();
          return;
        }

        if (!response.ok || !payload?.user || !payload.sessionPolicy) {
          throw new Error(payload?.message || "Unable to load your profile.");
        }

        if (mounted) {
          const parsedPhone = splitPhone(payload.user.phone);

          setSession(payload);
          setFirstName(payload.user.firstName ?? "");
          setLastName(payload.user.lastName ?? "");
          setCountryCode(parsedPhone.countryCode);
          setMobileNumber(parsedPhone.mobileNumber);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load your profile.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  const displayName = useMemo(() => {
    const user = session?.user;

    if (!user) {
      return "FixTradeZone User";
    }

    return (
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email ||
      "FixTradeZone User"
    );
  }, [session]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const normalizedMobile = mobileNumber.replace(/\D/g, "");

    if (normalizedMobile && !countryCode) {
      setSaveError("Select a country code for the mobile number.");
      setSaveMessage("");
      return;
    }

    const phone = combinedPhone(countryCode, normalizedMobile);

    if (phone && phone.replace(/\D/g, "").length > 15) {
      setSaveError("Mobile number must fit the E.164 limit of 15 digits.");
      setSaveMessage("");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveMessage("");

    try {
      const response = await fetch("/api/user/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
        }),
      });
      const payload = await readPayload<ProfileUpdatePayload>(response);

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!response.ok || !payload?.user) {
        throw new Error(payload?.message || "Unable to update your profile.");
      }

      const parsedPhone = splitPhone(payload.user.phone);

      setSession((current) =>
        current
          ? {
              ...current,
              user: payload.user as UserDirectSession["user"],
            }
          : current,
      );
      setFirstName(payload.user.firstName ?? "");
      setLastName(payload.user.lastName ?? "");
      setCountryCode(parsedPhone.countryCode);
      setMobileNumber(parsedPhone.mobileNumber);
      setSaveMessage(payload.message ?? "Profile updated successfully.");
    } catch (caught) {
      setSaveError(
        caught instanceof Error
          ? caught.message
          : "Unable to update your profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading">
          <span />
          <p>Loading account profile…</p>
        </div>
      </UserShell>
    );
  }

  if (!session) {
    return (
      <UserShell session={null}>
        <div className={styles.error}>
          {error || "USER profile is unavailable."}
        </div>
      </UserShell>
    );
  }

  const user = session.user;

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>ACCOUNT & SECURITY</span>
            <h2>{displayName}</h2>
            <p>
              Your registration identity is intentionally minimal. First name,
              last name and mobile are optional and can be maintained here.
            </p>

            <div className={styles.badges}>
              <span>
                <i className="iconoir-shield-check" />
                {user.status}
              </span>
              {user.roles.map((role) => (
                <span key={role}>
                  <i className="iconoir-user" />
                  {role}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.profileMark}>
            <i className="iconoir-profile-circle" />
          </div>
        </section>

        <section className={styles.metrics}>
          <article>
            <span>
              <i className="iconoir-user" />
            </span>
            <div>
              <small>ACCOUNT STATUS</small>
              <strong>{user.status}</strong>
            </div>
          </article>
          <article>
            <span>
              <i className="iconoir-key" />
            </span>
            <div>
              <small>ACCESS ROLE</small>
              <strong>USER</strong>
            </div>
          </article>
          <article>
            <span>
              <i className="iconoir-clock" />
            </span>
            <div>
              <small>LAST LOGIN</small>
              <strong>{formatDate(user.lastLoginAt)}</strong>
            </div>
          </article>
          <article>
            <span>
              <i className="iconoir-timer" />
            </span>
            <div>
              <small>IDLE SECURITY</small>
              <strong>{session.sessionPolicy.idleLockMinutes} MIN</strong>
            </div>
          </article>
        </section>

        <div className={styles.grid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span>OPTIONAL PROFILE</span>
                <h3>Personal Details</h3>
              </div>
              <i className="iconoir-edit-pencil" />
            </div>

            <form className={styles.profileForm} onSubmit={saveProfile}>
              <div className={styles.formGrid}>
                <label>
                  <span>First name</span>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    maxLength={100}
                    autoComplete="given-name"
                    placeholder="Optional"
                    disabled={saving}
                  />
                </label>

                <label>
                  <span>Last name</span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    maxLength={100}
                    autoComplete="family-name"
                    placeholder="Optional"
                    disabled={saving}
                  />
                </label>
              </div>

              <div className={styles.formGrid}>
                <label>
                  <span>Country code</span>
                  <select
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value)}
                    autoComplete="tel-country-code"
                    disabled={saving}
                    style={{
                      width: "100%",
                      height: 42,
                      padding: "0 12px",
                      border: "1px solid rgba(83, 119, 176, 0.28)",
                      borderRadius: 9,
                      outline: 0,
                      color: "#eaf2ff",
                      background: "rgba(2, 11, 27, 0.96)",
                      fontSize: 10,
                    }}
                  >
                    <option value="">Select country code</option>
                    {COUNTRY_DIAL_OPTIONS.map((option) => (
                      <option key={`${option.code}-${option.label}`} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Mobile number</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={mobileNumber}
                    onChange={(event) =>
                      setMobileNumber(event.target.value.replace(/\D/g, ""))
                    }
                    maxLength={15}
                    autoComplete="tel-national"
                    placeholder="Optional · number only"
                    disabled={saving}
                  />
                </label>
              </div>

              <p className={styles.formHint}>
                Mobile is saved in E.164 format by combining the selected country
                code with the number. Leave the mobile number blank and save to
                clear it. Email and username remain account identifiers and are not
                changed here.
              </p>

              {saveError ? (
                <div className={styles.formError} role="alert">
                  {saveError}
                </div>
              ) : null}
              {saveMessage ? (
                <div className={styles.formSuccess}>{saveMessage}</div>
              ) : null}

              <button type="submit" disabled={saving}>
                <span>{saving ? "Saving…" : "Save optional details"}</span>
                <i className="iconoir-check" />
              </button>
            </form>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span>ACCOUNT</span>
                <h3>Identity Details</h3>
              </div>
              <i className="iconoir-profile-circle" />
            </div>

            <dl className={styles.details}>
              <div>
                <dt>Display Name</dt>
                <dd>{displayName}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>@{user.username}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user.email || "Not set"}</dd>
              </div>
              <div>
                <dt>Mobile</dt>
                <dd>{user.phone || "Not set"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatPlatformDateTime(user.createdAt)}</dd>
              </div>
              <div>
                <dt>Last Login</dt>
                <dd>{formatDate(user.lastLoginAt)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className={styles.notice}>
          <span>
            <i className="iconoir-shield-check" />
          </span>
          <div>
            <strong>Protected account boundary</strong>
            <p>
              Optional profile updates are authenticated, validated server-side
              and audited. Profile changes are disabled during administrator
              impersonation.
            </p>
          </div>
        </section>
      </div>
    </UserShell>
  );
}
