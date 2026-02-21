"use client";

import GoogleAdSlot from "@/components/ads/GoogleAdSlot";

type Placement = "desktop-rails" | "mobile-top" | "mobile-bottom";

type AdsShellProps = {
  placement?: Placement;
  adsEnabled?: boolean;
};

export default function AdsShell({ placement = "desktop-rails", adsEnabled: adsEnabledProp }: AdsShellProps) {
  const adsEnabled = adsEnabledProp ?? !!process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;
  if (!adsEnabled) return null;

  if (placement === "mobile-top") {
    return (
      <>
        <div className="-mx-5 mb-4 min-[640px]:hidden">
          <GoogleAdSlot
            className="mx-auto h-[50px] w-[320px]"
            slot="3606815892"
            format="fixed"
            fullWidthResponsive={false}
            width={320}
            height={50}
            layoutKey="mobile-top-phone"
          />
        </div>
        <div className="mb-4 hidden min-[640px]:block min-[1512px]:hidden">
          <GoogleAdSlot
            className="min-h-[72px] w-full"
            slot="3606815892"
            format="horizontal"
            fullWidthResponsive
            layoutKey="mobile-top"
          />
        </div>
      </>
    );
  }

  if (placement === "mobile-bottom") {
    return (
      <>
        <div className="-mx-5 mt-6 min-[640px]:hidden">
          <GoogleAdSlot
            className="mx-auto h-[50px] w-[320px]"
            slot="7536669655"
            format="fixed"
            fullWidthResponsive={false}
            width={320}
            height={50}
            layoutKey="mobile-bottom-phone"
          />
        </div>
        <div className="mt-6 hidden min-[640px]:block min-[1512px]:hidden">
          <GoogleAdSlot
            className="min-h-[72px] w-full"
            slot="7536669655"
            format="horizontal"
            fullWidthResponsive
            layoutKey="mobile-bottom"
          />
        </div>
      </>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-20 hidden min-[1512px]:block" aria-hidden="true">
      {/* Desktop side rails pinned to viewport so they stay visible while scrolling */}
      <div
        className="pointer-events-auto fixed top-[50vh] -translate-y-1/2"
        style={{
          left: "max(0.5rem, calc((100vw - min(100vw, 72rem)) / 2 - 10rem - clamp(0.5rem, (100vw - 1512px) / 8, 2.5rem)))",
        }}
      >
        <GoogleAdSlot
          className="h-[600px] w-[160px]"
          slot="6232979234"
          format="fixed"
          width={160}
          height={600}
        />
      </div>

      <div
        className="pointer-events-auto fixed top-[50vh] -translate-y-1/2"
        style={{
          right: "max(0.5rem, calc((100vw - min(100vw, 72rem)) / 2 - 10rem - clamp(0.5rem, (100vw - 1512px) / 8, 2.5rem)))",
        }}
      >
        <GoogleAdSlot
          className="h-[600px] w-[160px]"
          slot="5105947433"
          format="fixed"
          width={160}
          height={600}
        />
      </div>
    </div>
  );
}
