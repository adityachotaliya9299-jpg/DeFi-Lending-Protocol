"use client";

import { PauseBanner }    from "./PauseBanner";
import { WrongNetworkBanner } from "./WrongNetwork";

export function ClientBanners() {
  return (
    <>
      <WrongNetworkBanner />
      <PauseBanner />
    </>
  );
}