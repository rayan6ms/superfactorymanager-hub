"use client";

import GoogleAdSlot from "@/components/ads/GoogleAdSlot";

type Placement = "desktop-rails" | "mobile-top" | "mobile-bottom";

type AdsShellProps = {
  placement?: Placement;
};

export default function AdsShell({ placement = "desktop-rails" }: AdsShellProps) {
  const adsEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT);
  if (!adsEnabled) return null;

  if (placement === "mobile-top") {
    return (
      <div className="mb-4 lg:hidden">
        <GoogleAdSlot
          className="min-h-30 w-full"
          slot="3606815892"
          format="auto"
          fullWidthResponsive
          layoutKey="mobile-top"
        />
      </div>
    );
  }

  if (placement === "mobile-bottom") {
    return (
      <div className="mt-6 lg:hidden">
        <GoogleAdSlot
          className="min-h-30 w-full"
          slot="7536669655"
          format="auto"
          fullWidthResponsive
          layoutKey="mobile-bottom"
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden xl:block">
      {/* Desktop side rails aligned to content wrapper */}
      <div className="pointer-events-auto absolute left-0 top-1/2 -translate-x-[calc(100%+1rem)] -translate-y-1/2">
        <GoogleAdSlot
          className="h-150 w-40"
          slot="6232979234"
          format="fixed"
          width={160}
          height={600}
        />
      </div>

      <div className="pointer-events-auto absolute right-0 top-1/2 translate-x-[calc(100%+1rem)] -translate-y-1/2">
        <GoogleAdSlot
          className="h-150 w-40"
          slot="5105947433"
          format="fixed"
          width={160}
          height={600}
        />
      </div>
    </div>
  );
}
