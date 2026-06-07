"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Shield } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import PermissionManager from "@/components/settings/PermissionManager";

export default function PermissionsPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="권한 관리" />
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/hub")}
            className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> 사무실로
          </button>
          <div className="ml-auto flex items-center gap-1.5 text-[12px] text-sky-300">
            <Shield className="w-4 h-4" /> 권한 관리
          </div>
        </div>
        <PermissionManager />
      </main>
    </div>
  );
}
