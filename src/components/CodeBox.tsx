"use client";
import { useEffect, useState } from "react";

export function CodeBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [code, setCode] = useState(value);
  useEffect(() => setCode(value), [value]);
  return (
    <textarea
      className="font-mono surface-2 border border-base-700/70 rounded-xl p-3 w-full h-64 focus:ring-2 focus:ring-brand-400"
      value={code}
      onChange={(e) => { setCode(e.target.value); onChange(e.target.value); }}
      placeholder="// paste your code here"
    />
  );
}
