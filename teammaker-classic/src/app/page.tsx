"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore } from "@/stores/settingsStore";
import { trackEvent } from "@/lib/analytics";

export default function Home() {
  const router = useRouter();
  const isApiKeyValid = useSettingsStore((s) => s.isApiKeyValid);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    trackEvent("app_launched");
    loadSettings().then(() => setLoaded(true));
  }, [loadSettings]);

  useEffect(() => {
    if (!loaded) return;
    if (isApiKeyValid) {
      router.replace("/office");
    } else {
      router.replace("/setup");
    }
  }, [loaded, isApiKeyValid, router]);

  return null;
}
