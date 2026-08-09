"use client";

import { MotionConfig } from "framer-motion";
import { EASE } from "@/lib/motion";

export default function MotionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 1.1, ease: EASE }}
    >
      {children}
    </MotionConfig>
  );
}
