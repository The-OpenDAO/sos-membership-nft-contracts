import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { generateMerkleProofs } from "../utils/mintlist";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const endTime = Math.ceil(+new Date() / 1000) + 1000 * 3600 * 5;

async function setupContract(root: string, endTime: number) {
  const nftFactory = await ethers.getContractFactory("OpenDAOMembershipNFT");
  const nft = await nftFactory.deploy(root, endTime);
  await nft.deployed();

  return nft;
}

describe("OpenDAOMembershipNFT", function () {
  let tree: {
    root: string
    proofs: { [wallet: string]: { tier: number, proofs: string[] } },
  };

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let david: SignerWithAddress;
  let eric: SignerWithAddress;

  before(async function () {
    [owner, alice, bob, charlie, david, eric] = await ethers.getSigners();

    const mintList = [
      [alice.address, 0],
      [bob.address, 1],
      [charlie.address, 2],
      [david.address, 3],
      [eric.address, 0],
    ];

    tree = generateMerkleProofs(mintList as [string, number][]);
  });

  describe("Constrcutor & Default Settings", () => {
    it("Constructor", async function () {
      const markleRoot = tree.root;
      const nft = await setupContract(markleRoot, endTime);

      expect(await nft._markleRoot()).eq(markleRoot);
      expect(await nft._claimEndTime()).eq(endTime);
    });
  });

  describe.only("claimMembershipNFTs(tier8,bytes32[])", () => {
    it("After claim period", async function test() {
      const nft = await setupContract(tree.root, 5000);

      const minterInfo = tree.proofs[alice.address];
      await expect(nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs))
        .to.be.revertedWith("OpenDAOMembershipNFT: Claim period is over");
    });

    it("Invalid proof", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);

      const minterInfo = tree.proofs[alice.address];
      await expect(nft.connect(alice).claimMembershipNFTs(minterInfo.tier, ["0x636661383339613930663361353138616235666433393039612312313123abcd"]))
        .to.be.revertedWith("OpenDAOMembershipNFT: Invalid Markle Proof");
    });


    it("Claim again", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);

      const minterInfo = tree.proofs[alice.address];
      const mintTx = await nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);

      await expect(nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs))
        .to.be.revertedWith("OpenDAOMembershipNFT: Already claimed");
    });

    it("Successfully mint as Tier 0 user", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);

      const minterInfo = tree.proofs[alice.address];
      const mintTx = await nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);

      const recipient = await mintTx.wait();
      expect(recipient.events?.length).eq(4);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(alice.address, ZERO_ADDRESS, alice.address, 0, 1);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(alice.address, ZERO_ADDRESS, alice.address, 1, 1);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(alice.address, ZERO_ADDRESS, alice.address, 2, 1);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(alice.address, ZERO_ADDRESS, alice.address, 3, 1);
    });

    it("Successfully mint as Tier 1 user", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);

      const minterInfo = tree.proofs[bob.address];
      const mintTx = await nft.connect(bob).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);

      const recipient = await mintTx.wait();
      expect(recipient.events?.length).eq(3);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(bob.address, ZERO_ADDRESS, bob.address, 1, 1);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(bob.address, ZERO_ADDRESS, bob.address, 2, 1);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(bob.address, ZERO_ADDRESS, bob.address, 3, 1);
    });

    it("Successfully mint as Tier 2 user", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);

      const minterInfo = tree.proofs[charlie.address];
      const mintTx = await nft.connect(charlie).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);

      const recipient = await mintTx.wait();
      expect(recipient.events?.length).eq(2);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(charlie.address, ZERO_ADDRESS, charlie.address, 2, 1);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(charlie.address, ZERO_ADDRESS, charlie.address, 3, 1);
    });

    it("Successfully mint as Tier 3 user", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);

      const minterInfo = tree.proofs[david.address];
      const mintTx = await nft.connect(david).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);

      const recipient = await mintTx.wait();
      expect(recipient.events?.length).eq(1);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(david.address, ZERO_ADDRESS, david.address, 3, 1);
    });
  });
});
