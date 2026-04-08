import { AssetInfo } from "@/types";

// Supported assets — icons from public/icons/ (add svg files there)
// or use any CDN icon URL
export const SUPPORTED_ASSETS: AssetInfo[] = [
  {
    address: "0x0" as `0x${string}`, // resolved at runtime from NEXT_PUBLIC_WETH
    symbol:   "WETH",
    name:     "Wrapped Ether",
    decimals: 18,
    icon:     "https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=029",
  },
  {
    address: "0x0" as `0x${string}`, // resolved at runtime from NEXT_PUBLIC_USDC
    symbol:   "USDC",
    name:     "USD Coin",
    decimals: 6,
    icon:     "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=029",
  },
  {
    address: "0x0" as `0x${string}`, // resolved at runtime from NEXT_PUBLIC_LINK
    symbol:   "LINK",
    name:     "Chainlink",
    decimals: 18,
    icon:     "https://cryptologos.cc/logos/chainlink-link-logo.svg?v=029",
  },
];