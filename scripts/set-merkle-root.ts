import { ethers } from "hardhat";

async function main() {
  const nftFactory = await ethers.getContractFactory("OpenDAOMembershipNFT");
  const nft = nftFactory.attach(process.env.CONTRACT_ADDRESS as any);

  console.log("Current merkle root: %s", await nft._merkleRoot());

  const tx = await nft.setMerkleRoot("");
  console.log("Tx: %s", tx.hash);

  await tx.wait();
  console.log("Merkle root is set to: %s", await nft._merkleRoot());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
