import hre from "hardhat";

async function main() {
  const contractAddress = process.env.NFT_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("NFT_CONTRACT_ADDRESS env var is not set");
  }

  const minterPrivKey = process.env.NFT_MINTER_PRIVATE_KEY;
  if (!minterPrivKey) {
    throw new Error("NFT_MINTER_PRIVATE_KEY env var is not set");
  }

  const feeRecipientAddress = process.env.FEE_RECIPIENT_ADDRESS;
  if (!feeRecipientAddress) {
    throw new Error("FEE_RECIPIENT_ADDRESS env var is not set (deployer address used at deploy time)");
  }

  const { ethers } = hre;
  const minterSigner = new ethers.Wallet(minterPrivKey).address;
  const mintFee = ethers.parseEther("0.0005");

  console.log("Verifying KiutSoulbound at:", contractAddress);
  console.log("Constructor args:");
  console.log("  minterSigner:", minterSigner);
  console.log("  feeRecipient:", feeRecipientAddress);
  console.log("  mintFee:", ethers.formatEther(mintFee), "ETH");

  await hre.run("verify:verify", {
    address: contractAddress,
    constructorArguments: [minterSigner, feeRecipientAddress, mintFee],
  });

  console.log("\nVerification complete!");
  console.log(`View on explorer: https://explorer.inkonchain.com/address/${contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
