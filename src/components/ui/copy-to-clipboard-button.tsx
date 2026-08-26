import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface CopyToClipboardButtonProps {
  value: string;
  className?: string;
  tooltip?: string;
  copiedTooltip?: string;
  ariaLabel?: string;
  onCopy?: () => void;
  onError?: (error: unknown) => void;
  disableTooltip?: boolean;
}

const COPY_RESET_DELAY = 1400;

/**
 * Minimal icon-only copy button tailored for inline explanation blocks.
 */
export const CopyToClipboardButton: React.FC<CopyToClipboardButtonProps> = ({
  value,
  className,
  tooltip = "Copy explanation",
  copiedTooltip = "Copied",
  ariaLabel = "Copy explanation",
  onCopy,
  onError,
  disableTooltip = false,
}) => {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
  }, []);

  const handleCopyFailure = useCallback(
    (error: unknown) => {
      toast({
        title: "Copy failed",
        description: "Your browser blocked the clipboard request.",
        variant: "destructive",
      });
      onError?.(error);
    },
    [onError, toast],
  );

  const handleCopy = useCallback(async () => {
    if (!value || !value.trim()) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      handleCopyFailure(new Error("Clipboard API unavailable"));
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy?.();
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, COPY_RESET_DELAY);
    } catch (error) {
      handleCopyFailure(error);
    }
  }, [handleCopyFailure, onCopy, value]);

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      aria-label={ariaLabel}
      className={cn(
        "h-8 w-8 rounded-full border border-transparent text-muted-foreground hover:border-border hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 transition",
        "print:hidden",
        copied ? "text-emerald-600 hover:text-emerald-700" : null,
        className,
      )}
    >
      <span className="sr-only">{copied ? copiedTooltip : tooltip}</span>
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </Button>
  );

  if (disableTooltip) {
    return button;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent className="px-2 py-1 text-xs">
          {copied ? copiedTooltip : tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

CopyToClipboardButton.displayName = "CopyToClipboardButton";
