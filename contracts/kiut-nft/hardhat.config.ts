import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

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
};

export default config;
