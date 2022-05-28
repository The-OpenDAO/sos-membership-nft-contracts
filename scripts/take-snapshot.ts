/* eslint-disable no-process-exit */
/* eslint-disable prettier/prettier */
/* eslint-disable node/no-extraneous-import */
import { Log } from "@ethersproject/abstract-provider";
import * as dotenv from "dotenv";
import { BigNumber, ethers, providers } from "ethers";
import { writeFileSync } from "fs";
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
const END_BLOCK = 14860946;

type TData = Map<string, Map<number, number>>;

async function getBalances() {
  const provider = new providers.JsonRpcProvider(process.env.MAINNET_URL);

  const batchSize = 1000;
  let startBlock = START_BLOCK;

  const balancesByAddress: TData = new Map();

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

        if (rawEvent.topic === EVENT_ID_ERC1155_TRANSFER_SINGLE) {
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
          console.log("[%d|%s] Transfer %d token#%d from %s to %s",
            log.blockNumber,
            log.logIndex.toString().padStart(3),
            arg.value.toString(),
            arg.id.toString(),
            arg.from,
            arg.to);
          const tokenID = arg.id.toNumber();
          const value = arg.value.toNumber();

          if (arg.from !== ZERO_ADDRESS) {
            const v = balancesByAddress.get(arg.from)?.get(tokenID) || 0 - value;
            balancesByAddress.get(arg.from)?.set(tokenID, v);
          }

          if (!balancesByAddress.has(arg.to)) {
            balancesByAddress.set(arg.to, new Map());
          }

          if (!balancesByAddress.get(arg.to)?.has(tokenID)) {
            balancesByAddress.get(arg.to)?.set(tokenID, 0);
          }

          const v = balancesByAddress.get(arg.to)?.get(tokenID) || 0 + value;
          balancesByAddress.get(arg.to)?.set(tokenID, v);
        }

      }
    }

    startBlock += blocksToGet;
  }

  balancesByAddress.forEach((tokens, wallet, map) => {
    let rm = true;
    tokens.forEach((value, tokenID, map) => {
      if (value === 0) {
        map.delete(tokenID);
      } else {
        rm = false;
      }
    });
    if (rm) {
      map.delete(wallet);
    }
  });

  return balancesByAddress;
}

function writeBalanceSnapshot(balancesByAddress: TData) {
  const balances: { [key: string]: {} } = Object.fromEntries(balancesByAddress);
  balancesByAddress.forEach((value, key) => {
    const tokens = Object.fromEntries(value);
    balances[key] = tokens;
  });
  writeFileSync(OUTPUT_BALANCE, JSON.stringify(balances, null, "  "));
}

/*
npx ts-node scripts/take-snapshot.ts
*/
async function main() {
  const balancesByAddress = await getBalances();
  writeBalanceSnapshot(balancesByAddress);

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