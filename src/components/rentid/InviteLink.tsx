import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/rentid/kit";

/**
 * The landlord's copy of the tenant's accept link. RentID has no outbound mail,
 * so this is the delivery mechanism: the landlord sends it over whatever channel
 * they already use with the tenant.
 */
export function InviteLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/invite?token=${encodeURIComponent(token)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some embedded webviews;
      // the input below is selectable, so the link is still reachable by hand.
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-xl border border-border bg-card/70 px-3 py-2 font-mono text-[11.5px] outline-none focus:border-brand/60"
        />
        <Button tone="secondary" size="sm" onClick={copy} className="shrink-0">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
