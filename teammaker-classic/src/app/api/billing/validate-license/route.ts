import { NextRequest, NextResponse } from "next/server";

const rateLimit = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per window

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimit.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(now);
  rateLimit.set(ip, recent);
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ valid: false, error: "rate_limited" }, { status: 429 });
  }

  const { licenseKey, instanceName } = await req.json();

  if (!licenseKey || typeof licenseKey !== "string") {
    return NextResponse.json({ valid: false, error: "missing_key" }, { status: 400 });
  }

  const instance = typeof instanceName === "string" ? instanceName.slice(0, 255) : "unknown";

  try {
    // First try to activate on this device
    const activateRes = await fetch("https://api.lemonsqueezy.com/v1/licenses/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_name: instance,
      }),
    });

    const activateData = await activateRes.json();

    if (activateData.activated) {
      return NextResponse.json({
        valid: true,
        instanceId: activateData.instance?.id,
        customerName: activateData.meta?.customer_name,
        customerEmail: activateData.meta?.customer_email,
      });
    }

    // If already activated on this device, validate instead
    if (activateData.error?.includes("already been activated")) {
      const validateRes = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          license_key: licenseKey,
          instance_name: instance,
        }),
      });

      const validateData = await validateRes.json();

      if (validateData.valid) {
        return NextResponse.json({
          valid: true,
          customerName: validateData.meta?.customer_name,
          customerEmail: validateData.meta?.customer_email,
        });
      }
    }

    return NextResponse.json({
      valid: false,
      error: activateData.error || "invalid_key",
    });
  } catch {
    return NextResponse.json({ valid: false, error: "network_error" }, { status: 500 });
  }
}
