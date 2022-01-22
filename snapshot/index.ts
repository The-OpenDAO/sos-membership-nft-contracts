import { Log } from "@ethersproject/abstract-provider";
import * as dotenv from "dotenv";
import { BigNumber, ethers, providers } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { generateMerkleProofs } from "../utils/mintlist";

dotenv.config();

interface ERC20TransferArgs {
  from: string;
  to: string;
  value: BigNumber;
}

const OUTPUT_BALANCE = join(__dirname, "balances.json");
const OUTPUT_PROOF_DIR = join(__dirname, "proofs");
const OUTPUT_MINTLIST_PROOFS = join(OUTPUT_PROOF_DIR, "tree.json");
const ERC20_ABI_SLIM = ["event Transfer(address indexed from, address indexed to, uint value)"];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const VESOS_ADDRESS = "0xedd27c961ce6f79afc16fd287d934ee31a90d7d1";
const START_BLOCK = 13938731;
const END_BLOCK = 14029361; // Jan-18-2022 12:00:02 PM +UTC

function getPercentiles(data: BigNumber[], percentiles: number[]): BigNumber[] {
  data = data.slice();
  data.sort((a, b) => {
    const delta = b.sub(a);
    return delta.isZero()
      ? 0
      : delta.isNegative() ? -1 : 1;
  });

  const result = percentiles.map(p => data[Math.ceil(data.length * (1 - p / 100)) - 1]);
  return result;
}

async function getBalances() {
  const iface = new ethers.utils.Interface(ERC20_ABI_SLIM);
  const provider = new providers.JsonRpcProvider(process.env.MAINNET_URL);

  const batchSize = 1000;
  let startBlock = START_BLOCK;

  const balancesByAddress: { [wallet: string]: BigNumber } = {};

  while (startBlock <= END_BLOCK) {
    const blocksToGet = Math.min(END_BLOCK - startBlock + 1, batchSize);
    const toBlock = startBlock + blocksToGet - 1;

    const logs = await provider.getLogs({
      fromBlock: startBlock,
      toBlock: toBlock,
      address: VESOS_ADDRESS,
      topics: [[iface.getEventTopic("Transfer")]],
    });

    const logsByBlocks: { [block: number]: Log[] } = {};

    for (const log of logs) {
      if (!logsByBlocks[log.blockNumber]) logsByBlocks[log.blockNumber] = [];

      logsByBlocks[log.blockNumber].push(log);
    }

    for (const block in logsByBlocks) {
      logsByBlocks[block].sort((a, b) => {
        return a.logIndex - b.logIndex;
      });
    }

    for (let block = startBlock; block <= toBlock; block++) {
      if (!logsByBlocks[block]) continue;

      for (const log of logsByBlocks[block]) {
        const event = iface.parseLog(log);
        const args = event.args as any as ERC20TransferArgs;

        console.log("[%d|%s] Transfer %d from %s to %s",
          log.blockNumber,
          log.logIndex.toString().padStart(3),
          args.value.toString(),
          args.from,
          args.to);

        if (args.from != ZERO_ADDRESS) {
          balancesByAddress[args.from] = balancesByAddress[args.from].sub(args.value);
        }

        balancesByAddress[args.to] = (balancesByAddress[args.to] ?? BigNumber.from(0)).add(args.value);
      }
    }

    startBlock += blocksToGet;
  }

  for (const wallet in balancesByAddress) {
    if (balancesByAddress[wallet].isZero()) {
      delete balancesByAddress[wallet];
    }
  }

  delete balancesByAddress[ZERO_ADDRESS];

  return balancesByAddress;
}

function loadBalances() {
  const balancesByAddress: { [wallet: string]: BigNumber } = {};

  for (const balance of JSON.parse(readFileSync(OUTPUT_BALANCE).toString())) {
    balancesByAddress[balance[0]] = BigNumber.from(balance[1]);
  }

  return balancesByAddress;
}

async function writeBalanceSnapshot(balances: { [wallet: string]: BigNumber }) {
  const list = [];

  for (const wallet in balances) {
    list.push([wallet, balances[wallet].toString()]);
  }

  list.sort((a, b) => a[0].localeCompare(b[0]));

  writeFileSync(OUTPUT_BALANCE, JSON.stringify(list, null, "  "));
}

async function main() {
  let balances: { [wallet: string]: BigNumber };

  if (existsSync(OUTPUT_BALANCE)) {
    balances = loadBalances();
  } else {
    balances = await getBalances();
    writeBalanceSnapshot(balances);
  }

  const balanceArray: BigNumber[] = [];
  for (const wallet in balances) {
    balanceArray.push(balances[wallet]);
  }
  const tierThresholds = getPercentiles(balanceArray, [90, 75, 50, 25]);
  const tierCount: number[] = Array(tierThresholds.length).fill(0);
  const mintList = [];

  for (const wallet in balances) {
    const balance = balances[wallet];

    for (let tier = 0; tier < tierThresholds.length; tier++) {
      if (balance.gte(tierThresholds[tier])) {
        mintList.push({ wallet, tier });
        tierCount[tier]++;
        break;
      }
    }
  }

  mintList.sort((a, b) => a.wallet.localeCompare(b.wallet));

  const tree = generateMerkleProofs(mintList);
  writeFileSync(OUTPUT_MINTLIST_PROOFS, JSON.stringify(tree, null, "  "));

  const proofsByWalletPrefixes: { [walletPrefix: string]: { [wallet: string]: { proofs: string[]; tier: number } } } = {};
  for (const wallet in tree.proofs) {
    const prefix = wallet.substring(0, 4).toLowerCase();
    if (!proofsByWalletPrefixes[prefix]) proofsByWalletPrefixes[prefix] = {};

    proofsByWalletPrefixes[prefix][wallet.toLowerCase()] = tree.proofs[wallet];
  }

  for (const prefix in proofsByWalletPrefixes) {
    const outputFile = join(OUTPUT_PROOF_DIR, prefix + ".json");
    writeFileSync(outputFile, JSON.stringify(proofsByWalletPrefixes[prefix], null, "  "));
  }

  console.log("\r\n\r\n===================================");
  console.log("Snapshot taken");
  console.log("Start block:", START_BLOCK);
  console.log("  End block:", END_BLOCK);
  console.log("   Eligible: %d addresses", tierCount.reduce((prev, curr) => prev + curr, 0));

  for (let tier = 0; tier < tierThresholds.length; tier++) {
    console.log("     Tier %d: %s. Threshold: %s",
      tier,
      tierCount[tier].toString().padStart(2, "0"),
      ethers.utils.formatEther(tierThresholds[tier]));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(-1);
  });
