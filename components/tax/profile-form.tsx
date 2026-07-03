"use client";
import { useState, useCallback } from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Shield,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
// import { input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// import { Separator } from "@/components/ui/separator";

export type ProfileFormData = {
  fullName: string;
  cnic: string;
  ntn: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  taxYear: string;
  filingType: string;
};

type ProfileFormProps = {
  initialData?: Partial<ProfileFormData>;
  onSave?: (data: ProfileFormData) => Promise<void> | void;
  className?: string;
};

const DEFAULT_DATA: ProfileFormData = {
  fullName: "",
  cnic: "",
  ntn: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  taxYear: new Date().getFullYear().toString(),
  filingType: "salary",
};

type FieldErrors = Partial<Record<keyof ProfileFormData, string>>;

export function ProfileForm({
  initialData,
  onSave,
  className,
}: ProfileFormProps) {
  const [form, setForm] = useState<ProfileFormData>({
    ...DEFAULT_DATA,
    ...initialData,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (field: keyof ProfileFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field])
      setErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    setSaved(false);
  };

  const validate = useCallback((): boolean => {
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
  }, [form]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave?.(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }, [form, onSave, validate]);

  return (
    <div className={cn("mx-auto max-w-3xl space-y-6", className)}>
      {/* ── Avatar + Header ── */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 sm:flex-row sm:py-5">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amanah/10 ring-4 ring-amanah/20">
              <User className="h-9 w-9 text-amanah" />
            </div>
            <button
              type="button"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-amanah text-white shadow-sm hover:bg-amanah/90 transition-colors"
              aria-label="Change avatar"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="text-center sm:text-left sm:flex-1">
            <h2 className="text-xl font-bold text-foreground">
              {form.fullName || "Ahmed Khan"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {form.email || "ahmed@email.com"}
            </p>
            <Badge
              variant="outline"
              className="mt-1.5 border-amanah/30 bg-amanah/10 text-amanah text-[10px]"
            >
              Pro Plan
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── Two-Column Grid ── */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Personal Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-amanah" />
              Personal Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Full Name
              </label>
              <input
                placeholder="Ahmed Khan"
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                className={cn("h-10", errors.fullName && "border-risk")}
                aria-invalid={!!errors.fullName}
              />
              {errors.fullName && (
                <p className="text-[11px] text-risk">{errors.fullName}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  CNIC Number
                </label>
                <input
                  placeholder="42301-1234567-5"
                  value={form.cnic}
                  onChange={(e) => set("cnic", e.target.value)}
                  className={cn("h-10", errors.cnic && "border-risk")}
                  aria-invalid={!!errors.cnic}
                />
                {errors.cnic && (
                  <p className="text-[11px] text-risk">{errors.cnic}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  NTN Number
                </label>
                <input
                  placeholder="1234567"
                  value={form.ntn}
                  onChange={(e) => set("ntn", e.target.value)}
                  className={cn("h-10", errors.ntn && "border-risk")}
                  aria-invalid={!!errors.ntn}
                />
                {errors.ntn && (
                  <p className="text-[11px] text-risk">{errors.ntn}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Date of Birth
              </label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
                className="h-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Phone className="h-4 w-4 text-amanah" />
              Contact Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Mail className="h-3 w-3" />
                Email
              </label>
              <input
                type="email"
                placeholder="ahmed@email.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={cn("h-10", errors.email && "border-risk")}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-[11px] text-risk">{errors.email}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Phone className="h-3 w-3" />
                Phone
              </label>
              <input
                placeholder="0300-1234567"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={cn("h-10", errors.phone && "border-risk")}
                aria-invalid={!!errors.phone}
              />
              {errors.phone && (
                <p className="text-[11px] text-risk">{errors.phone}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3 w-3" />
                Residential Address
              </label>
              <input
                placeholder="House 12, Street 5, DHA Phase 6"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                City
              </label>
              <input
                placeholder="Karachi"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                className="h-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Tax Preferences */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-amanah" />
              Tax Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Default Tax Year
              </label>
              <input
                placeholder="2025"
                value={form.taxYear}
                onChange={(e) => set("taxYear", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Default Filing Type
              </label>
              <div className="flex gap-2">
                {[
                  { value: "salary", label: "Salary" },
                  { value: "business", label: "Business" },
                  { value: "both", label: "Both" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("filingType", opt.value)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                      form.filingType === opt.value
                        ? "border-amanah bg-amanah/10 text-amanah"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-amanah" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 text-sm"
            >
              <Shield className="h-4 w-4 text-muted-foreground" />
              Change Password
            </Button>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">
                  Two-Factor Authentication
                </div>
                <div className="text-xs text-muted-foreground">
                  Add an extra layer of security
                </div>
              </div>
              <button
                type="button"
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors bg-muted"
                aria-label="Toggle 2FA"
              >
                <span className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform translate-x-0" />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Action Bar ── */}
      <div className="flex items-center justify-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
        {saved && (
          <span className="mr-auto flex items-center gap-1.5 text-sm text-amanah">
            <CheckCircle2 className="h-4 w-4" />
            Profile saved
          </span>
        )}
        <Button variant="outline" size="sm" disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
