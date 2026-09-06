"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  PACKAGE_AVAILABILITIES,
  PACKAGE_CAP_BASES,
  PACKAGE_CAP_REACHED_ACTIONS,
  PACKAGE_CYCLE_DAY_MODES,
  PACKAGE_CYCLE_END_ACTIONS,
  PACKAGE_PRINCIPAL_TREATMENTS,
  PACKAGE_REWARD_DAY_MODES,
  PACKAGE_REWARD_FREQUENCIES,
  PACKAGE_REWARD_RATE_MEANINGS,
  PACKAGE_REWARD_RATE_MODES,
  PACKAGE_REWARD_START_MODES,
  apiMessage,
  enumLabel,
  readApiPayload,
  type ApiErrorPayload,
  type PackagePlan,
  type PackagePlanItem,
} from "@/lib/packages";
import styles from "./simple-packages.module.css";

interface MutationPayload extends ApiErrorPayload {
  message?: string;
  revision?: number;
  item?: PackagePlanItem;
}

interface FormState {
  packageCode: string;
  displayName: string;
  slug: string;
  sortOrder: string;
  availability: string;
  price: string;
  minimumInvestment: string;
  maximumInvestment: string;
  durationDays: string;
  rewardRateMode: string;
  fixedRewardRate: string;
  minimumRewardRate: string;
  maximumRewardRate: string;
  rewardRateMeaning: string;
  capBasis: string;
  capMultiplier: string;
  principalTreatment: string;
  goalDays: string;
  cycleDays: string;
  rewardStartMode: string;
  rewardFrequency: string;
  cycleDayMode: string;
  rewardDayMode: string;
  cycleEndAction: string;
  capReachedAction: string;
}

function emptyForm(): FormState {
  return {
    packageCode: "",
    displayName: "",
    slug: "",
    sortOrder: "",
    availability: "",
    price: "",
    minimumInvestment: "",
    maximumInvestment: "",
    durationDays: "",
    rewardRateMode: "",
    fixedRewardRate: "",
    minimumRewardRate: "",
    maximumRewardRate: "",
    rewardRateMeaning: "",
    capBasis: "",
    capMultiplier: "",
    principalTreatment: "",
    goalDays: "",
    cycleDays: "",
    rewardStartMode: "",
    rewardFrequency: "",
    cycleDayMode: "",
    rewardDayMode: "",
    cycleEndAction: "",
    capReachedAction: "",
  };
}

function formFromItem(item: PackagePlanItem): FormState {
  return {
    packageCode: item.packageCode,
    displayName: item.displayName,
    slug: item.slug,
    sortOrder: String(item.sortOrder),
    availability: item.availability,
    price: item.price,
    minimumInvestment: item.minimumInvestment ?? "",
    maximumInvestment: item.maximumInvestment ?? "",
    durationDays: item.durationDays ? String(item.durationDays) : "",
    rewardRateMode: item.rewardRateMode,
    fixedRewardRate: item.fixedRewardRate ?? "",
    minimumRewardRate: item.minimumRewardRate ?? "",
    maximumRewardRate: item.maximumRewardRate ?? "",
    rewardRateMeaning: item.rewardRateMeaning,
    capBasis: item.capBasis,
    capMultiplier: item.capMultiplier,
    principalTreatment: item.principalTreatment,
    goalDays: String(item.goalDays),
    cycleDays: String(item.cycleDays),
    rewardStartMode: item.rewardStartMode,
    rewardFrequency: item.rewardFrequency,
    cycleDayMode: item.cycleDayMode,
    rewardDayMode: item.rewardDayMode,
    cycleEndAction: item.cycleEndAction,
    capReachedAction: item.capReachedAction,
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option value={option} key={option}>
            {enumLabel(option)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function nullableDecimal(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function nullableInteger(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

export default function PackageItemEditor({
  plan,
  item,
  mode,
  onSaved,
  onCancel,
}: {
  plan: PackagePlan;
  item: PackagePlanItem | null;
  mode: "create" | "edit";
  onSaved: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    item ? formFromItem(item) : emptyForm(),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || reason.trim().length < 3) return;

    const fixedRate = form.rewardRateMode === "FIXED";
    const body = {
      expectedRevision: plan.revision,
      reason: reason.trim(),
      ...(mode === "create"
        ? { packageCode: form.packageCode.trim().toUpperCase() }
        : {}),
      displayName: form.displayName.trim(),
      slug: form.slug.trim().toLowerCase(),
      sortOrder: Number(form.sortOrder),
      availability: form.availability,
      price: form.price.trim(),
      minimumInvestment: nullableDecimal(form.minimumInvestment),
      maximumInvestment: nullableDecimal(form.maximumInvestment),
      durationDays: nullableInteger(form.durationDays),
      currency: "USDT",
      rewardRateMode: form.rewardRateMode,
      fixedRewardRate: fixedRate ? nullableDecimal(form.fixedRewardRate) : null,
      minimumRewardRate: fixedRate
        ? null
        : nullableDecimal(form.minimumRewardRate),
      maximumRewardRate: fixedRate
        ? null
        : nullableDecimal(form.maximumRewardRate),
      rewardRateMeaning: form.rewardRateMeaning,
      capBasis: form.capBasis,
      capMultiplier: form.capMultiplier.trim(),
      principalTreatment: form.principalTreatment,
      goalDays: Number(form.goalDays),
      cycleDays: Number(form.cycleDays),
      rewardStartMode: form.rewardStartMode,
      rewardFrequency: form.rewardFrequency,
      cycleDayMode: form.cycleDayMode,
      rewardDayMode: form.rewardDayMode,
      cycleEndAction: form.cycleEndAction,
      capReachedAction: form.capReachedAction,
    };

    setBusy(true);
    setError("");

    try {
      const url =
        mode === "create"
          ? `/api/admin/package-plans/${encodeURIComponent(plan.id)}/items`
          : `/api/admin/package-plans/${encodeURIComponent(plan.id)}/items/${encodeURIComponent(item?.id ?? "")}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readApiPayload<MutationPayload>(response);

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Package item request failed."));
      }

      await onSaved(payload?.message ?? "Package item saved.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Package item request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.editor} onSubmit={submit}>
      <div className={styles.editorHeader}>
        <div>
          <small>
            {mode === "create"
              ? "NEW PACKAGE"
              : `EDIT ${item?.packageCode ?? "PACKAGE"}`}
          </small>
          <h3>
            {mode === "create" ? "Create package item" : item?.displayName}
          </h3>
        </div>
        {onCancel ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        ) : null}
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.formGrid}>
        <Field label="Package code">
          <input
            required
            maxLength={64}
            pattern="[A-Za-z][A-Za-z0-9_]{2,63}"
            value={form.packageCode}
            disabled={mode === "edit"}
            onChange={(event) => set("packageCode", event.target.value)}
          />
        </Field>
        <Field label="Display name">
          <input
            required
            maxLength={100}
            value={form.displayName}
            onChange={(event) => set("displayName", event.target.value)}
          />
        </Field>
        <Field label="Slug">
          <input
            required
            maxLength={100}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={form.slug}
            onChange={(event) => set("slug", event.target.value)}
          />
        </Field>
        <Field label="Sort order">
          <input
            required
            type="number"
            min={1}
            max={10000}
            value={form.sortOrder}
            onChange={(event) => set("sortOrder", event.target.value)}
          />
        </Field>
        <SelectField
          label="Availability"
          value={form.availability}
          options={PACKAGE_AVAILABILITIES}
          onChange={(value) => set("availability", value)}
        />
        <Field label="Price / minimum compatibility value (USDT)">
          <input
            required
            inputMode="decimal"
            value={form.price}
            onChange={(event) => set("price", event.target.value)}
          />
        </Field>
        <Field label="Minimum investment (USDT)">
          <input
            inputMode="decimal"
            value={form.minimumInvestment}
            onChange={(event) => set("minimumInvestment", event.target.value)}
          />
        </Field>
        <Field label="Maximum investment (USDT, blank = no upper bound)">
          <input
            inputMode="decimal"
            value={form.maximumInvestment}
            onChange={(event) => set("maximumInvestment", event.target.value)}
          />
        </Field>
        <Field label="Duration days">
          <input
            type="number"
            min={1}
            max={36500}
            value={form.durationDays}
            onChange={(event) => set("durationDays", event.target.value)}
          />
        </Field>
        <SelectField
          label="Reward-rate mode"
          value={form.rewardRateMode}
          options={PACKAGE_REWARD_RATE_MODES}
          onChange={(value) => set("rewardRateMode", value)}
        />

        {form.rewardRateMode === "FIXED" ? (
          <Field label="Fixed reward rate %">
            <input
              required
              inputMode="decimal"
              value={form.fixedRewardRate}
              onChange={(event) => set("fixedRewardRate", event.target.value)}
            />
          </Field>
        ) : form.rewardRateMode ? (
          <>
            <Field label="Minimum reward rate %">
              <input
                required
                inputMode="decimal"
                value={form.minimumRewardRate}
                onChange={(event) =>
                  set("minimumRewardRate", event.target.value)
                }
              />
            </Field>
            <Field label="Maximum reward rate %">
              <input
                required
                inputMode="decimal"
                value={form.maximumRewardRate}
                onChange={(event) =>
                  set("maximumRewardRate", event.target.value)
                }
              />
            </Field>
          </>
        ) : null}

        <SelectField
          label="Reward-rate meaning"
          value={form.rewardRateMeaning}
          options={PACKAGE_REWARD_RATE_MEANINGS}
          onChange={(value) => set("rewardRateMeaning", value)}
        />
        <SelectField
          label="Cap basis"
          value={form.capBasis}
          options={PACKAGE_CAP_BASES}
          onChange={(value) => set("capBasis", value)}
        />
        <Field label="Cap multiplier">
          <input
            required
            inputMode="decimal"
            value={form.capMultiplier}
            onChange={(event) => set("capMultiplier", event.target.value)}
          />
        </Field>
        <SelectField
          label="Principal treatment"
          value={form.principalTreatment}
          options={PACKAGE_PRINCIPAL_TREATMENTS}
          onChange={(value) => set("principalTreatment", value)}
        />
        <Field label="Goal / lifetime days">
          <input
            required
            type="number"
            min={1}
            max={36500}
            value={form.goalDays}
            onChange={(event) => set("goalDays", event.target.value)}
          />
        </Field>
        <Field label="Cycle days">
          <input
            required
            type="number"
            min={1}
            max={36500}
            value={form.cycleDays}
            onChange={(event) => set("cycleDays", event.target.value)}
          />
        </Field>
        <SelectField
          label="Reward start"
          value={form.rewardStartMode}
          options={PACKAGE_REWARD_START_MODES}
          onChange={(value) => set("rewardStartMode", value)}
        />
        <SelectField
          label="Reward frequency"
          value={form.rewardFrequency}
          options={PACKAGE_REWARD_FREQUENCIES}
          onChange={(value) => set("rewardFrequency", value)}
        />
        <SelectField
          label="Cycle-day mode"
          value={form.cycleDayMode}
          options={PACKAGE_CYCLE_DAY_MODES}
          onChange={(value) => set("cycleDayMode", value)}
        />
        <SelectField
          label="Reward-day mode"
          value={form.rewardDayMode}
          options={PACKAGE_REWARD_DAY_MODES}
          onChange={(value) => set("rewardDayMode", value)}
        />
        <SelectField
          label="Cycle-end action"
          value={form.cycleEndAction}
          options={PACKAGE_CYCLE_END_ACTIONS}
          onChange={(value) => set("cycleEndAction", value)}
        />
        <SelectField
          label="Cap-reached action"
          value={form.capReachedAction}
          options={PACKAGE_CAP_REACHED_ACTIONS}
          onChange={(value) => set("capReachedAction", value)}
        />
      </div>

      <Field label="Audit reason">
        <textarea
          required
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why is this package configuration changing?"
        />
      </Field>

      <button
        type="submit"
        className={styles.primaryButton}
        disabled={busy || reason.trim().length < 3}
      >
        {busy ? "Saving…" : mode === "create" ? "Create package" : "Save package"}
      </button>
    </form>
  );
}
