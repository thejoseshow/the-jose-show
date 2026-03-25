"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UploadsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/import");
  }, [router]);
  return null;
}
