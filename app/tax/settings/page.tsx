"use client";

import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Lock,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { DashboardSidebar } from "@/components/tax/dashboard-sidebar";

type TabKey = "notifications" | "security" | "practice";

const TABS: { key: TabKey; label: string; icon: typeof Bell }[] = [
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "security", label: "Security", icon: Lock },
  { key: "practice", label: "Practice", icon: SlidersHorizontal },
];

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEAR_OPTIONS = [
  CURRENT_YEAR + 1,
  CURRENT_YEAR,
  CURRENT_YEAR - 1,
  CURRENT_YEAR - 2,
];

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="pr-2">
        <div className="text-sm font-medium text-gray-800">{title}</div>
        <div className="mt-0.5 text-xs text-gray-500">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 self-start rounded-full border-2 border-transparent transition-colors sm:self-auto ${
          checked ? "bg-[#376952]" : "bg-gray-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("notifications");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [notifications, setNotifications] = useState({
    filingStatus: true,
    documentProcessing: true,
    riskFlags: true,
    paymentReminders: false,
    fbrConnect: true,
  });

  const [practice, setPractice] = useState({
    taxYear: "2026",
    currency: "PKR",
    autoGeneratePackets: false,
    autoAdvanceStatus: true,
  });

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const inputCls =
    "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-[#376952] focus:ring-2 focus:ring-[#376952]/20";

  const labelCls = "mb-1.5 block text-xs font-medium text-gray-500";

  const cardHeading = (title: string, description: string) => (
    <div className="mb-5">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      {/* Sidebar added here */}
      <DashboardSidebar />

      <div className="lg:min-w-0">
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#376952] text-white shadow-sm">
            <SettingsIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-gray-800 sm:text-xl">
              Settings
            </h1>
            <p className="text-sm text-gray-500">
              Manage your notifications, security, and practice preferences.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <nav className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1.5 md:w-56 md:shrink-0 md:flex-col md:gap-1.5 md:overflow-visible md:rounded-2xl md:border md:border-gray-200 md:bg-white md:p-3 md:shadow-sm">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-1 sm:justify-center md:flex-none md:w-full md:justify-start md:gap-3 md:rounded-xl md:px-4 md:py-2.5 ${
                    isActive
                      ? "bg-white text-gray-800 shadow-sm md:bg-[#376952] md:font-semibold md:text-white md:shadow-none"
                      : "text-gray-500 hover:text-gray-700 md:text-gray-600 md:hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 md:h-[18px] md:w-[18px]" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            {activeTab === "notifications" && (
              <div>
                {cardHeading(
                  "Notification preferences",
                  "Choose what notifications you receive and how.",
                )}
                <div className="space-y-3">
                  <ToggleRow
                    title="Filing status updates"
                    description="Get notified when your filing status changes"
                    checked={notifications.filingStatus}
                    onChange={(v) =>
                      setNotifications((p) => ({ ...p, filingStatus: v }))
                    }
                  />
                  <ToggleRow
                    title="Document processing"
                    description="Alerts when document extraction completes or fails"
                    checked={notifications.documentProcessing}
                    onChange={(v) =>
                      setNotifications((p) => ({ ...p, documentProcessing: v }))
                    }
                  />
                  <ToggleRow
                    title="Risk flags"
                    description="Notifications when new risk flags are detected"
                    checked={notifications.riskFlags}
                    onChange={(v) =>
                      setNotifications((p) => ({ ...p, riskFlags: v }))
                    }
                  />
                  <ToggleRow
                    title="Payment reminders"
                    description="Reminders for upcoming tax payment deadlines"
                    checked={notifications.paymentReminders}
                    onChange={(v) =>
                      setNotifications((p) => ({ ...p, paymentReminders: v }))
                    }
                  />
                  <ToggleRow
                    title="FBR Connect updates"
                    description="Job status updates for portal automation"
                    checked={notifications.fbrConnect}
                    onChange={(v) =>
                      setNotifications((p) => ({ ...p, fbrConnect: v }))
                    }
                  />
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <div>
                {cardHeading(
                  "Security settings",
                  "Manage your password and authentication methods.",
                )}
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#376952]/10 text-[#376952]">
                        <ShieldCheck className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          Google authentication
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          You are signed in with Google
                        </div>
                      </div>
                    </div>
                    <span className="w-fit self-start rounded-full border border-[#376952]/30 bg-[#376952]/10 px-2.5 py-1 text-xs font-medium text-[#376952] sm:self-auto">
                      Active
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        Session management
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        View and manage active sessions
                      </div>
                    </div>
                    <button
                      type="button"
                      className="w-fit shrink-0 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      View sessions
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "practice" && (
              <div>
                {cardHeading(
                  "Practice preferences",
                  "Configure defaults for your tax practice.",
                )}
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>Default tax year</label>
                      <div className="relative">
                        <select
                          className={`${inputCls} appearance-none pr-9`}
                          value={practice.taxYear}
                          onChange={(e) =>
                            setPractice((p) => ({
                              ...p,
                              taxYear: e.target.value,
                            }))
                          }
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
                    <div>
                      <label className={labelCls}>Currency</label>
                      <input
                        className={`${inputCls} cursor-not-allowed bg-gray-50 text-gray-400`}
                        value={practice.currency}
                        disabled
                        readOnly
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <ToggleRow
                      title="Auto-generate packets"
                      description="Automatically generate filing packets when reconciliation is resolved"
                      checked={practice.autoGeneratePackets}
                      onChange={(v) =>
                        setPractice((p) => ({ ...p, autoGeneratePackets: v }))
                      }
                    />
                    <ToggleRow
                      title="Auto-advance draft status"
                      description="Automatically advance draft status when prerequisites are met"
                      checked={practice.autoAdvanceStatus}
                      onChange={(v) =>
                        setPractice((p) => ({ ...p, autoAdvanceStatus: v }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {activeTab !== "security" && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center md:pl-64">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex w-fit items-center justify-center gap-1.5 rounded-lg bg-[#376952] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2e5a44] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-[#376952]">
                <CheckCircle2 className="h-4 w-4" />
                Settings saved
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
