import { ethers } from "hardhat";
import { run } from "hardhat"

async function main() {
  const nftFactory = await ethers.getContractFactory("OpenDAOMembershipNFT");

  const merkleRoot = "0xac7bed30976a9e81a333313a62bf9fc12c479b9250fc39f0fa061bf5fc2e0383";
  const endTime = 0;
  const url = "https://raw.githubusercontent.com/The-OpenDAO/sos-membership-nft-contracts/main/metadata/json/";

  const nft = await nftFactory.deploy(
    merkleRoot,
    endTime,
    url);
  console.log("Deploy at tx %s", nft.deployTransaction.hash);

  await nft.deployed();
  console.log("Deploy to address %s", nft.address);

  await run("verify:verify", {
    address: "0xd22f83e8A1502B1d41c0b40cF64B291a6eaBC44d",
    constructorArguments: [
      merkleRoot,
      endTime,
      url,
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
