"use client";

import { motion } from "framer-motion";
import { fadeVariants, riseVariants, viewportOnce } from "@/lib/motion";

/** A masked line of display type that rises into place. */
export function RiseLine({
  children,
  index = 0,
  className = "",
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <motion.span
      className="block overflow-hidden pb-[0.08em]"
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      <motion.span
        className={`block ${className}`}
        variants={riseVariants}
        custom={index}
      >
        {children}
      </motion.span>
    </motion.span>
  );
}

/** Quiet supporting copy / metadata. */
export function Fade({
  children,
  index = 0,
  className = "",
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeVariants}
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.4 }}
    >
      {children}
    </motion.div>
  );
}

export function Label({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`label ${className}`}>{children}</span>;
}
