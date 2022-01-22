import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { generateMerkleProofs } from "../utils/mintlist";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const endTime = Math.ceil(+new Date() / 1000) + 1000 * 3600 * 5;

async function setupContract(root: string, endTime: number) {
  const nftFactory = await ethers.getContractFactory("OpenDAOMembershipNFT");
  const nft = await nftFactory.deploy(root, endTime, "");
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
      { wallet: alice.address, tier: 0 },
      { wallet: bob.address, tier: 1 },
      { wallet: charlie.address, tier: 2 },
      { wallet: david.address, tier: 3 },
      { wallet: eric.address, tier: 0 },
    ];

    tree = generateMerkleProofs(mintList);
  });

  describe("Constrcutor & Default Settings", () => {
    it("Constructor", async function () {
      const merkleRoot = tree.root;
      const nft = await setupContract(merkleRoot, endTime);

      expect(await nft._merkleRoot()).eq(merkleRoot);
      expect(await nft._claimEndTime()).eq(endTime);
    });
  });

  describe("claimMembershipNFTs(tier8,bytes32[])", () => {
    it("After claim period", async function test() {
      const nft = await setupContract(tree.root, 5000);

      const minterInfo = tree.proofs[alice.address];
      await expect(nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs))
        .to.be.revertedWith("OpenDAOMembershipNFT: claim period is over");
    });

    it("Invalid proof", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);

      const minterInfo = tree.proofs[alice.address];
      await expect(nft.connect(alice).claimMembershipNFTs(minterInfo.tier, ["0x636661383339613930663361353138616235666433393039612312313123abcd"]))
        .to.be.revertedWith("OpenDAOMembershipNFT: invalid merkle proof");
    });


    it("Claim again", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);

      const minterInfo = tree.proofs[alice.address];
      const mintTx = await nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);

      await expect(nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs))
        .to.be.revertedWith("OpenDAOMembershipNFT: already claimed");
    });

    it("Mint as Tier 0 user", async function test() {
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

    it("Mint as Tier 1 user", async function test() {
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

    it("Mint as Tier 2 user", async function test() {
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

    it("Mint as Tier 3 user", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);

      const minterInfo = tree.proofs[david.address];
      const mintTx = await nft.connect(david).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);

      const recipient = await mintTx.wait();
      expect(recipient.events?.length).eq(1);

      expect(mintTx).to.be
        .emit(nft, "TransferSingle")
        .withArgs(david.address, ZERO_ADDRESS, david.address, 3, 1);
    });

    it("Invalid tier", async function test() {
      const nft = await setupContract(tree.root, endTime + 10000000);
      const minterInfo = tree.proofs[david.address];

      await expect(nft.connect(david).claimMembershipNFTs(5, minterInfo.proofs))
        .to.be.revertedWith("OpenDAOMembershipNFT: invalid tier");
    });
  });

  describe("setURI(string)", () => {
    it("Normal", async function test() {
      const nft = await setupContract(tree.root, endTime);
      const minterInfo = tree.proofs[alice.address];
      await nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);

      await nft.connect(owner).setURI("testURI/");

      expect(await nft.uri(0)).eq("testURI/0.json");
      expect(await nft.uri(1)).eq("testURI/1.json");
      expect(await nft.uri(2)).eq("testURI/2.json");
      expect(await nft.uri(3)).eq("testURI/3.json");
    });

    it("Not owner", async function test() {
      const nft = await setupContract(tree.root, endTime);

      await expect(nft.connect(alice).setURI("testURI/"))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("setClaimEndTime(uint256) ", () => {
    it("Normal", async function test() {
      const nft = await setupContract(tree.root, 0);
      const minterInfo = tree.proofs[alice.address];

      await expect(nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs))
        .to.be.revertedWith("OpenDAOMembershipNFT: claim period is over");

      await nft.setClaimEndTime(endTime);
      expect(await nft._claimEndTime()).eq(endTime);

      await nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);
    });

    it("Not owner", async function test() {
      const nft = await setupContract(tree.root, endTime);

      await expect(nft.connect(alice).setClaimEndTime(10))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("setMerkleRoot(bytes32) ", () => {
    it("Normal", async function test() {
      const nft = await setupContract("0x429b9baa9907d39b9a0f3e30e0a097ed06d3777ad9f3fbfc5cf643ea198084f7", endTime);
      const minterInfo = tree.proofs[alice.address];

      await expect(nft.connect(alice).claimMembershipNFTs(minterInfo.tier, []))
      .to.be.revertedWith("OpenDAOMembershipNFT: invalid merkle proof");

      await expect(nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs))
        .to.be.revertedWith("OpenDAOMembershipNFT: invalid merkle proof");

      await nft.connect(owner).setMerkleRoot(tree.root);
      expect(await nft._merkleRoot()).eq(tree.root);
      await nft.connect(alice).claimMembershipNFTs(minterInfo.tier, minterInfo.proofs);
    });

    it("Not owner", async function test() {
      const nft = await setupContract(tree.root, endTime);

      await expect(nft.connect(alice).setMerkleRoot("0x429b9baa9907d39b9a0f3e30e0a097ed06d3777ad9f3fbfc5cf643ea198084f7"))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
