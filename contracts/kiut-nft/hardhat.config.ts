import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    inkonchain: {
      url: "https://rpc-gel.inkonchain.com",
      accounts: deployerKey ? [deployerKey] : [],
      chainId: 57073,
    },
  },
  etherscan: {
    apiKey: {
      inkonchain: process.env.BLOCKSCOUT_API_KEY ?? "placeholder",
    },
    customChains: [
      {
        network: "inkonchain",
        chainId: 57073,
        urls: {
          apiURL: "https://explorer.inkonchain.com/api",
          browserURL: "https://explorer.inkonchain.com",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};

export default config;
