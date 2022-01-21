import { Log } from "@ethersproject/abstract-provider";
import * as dotenv from "dotenv";
import { BigNumber, ethers, providers, Wallet } from "ethers";
import { writeFileSync } from "fs";
import { join } from "path";
import { generateMerkleProofs } from "../utils/mintlist";

dotenv.config();

interface ERC20TransferArgs {
  from: string;
  to: string;
  value: BigNumber;
}

const OUTPUT_BALANCE = join(__dirname, "./balances.json");
const OUTPUT_MINTLIST_PROOFS = join(__dirname, "./mintlist-proofs.json");
const ERC20_ABI_SLIM = ["event Transfer(address indexed from, address indexed to, uint value)"];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const VESOS_ADDRESS = "0xedd27c961ce6f79afc16fd287d934ee31a90d7d1";
const START_BLOCK = 13938731;
const END_BLOCK = 14029361; // Jan-18-2022 12:00:02 PM +UTC

const TIER0_THRESHOLD = ethers.utils.parseEther("638056875.1");
const TIER1_THRESHOLD = ethers.utils.parseEther("302869313.5");
const TIER2_THRESHOLD = ethers.utils.parseEther("94020331.41");
const TIER3_THRESHOLD = ethers.utils.parseEther("30121665.35");

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

async function writeBalanceSnapshot(balances: { [wallet: string]: BigNumber }) {
  const list = [];

  for (const wallet in balances) {
    list.push([wallet, balances[wallet].toString()]);
  }

  list.sort((a, b) => a[0].localeCompare(b[0]));

  writeFileSync(OUTPUT_BALANCE, JSON.stringify(list, null, "  "));
}

async function main() {
  const balances = await getBalances();
  writeBalanceSnapshot(balances);

  let tier0WalletCount = 0;
  let tier1WalletCount = 0;
  let tier2WalletCount = 0;
  let tier3WalletCount = 0;
  const mintList = [];

  for (const wallet in balances) {
    const balance = balances[wallet];

    if (balance.gte(TIER0_THRESHOLD)) {
      tier0WalletCount++;
      mintList.push({ wallet, tier: 0 });
    }
    else if (balance.gte(TIER1_THRESHOLD)) {
      tier1WalletCount++;
      mintList.push({ wallet, tier: 1 });
    }
    else if (balance.gte(TIER2_THRESHOLD)) {
      tier2WalletCount++;
      mintList.push({ wallet, tier: 2 });
    }
    else if (balance.gte(TIER3_THRESHOLD)) {
      tier3WalletCount++;
      mintList.push({ wallet, tier: 3 });
    }
  }

  const proofs = generateMerkleProofs(mintList);
  writeFileSync(OUTPUT_MINTLIST_PROOFS, JSON.stringify(proofs, null, "  "));

  console.log("\r\n\r\n===================================");
  console.log("Snapshot taken");
  console.log("Start block:", START_BLOCK);
  console.log("  End block:", END_BLOCK);
  console.log("     Tier 0:", tier0WalletCount);
  console.log("     Tier 1:", tier1WalletCount);
  console.log("     Tier 2:", tier2WalletCount);
  console.log("     Tier 3:", tier3WalletCount);
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(-1));
