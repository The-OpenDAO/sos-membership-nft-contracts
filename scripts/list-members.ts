import { Log } from "@ethersproject/abstract-provider";
import * as dotenv from "dotenv";
import { BigNumber, ethers, providers } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

dotenv.config();

interface ERC1155TransferSingleArgs {
  operator: string;
  from: string;
  to: string;
  id: BigNumber;
  value: BigNumber;
};

interface ERC1155TransferBatchArgs {
  operator: string;
  from: string;
  to: string;
  ids: BigNumber[];
  values: BigNumber[];
};

const OUTPUT_BALANCE = join(__dirname, "balances.json");
const ERC1155_ABI_SLIM = [
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
];
const ERC1155_IFACE = new ethers.utils.Interface(ERC1155_ABI_SLIM);
const EVENT_ID_ERC1155_TRANSFER_SINGLE = ERC1155_IFACE.getEventTopic("TransferSingle");
const EVENT_ID_ERC1155_TRANSFER_BATCH = ERC1155_IFACE.getEventTopic("TransferBatch");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NFT_ADDRESS = "0xd22f83e8a1502b1d41c0b40cf64b291a6eabc44d";
const START_BLOCK = 14061462;
const END_BLOCK = 14428295;
const TOKEN_ID = 0;

async function getBalances() {
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
      address: NFT_ADDRESS,
      topics: [
        [EVENT_ID_ERC1155_TRANSFER_SINGLE, EVENT_ID_ERC1155_TRANSFER_BATCH],
      ],
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
        const rawEvent = ERC1155_IFACE.parseLog(log);
        const transferSingleArgs: ERC1155TransferSingleArgs[] = [];

        if (rawEvent.topic == EVENT_ID_ERC1155_TRANSFER_SINGLE) {
          transferSingleArgs.push(rawEvent.args as any as ERC1155TransferSingleArgs);
        } else {
          const batchEventArgs = rawEvent.args as any as ERC1155TransferBatchArgs;

          transferSingleArgs.push(...batchEventArgs.ids
            .map((id, index) => ({
              operator: batchEventArgs.operator,
              from: batchEventArgs.from,
              to: batchEventArgs.to,
              id: id,
              value: batchEventArgs.values[index],
            })));
        }

        for (const arg of transferSingleArgs) {
          if (!arg.id.eq(TOKEN_ID)) {
            continue;
          }

          console.log("[%d|%s] Transfer %d token#%d from %s to %s",
            log.blockNumber,
            log.logIndex.toString().padStart(3),
            arg.value.toString(),
            arg.id.toString(),
            arg.from,
            arg.to);

          if (arg.from != ZERO_ADDRESS) {
            balancesByAddress[arg.from] = balancesByAddress[arg.from].sub(arg.value);
          }

          balancesByAddress[arg.to] = (balancesByAddress[arg.to] ?? BigNumber.from(0)).add(arg.value);
        }

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
  let balances = await getBalances();
  writeBalanceSnapshot(balances);

  console.log("\r\n\r\n===================================");
  console.log("Snapshot taken");
  console.log("Start block:", START_BLOCK);
  console.log("  End block:", END_BLOCK);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(-1);
  });