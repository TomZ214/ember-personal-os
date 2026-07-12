"use client";

import { forwardRef } from "react";

const base =
  "w-full rounded-[11px] border border-white/[0.09] bg-white/[0.05] px-3.5 text-sm text-ink placeholder:text-faint transition-colors duration-150 hover:border-white/[0.14] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${base} h-10 ${className}`} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...rest }, ref) {
    return <textarea ref={ref} className={`${base} py-2.5 leading-relaxed ${className}`} {...rest} />;
  },
);

export function Select({ className = "", children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${base} h-10 appearance-none pr-8 [&>option]:bg-[#1a1817] ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`mb-1.5 block text-[13px] font-medium text-muted ${className}`}>{children}</span>;
}
