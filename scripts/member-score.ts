/* eslint-disable spaced-comment */
/* eslint-disable node/no-missing-import */
/* eslint-disable camelcase */
/* eslint-disable no-process-exit */
/* eslint-disable prettier/prettier */
/* eslint-disable node/no-extraneous-import */
import { Log } from "@ethersproject/abstract-provider";
import * as dotenv from "dotenv";
import { BigNumber, ethers, providers } from "ethers";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { program } from 'commander';
import { OpenDAOMembershipNFT__factory } from "../typechain";

dotenv.config();

type TData = Map<string, Map<number, number>>;
type TObjData = { [key: string]: { [key: string]: number } };

const OUTPUT_BALANCE = join(__dirname, "balances.json");
const OUTPUT_TIER1MEMBERS = join(__dirname, "wlList.json");
const provider = new providers.JsonRpcProvider(process.env.MAINNET_URL);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NFT_ADDRESS = "0xd22f83e8a1502b1d41c0b40cf64b291a6eabc44d";
const START_BLOCK = 14061462;
const END_BLOCK = 14860946;

async function getBalances() {
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

  const ERC1155_ABI_SLIM = [
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  ];
  const ERC1155_IFACE = new ethers.utils.Interface(ERC1155_ABI_SLIM);
  const EVENT_ID_ERC1155_TRANSFER_SINGLE = ERC1155_IFACE.getEventTopic("TransferSingle");
  const EVENT_ID_ERC1155_TRANSFER_BATCH = ERC1155_IFACE.getEventTopic("TransferBatch");

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
            const v = (balancesByAddress.get(arg.from)?.get(tokenID) ?? 0) - value;
            balancesByAddress.get(arg.from)?.set(tokenID, v);
          }

          if (!balancesByAddress.has(arg.to)) {
            balancesByAddress.set(arg.to, new Map());
          }

          if (!balancesByAddress.get(arg.to)?.has(tokenID)) {
            balancesByAddress.get(arg.to)?.set(tokenID, 0);
          }

          const v = (balancesByAddress.get(arg.to)?.get(tokenID) ?? 0) + value;
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

function loadData(): TObjData {
  return JSON.parse(readFileSync(OUTPUT_BALANCE, "utf8"));
}

async function iterData(data: TObjData, callback: Function) {
  for (const [wallet, tokens] of Object.entries(data)) {
    for (const [tokenID, value] of Object.entries(tokens)) {
      await callback(wallet, tokenID, value);
    }
  }
}

function getScore(tokenID: string) {
  switch (tokenID) {
    case '1': // tier 2
      return 3;
    case '2': // tier 3
      return 2;
    case '3': // tier 4
      return 1;
    default:
      console.error("!!! tokenID = %s", tokenID);
      return 1000000000;
  }
}

/*
npx ts-node scripts/member-score.ts take

npx ts-node scripts/member-score.ts statistic

npx ts-node scripts/member-score.ts compare-with-end-block
*/
async function main() {
  program.command('take').action(async () => {
    const balancesByAddress = await getBalances();
    writeBalanceSnapshot(balancesByAddress);

    console.log("\r\n\r\n===================================");
    console.log("Snapshot taken");
    console.log("Start block:", START_BLOCK);
    console.log("  End block:", END_BLOCK);
  });

  program.command('compare-with-end-block').action(async () => {
    const ms = OpenDAOMembershipNFT__factory.connect(NFT_ADDRESS, provider);
    await iterData(loadData(), async (wallet: string, tokenID: string, value: number) => {
      if (tokenID !== '0') return;

      const [e, /*l*/] = await Promise.all([
        ms.balanceOf(wallet, BigNumber.from(tokenID), { blockTag: END_BLOCK }),
        // ms.balanceOf(wallet, BigNumber.from(tokenID), { blockTag: 'latest' }),
      ])

      const valueEndBlock = e.toNumber();
      // const valueLatestBlock = l.toNumber();

      if (valueEndBlock !== value) {
        console.log(`E ${wallet} tokenID=${tokenID}, ${valueEndBlock} ${value}`);
      }

      // if (valueEndBlock !== valueLatestBlock) {
      //   console.log(`L ${wallet} tokenID=${tokenID}, ${valueLatestBlock} ${valueEndBlock}`);
      // }
    });
  });

  program.command('statistic').action(async () => {
    const tier1members = new Map<string, number>();
    const memberScores = new Map<string, number>();

    await iterData(loadData(), async (wallet: string, tokenID: string, value: number) => {
      if (tokenID === '0') { // tier 1
        tier1members.set(wallet, value);
      } else {
        const s = memberScores.get(wallet) ?? 0;
        memberScores.set(wallet, s + value * getScore(tokenID));
      }
    });

    [...memberScores.entries()].sort((a, b) => {
      return b[1] - a[1];
    }).slice(0, 1309).forEach(([wallet]) => {
      const c = tier1members.get(wallet) ?? 0;
      tier1members.set(wallet, c + 1);
    });

    const arr = [...tier1members.entries()].sort((a, b) => {
      return b[1] - a[1];
    });

    writeFileSync(OUTPUT_TIER1MEMBERS, JSON.stringify(arr, null, ' '))
  });

  await program.parseAsync(process.argv);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(-1);
  });