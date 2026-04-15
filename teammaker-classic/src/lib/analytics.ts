"use client";

import * as amplitude from "@amplitude/analytics-browser";

const AMPLITUDE_API_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY || "";

let initialized = false;
let initPromise: Promise<void> | null = null;

export function initAnalytics(): Promise<void> {
  if (initialized || !AMPLITUDE_API_KEY) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = amplitude
    .init(AMPLITUDE_API_KEY, undefined, { autocapture: false })
    .promise.then(() => {
      initialized = true;
    })
    .catch((error) => {
      console.warn("[analytics] init failed", error);
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

if (typeof window !== "undefined") {
  initAnalytics();
}

export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean>,
) {
  if (!AMPLITUDE_API_KEY) return;
  if (initialized) {
    amplitude.track(event, properties);
    return;
  }
  void initAnalytics().then(() => {
    if (initialized) amplitude.track(event, properties);
  });
}
