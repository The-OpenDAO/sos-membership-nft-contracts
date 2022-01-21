import { ethers } from "hardhat";

async function main() {
  const nftFactory = await ethers.getContractFactory("OpenDAOMembershipNFT");
  const nft = nftFactory.attach(process.env.CONTRACT_ADDRESS as any);

  const tx = await nft.claimMembershipNFTs(
    0,
    [
      "0x42097ccb41d042fc9051d2af5589ae62a9c0712f44df0af42116c519e948d497",
      "0xd0b13c01c674dda1c7b8870eb2c03b0c9ef5ea6bbe08c587bbd0b27f2e59653e",
      "0xe33a98dca3d90eb6aed7872f0287bf9e2a8f1771e65ce56fdb46655bbeaa1c79",
      "0xe3d6b22e3835c788bc27a2000adb1366feaeaa61759d0a0b12f4edfe4fc3ef72",
      "0xf212077cc2d4d47f104d48ee5b6a523092c3a4a68b4f9bc6efe111dc7e0bdcb4",
      "0xdcf65e316baa7f1f88aeec6d8d846dce35b38a6f3b70dec304131e84f73dbd8b",
      "0x918963c55a91003728877d4a4daac97e997a1ec0851df3bdfdfb8bd0195ee98a",
      "0xec971c57dd4c01281c595179c60a88797af155e5f7c95185ee2393e458d3e918",
      "0x5d41a82827595807aed6eb32e71a04eadd75326d2b7630e40ede1ead2d2df1a9",
      "0x6c473409e9c8c7b79640458a57f54bbe8d1ee3a77108c1dbd17581e98f4c5333"
    ]);
  console.log("Tx: %s", tx.hash);
  await tx.wait();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
