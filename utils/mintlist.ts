import { keccak256, solidityKeccak256 } from "ethers/lib/utils";
import MerkleTree from "merkletreejs";

export interface Minter {
  wallet: string;
  tier: number;
}

const allowedTiers = new Set([0, 1, 2, 3]);

function getLeaf(wallet: string, tier: number) {
  return Buffer.from(
    solidityKeccak256(["address", "uint8"], [wallet, tier]).substring(2),
    "hex");
}

export function generateMerkleProofs(mintList: Minter[]) {
  const duplicatedWallets = new Set<string>();

  const leafNodes = mintList.map(({wallet, tier}, index) => {
    if (duplicatedWallets.has(wallet)) {
      console.error("MintList #%s: wallet %s is duplicated", index, wallet);
      process.exit(-1);
    }

    if (!allowedTiers.has(tier)) {
      console.error("MintList #%s: tier %d is not allowed", index, tier);
      process.exit(-1);
    }

    duplicatedWallets.add(wallet);
    return getLeaf(wallet, tier);
  });

  const tree = new MerkleTree(
    leafNodes,
    (digest: Buffer) => Buffer.from(keccak256("0x" + digest.toString("hex")).substring(2), "hex"),
    { sortPairs: true });
  const proofs = {} as { [wallet: string]: { tier: number, proofs: string[] } };

  mintList.forEach(({wallet, tier}, index) => {
    const leaf = leafNodes[index];
    proofs[wallet] = { tier, proofs: tree.getHexProof(leaf) };
  });

  return {
    root: tree.getHexRoot(),
    proofs,
  };
}