import { Log } from "@ethersproject/abstract-provider";
import * as dotenv from "dotenv";
import { BigNumber, ethers, providers } from "ethers";
import { existsSync, fstatSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { generateMerkleProofs } from "../utils/mintlist";
import { getPercentiles } from "./util";

dotenv.config();

interface ERC20TransferArgs {
  from: string;
  to: string;
  value: BigNumber;
}

const INPUT_COMPENSATION_LIST = join(__dirname, "compensation.csv");
const OUTPUT_BALANCE = join(__dirname, "balances.slp.json");
const OUTPUT_PROOF_DIR = join(__dirname, "proofs.lp");
const OUTPUT_MINTLIST_PROOFS = join(OUTPUT_PROOF_DIR, "tree.json");
const ERC20_ABI_SLIM = [
  "event Transfer(address indexed from, address indexed to, uint value)",
  "function balanceOf(address _owner) public view returns (uint256 balance)",
  "function totalSupply() external view returns (uint256)",
];
const MASTER_CHEFV2_ABI_SLIM = [
  "function userInfo(uint256 pid, address account) external view returns (uint256 amount, uint256 debt)",
];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SLP_ADDRESS = "0xB84C45174Bfc6b8F3EaeCBae11deE63114f5c1b2";
const MASTER_CHEFV2 = "0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d";
const START_BLOCK = 13864933;
const END_BLOCK = 14152105; // Feb-06-2022 11:00:39 AM +UTC

async function getBalances() {
  const erc20IFace = new ethers.utils.Interface(ERC20_ABI_SLIM);
  const provider = new providers.AlchemyProvider("mainnet", process.env.ALCHEMY_KEY);

  const batchSize = 4000;
  let startBlock = START_BLOCK;

  const balancesByAddress: { [wallet: string]: BigNumber } = {};

  while (startBlock <= END_BLOCK) {
    const blocksToGet = Math.min(END_BLOCK - startBlock + 1, batchSize);
    const toBlock = startBlock + blocksToGet - 1;

    const logs = await provider.getLogs({
      fromBlock: startBlock,
      toBlock: toBlock,
      address: SLP_ADDRESS,
      topics: [[erc20IFace.getEventTopic("Transfer")]],
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
        const event = erc20IFace.parseLog(log);
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

  const masterChefV2 = new ethers.Contract(MASTER_CHEFV2, MASTER_CHEFV2_ABI_SLIM, provider);

  delete balancesByAddress[ZERO_ADDRESS];

  let i = 0;
  let total = Object.entries(balancesByAddress).length;
  for (const wallet in balancesByAddress) {
    const { amount } = await masterChefV2.userInfo(45, wallet);
    console.log("Updating balance for %s. %d of %d.",
      wallet,
      ++i,
      total);

    balancesByAddress[wallet] = balancesByAddress[wallet].add(amount);

    if (balancesByAddress[wallet].isZero()) {
      delete balancesByAddress[wallet];
      continue
    }
  }
  return balancesByAddress;
}

function loadBalances() {
  const balancesByAddress: { [wallet: string]: BigNumber } = {};

  for (const balance of JSON.parse(readFileSync(OUTPUT_BALANCE).toString())) {
    balancesByAddress[balance[0]] = BigNumber.from(balance[1]);
  }

  return balancesByAddress;
}

function loadCompensationList() {
  return readFileSync(INPUT_COMPENSATION_LIST, 'ascii')
    .split('\n')
    .map(line => line.trim())
    .filter(line => !!line)
    .map(line => {
      const [wallet, tier] = line.split(",");

      return {
        wallet,
        tier: Number.parseInt(tier),
      };
    });
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

  const comList = loadCompensationList();

  mintList.push(...comList);

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
      tier + 1,
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
