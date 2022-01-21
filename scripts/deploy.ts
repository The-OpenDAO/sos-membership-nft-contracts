import { ethers } from "hardhat";
import { run } from "hardhat"

async function main() {
  const nftFactory = await ethers.getContractFactory("OpenDAOMembershipNFT");

  const merkleRoot = "0xe4e21817a18d71541b9a59cdd6505952f28d7445dc631983d5f97b1f3a8ca07f";
  const endTime = 0;

  const nft = await nftFactory.deploy(merkleRoot, endTime);
  console.log("Deploy at tx %s", nft.deployTransaction.hash);

  await nft.deployed();
  console.log("Deploy to address %s", nft.address);

  await run("verify:verify", {
    address: nft.address,
    constructorArguments: [
      merkleRoot,
      endTime,
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
