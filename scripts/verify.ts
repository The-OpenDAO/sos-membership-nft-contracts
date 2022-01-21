import { ethers } from "hardhat";
import { run } from "hardhat"

async function main() {
  const merkleRoot = "0xe4e21817a18d71541b9a59cdd6505952f28d7445dc631983d5f97b1f3a8ca07f";
  const endTime = 0;

  await run("verify:verify", {
    address: "0x9d0541222774B7F7056C79Cd78FCe8227664a70C",
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
