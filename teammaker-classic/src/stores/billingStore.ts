import { create } from "zustand";
import { persist } from "zustand/middleware";

export const FREE_SESSION_LIMIT = 3;
export const PRO_SESSION_LIMIT = Number.MAX_SAFE_INTEGER;

export type BillingStatus = "free" | "pending" | "active";

interface BillingState {
  status: BillingStatus;
  licenseKey: string;
  instanceId: string;
  deviceId: string;
  purchaseEmail: string;
  lastCheckoutStartedAt: number | null;
  activatedAt: number | null;
  saveLicenseKey: (key: string) => void;
  saveInstanceId: (id: string) => void;
  getOrCreateDeviceId: () => string;
  savePurchaseEmail: (email: string) => void;
  markCheckoutStarted: () => void;
  activateLocally: () => void;
  resetBillingState: () => void;
  getSessionLimit: () => number;
  hasPro: () => boolean;
}

export const useBillingStore = create<BillingState>()(
  persist(
    (set, get) => ({
      status: "free",
      licenseKey: "",
      instanceId: "",
      deviceId: "",
      purchaseEmail: "",
      lastCheckoutStartedAt: null,
      activatedAt: null,

      saveLicenseKey: (key) => {
        set({ licenseKey: key.trim() });
      },

      saveInstanceId: (id) => {
        set({ instanceId: id });
      },

      getOrCreateDeviceId: () => {
        const existing = get().deviceId;
        if (existing) return existing;
        const id = crypto.randomUUID();
        set({ deviceId: id });
        return id;
      },

      savePurchaseEmail: (email) => {
        set({ purchaseEmail: email.trim() });
      },

      markCheckoutStarted: () => {
        set({ lastCheckoutStartedAt: Date.now() });
      },

      activateLocally: () => {
        set({ status: "active", activatedAt: Date.now() });
        import("@/lib/analytics").then(({ trackEvent }) => trackEvent("license_activated"));
      },

      resetBillingState: () => {
        set({
          status: "free",
          licenseKey: "",
          instanceId: "",
          purchaseEmail: "",
          lastCheckoutStartedAt: null,
          activatedAt: null,
        });
      },

      getSessionLimit: () => (get().status === "active" ? PRO_SESSION_LIMIT : FREE_SESSION_LIMIT),
      hasPro: () => get().status === "active",
    }),
    { name: "teammaker-billing" },
  ),
);
