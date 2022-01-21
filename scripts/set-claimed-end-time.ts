import { ethers } from "hardhat";

async function main() {
  const nftFactory = await ethers.getContractFactory("OpenDAOMembershipNFT");
  const nft = nftFactory.attach(process.env.CONTRACT_ADDRESS as any);

  console.log("Current claim end time: %s", await nft._claimEndTime());

  const tx = await nft.setClaimEndTime(Math.ceil(+new Date() / 1000) + 3600);
  console.log("Tx: %s", tx.hash);

  await tx.wait();
  console.log("Claim end time is set to: %s", await nft._claimEndTime());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
