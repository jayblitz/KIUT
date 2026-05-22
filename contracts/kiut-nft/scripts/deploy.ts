import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log("Deploying KiutSoulbound with account:", deployerAddress);

  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const minterPrivKey = process.env.NFT_MINTER_PRIVATE_KEY;
  if (!minterPrivKey) {
    throw new Error("NFT_MINTER_PRIVATE_KEY env var is not set");
  }

  const minterSigner = new ethers.Wallet(minterPrivKey).address;
  const feeRecipient = deployerAddress;
  const mintFee = ethers.parseEther("0.0005"); // ~$1 at $2000 ETH

  console.log("Minter signer address:", minterSigner);
  console.log("Fee recipient:", feeRecipient);
  console.log("Mint fee:", ethers.formatEther(mintFee), "ETH");

  const KiutSoulbound = await ethers.getContractFactory("KiutSoulbound");
  const contract = await KiutSoulbound.deploy(minterSigner, feeRecipient, mintFee);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\nKiutSoulbound deployed to:", contractAddress);
  console.log("\n=== Add this to your Replit Secrets ===");
  console.log(`NFT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("=======================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
