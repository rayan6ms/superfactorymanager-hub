"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";

interface CopyCodeButtonProps {
  value: string;
  className?: string;
}

export default function CopyCodeButton({ value, className }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Unable to copy code", error);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={className}
      onClick={handleCopy}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : "Copy code"}
    </Button>
  );
}
