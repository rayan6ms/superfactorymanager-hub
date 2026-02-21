"use client";

import GoogleAdSlot from "@/components/ads/GoogleAdSlot";

export default function AdsShell() {
  const adsEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT);
  if (!adsEnabled) return null;

  return (
    <>
      {/* Desktop side rails */}
      <div className="fixed left-4 top-1/2 z-20 hidden -translate-y-1/2 xl:block">
        <GoogleAdSlot
          className="h-150 w-40"
          slot="6232979234"
          format="fixed"
          width={160}
          height={600}
        />
      </div>

      <div className="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 xl:block">
        <GoogleAdSlot
          className="h-150 w-40"
          slot="5105947433"
          format="fixed"
          width={160}
          height={600}
        />
      </div>

      {/* Mobile top/bottom */}
      <div className="fixed inset-x-0 top-0 z-20 px-2 sm:px-4 lg:hidden">
        <GoogleAdSlot
          className="min-h-30 w-full"
          slot="3606815892"
          format="auto"
          fullWidthResponsive
          layoutKey="mobile-top"
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 px-2 pb-2 sm:px-4 lg:hidden">
        <GoogleAdSlot
          className="min-h-30 w-full"
          slot="7536669655"
          format="auto"
          fullWidthResponsive
          layoutKey="mobile-bottom"
        />
      </div>
    </>
  );
}
