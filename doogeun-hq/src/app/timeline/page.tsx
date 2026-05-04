"use client";

import { useRouter } from "next/navigation";
import TimelineModal from "@/components/TimelineModal";

/** /timeline 직접 URL 진입(외부 링크/북마크) 용 — TimelineModal 재사용 + 닫으면 hub 로 이동 */
export default function TimelinePage() {
  const router = useRouter();
  return <TimelineModal open={true} onClose={() => router.push("/hub")} />;
}
