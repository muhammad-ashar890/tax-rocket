"use client";

import { useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────
   Profile Page — Self-contained. Primary: #376952 (amanah).

   v2 polish pass:
   - Hero-style avatar card (gradient + glow) with a real profile
     completeness meter (computed from filled fields, not decorative).
   - Each card gets its own accent chip (amanah / indus / mizan /
     khewra-derived hex) so the page reads with the same visual
     rhythm as the dashboard's quick-link accents.
   - Icon-prefixed inputs for email / phone / address.
   - Always-visible format hints under CNIC, NTN, phone.
   - Custom chevron on the tax-year dropdown, hover elevation on
     cards, required-field markers.
   - Layout/behavior from the previous pass unchanged: full-width
     container, working 2FA toggle, tax year dropdown, Default Filing
     Type removed, responsive action bar.
─────────────────────────────────────────────────────────────── */

type FieldErrors = Record<string, string>;

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEAR_OPTIONS = [
  CURRENT_YEAR + 1,
  CURRENT_YEAR,
  CURRENT_YEAR - 1,
  CURRENT_YEAR - 2,
];

const ACCENT = {
  personal: "#376952", // amanah
  contact: "#1D7AA5", // indus-derived blue
  tax: "#B8872F", // mizan-derived gold
  security: "#B03A5B", // khewra-derived maroon
};

export default function ProfilePage() {
  const [form, setForm] = useState({
    fullName: "",
    cnic: "",
    ntn: "",
    dateOfBirth: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    taxYear: CURRENT_YEAR.toString(),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const set = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const n = { ...prev };
      delete n[field];
      return n;
    });
    setSaved(false);
  };

  const validate = () => {
    const errs: FieldErrors = {};
    if (!form.fullName.trim()) errs.fullName = "Full name is required";
    if (form.cnic && !/^\d{5}-\d{7}-\d$/.test(form.cnic))
      errs.cnic = "Format: XXXXX-XXXXXXX-X";
    if (form.ntn && !/^\d{6,8}$/.test(form.ntn))
      errs.ntn = "Enter a valid 7-digit NTN";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "Enter a valid email";
    if (form.phone && !/^03\d{2}-\d{7}$/.test(form.phone))
      errs.phone = "Format: 03XX-XXXXXXX";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // Real completeness — not decorative: counts the 8 core profile fields.
  const completeness = useMemo(() => {
    const fields = [
      form.fullName,
      form.cnic,
      form.ntn,
      form.dateOfBirth,
      form.email,
      form.phone,
      form.address,
      form.city,
    ];
    const filled = fields.filter((f) => f.trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [form]);

  const inputCls = (field: string, hasIcon = false) =>
    `h-10 w-full rounded-lg border bg-white ${hasIcon ? "pl-9 pr-3" : "px-3"} text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-[#376952] focus:ring-2 focus:ring-[#376952]/20 ${
      errors[field] ? "border-red-500" : "border-gray-200"
    }`;

  const labelCls =
    "mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500";
  const hintCls = "mt-1 text-[11px] text-gray-400";
  const errCls = "mt-1 text-[11px] text-red-500";

  const cardCls =
    "rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md";

  const cardTitle = (icon: React.ReactNode, label: string) => (
    <h3 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-gray-700">
      {icon}
      {label}
    </h3>
  );

  const iconChip = (color: string, Icon: typeof UserRound) => (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-lg"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <Icon className="h-4 w-4" />
    </span>
  );

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <UserRound className="h-5 w-5 text-[#376952]" />
          <h1 className="text-lg font-bold text-gray-800">Profile</h1>
        </div>
        <span className="block h-[3px] w-12 rounded-[2px] bg-[#376952]" />
        <p className="mt-2 text-sm text-gray-500">
          Manage your personal and tax profile information.
        </p>
      </div>

      {/* Full width — matches the header/logo container. */}
      <div className="w-full space-y-6">
        {/* ── Hero Avatar Card ── */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-[#376952]/10 via-white to-white p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#376952]/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <div className="relative shrink-0">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#376952]/10 ring-4 ring-[#376952]/20">
                  <UserRound className="h-9 w-9 text-[#376952]" />
                </div>
                <button className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#376952] text-white shadow-sm transition-colors hover:bg-[#2e5a44]">
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {form.fullName || "Ahmed Khan"}
                </h2>
                <p className="text-sm text-gray-500">
                  {form.email || "ahmed@email.com"}
                </p>
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#376952]/30 bg-[#376952]/10 px-2 py-0.5 text-[10px] font-medium text-[#376952]">
                  <Sparkles className="h-2.5 w-2.5" />
                  Pro Plan
                </span>
              </div>
            </div>

            {/* Profile completeness — real, computed metric */}
            <div className="w-full rounded-xl border border-gray-200 bg-white/70 p-3.5 backdrop-blur-sm sm:w-56">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-gray-600">
                  Profile completeness
                </span>
                <span className="font-semibold text-[#376952]">
                  {completeness}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[#376952] transition-all duration-500 ease-out"
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Form Grid ── */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Personal Info */}
          <div className={cardCls}>
            {cardTitle(iconChip(ACCENT.personal, UserRound), "Personal Info")}
            <div className="space-y-3">
              <div>
                <label className={labelCls}>
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  className={inputCls("fullName")}
                  placeholder="Ahmed Khan"
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                />
                {errors.fullName && <p className={errCls}>{errors.fullName}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>CNIC Number</label>
                  <input
                    className={inputCls("cnic")}
                    placeholder="42301-1234567-5"
                    value={form.cnic}
                    onChange={(e) => set("cnic", e.target.value)}
                  />
                  {errors.cnic ? (
                    <p className={errCls}>{errors.cnic}</p>
                  ) : (
                    <p className={hintCls}>XXXXX-XXXXXXX-X</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>NTN Number</label>
                  <input
                    className={inputCls("ntn")}
                    placeholder="1234567"
                    value={form.ntn}
                    onChange={(e) => set("ntn", e.target.value)}
                  />
                  {errors.ntn ? (
                    <p className={errCls}>{errors.ntn}</p>
                  ) : (
                    <p className={hintCls}>7-digit FBR NTN</p>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls}>Date of Birth</label>
                <input
                  type="date"
                  className={inputCls("")}
                  value={form.dateOfBirth}
                  onChange={(e) => set("dateOfBirth", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className={cardCls}>
            {cardTitle(iconChip(ACCENT.contact, Phone), "Contact Info")}
            <div className="space-y-3">
              <div>
                <label className={labelCls}>
                  Email <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    className={inputCls("email", true)}
                    placeholder="ahmed@email.com"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                  />
                </div>
                {errors.email && <p className={errCls}>{errors.email}</p>}
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    className={inputCls("phone", true)}
                    placeholder="0300-1234567"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </div>
                {errors.phone ? (
                  <p className={errCls}>{errors.phone}</p>
                ) : (
                  <p className={hintCls}>03XX-XXXXXXX</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Residential Address</label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    className={inputCls("address", true)}
                    placeholder="House 12, Street 5, DHA Phase 6"
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input
                  className={inputCls("")}
                  placeholder="Karachi"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Tax Preferences */}
          <div className={cardCls}>
            {cardTitle(iconChip(ACCENT.tax, Shield), "Tax Preferences")}
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Default Tax Year</label>
                <div className="relative">
                  <select
                    className={`h-10 w-full appearance-none rounded-lg border bg-white px-3 pr-9 text-sm outline-none transition-colors focus:border-[#376952] focus:ring-2 focus:ring-[#376952]/20 ${
                      errors.taxYear ? "border-red-500" : "border-gray-200"
                    }`}
                    value={form.taxYear}
                    onChange={(e) => set("taxYear", e.target.value)}
                  >
                    {TAX_YEAR_OPTIONS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className={cardCls}>
            {cardTitle(iconChip(ACCENT.security, Shield), "Security")}
            <div className="space-y-3">
              <button className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50">
                <Shield className="h-4 w-4 text-gray-400" />
                Change Password
              </button>
              <div className="h-px bg-gray-200" />
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    Two-Factor Authentication
                  </div>
                  <div className="text-xs text-gray-400">
                    Add an extra layer of security
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={twoFactorEnabled}
                  onClick={() => setTwoFactorEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    twoFactorEnabled ? "bg-[#376952]" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                      twoFactorEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Bar ── */}
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-end">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-[#376952] sm:mr-auto">
              <CheckCircle2 className="h-4 w-4" />
              Profile saved successfully
            </span>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={saving}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#376952] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2e5a44] disabled:opacity-50 sm:flex-none"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
