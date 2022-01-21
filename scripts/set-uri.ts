import { ethers } from "hardhat";

async function main() {
  const nftFactory = await ethers.getContractFactory("OpenDAOMembershipNFT");
  const nft = nftFactory.attach(process.env.CONTRACT_ADDRESS as any);

  const tx = await nft.setURI("https://raw.githubusercontent.com/The-OpenDAO/sos-membership-nft-contracts/main/metadata/json/");
  console.log("Tx: %s", tx.hash);
  await tx.wait();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
