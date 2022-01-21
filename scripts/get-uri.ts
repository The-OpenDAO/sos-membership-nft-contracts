import { ethers } from "hardhat";

async function main() {
  const nftFactory = await ethers.getContractFactory("OpenDAOMembershipNFT");
  const nft = nftFactory.attach(process.env.CONTRACT_ADDRESS as any);

  console.log("URI: %s", await nft.uri(0));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
