import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';

export const inkonchain = defineChain({
  id: 57073,
  name: 'Ink',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-gel.inkonchain.com'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.inkonchain.com' },
  },
});

export const wagmiConfig = getDefaultConfig({
  appName: 'KIUT',
  projectId: 'kiut-verification-demo',
  chains: [inkonchain],
  ssr: false,
});
