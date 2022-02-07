import { BigNumber } from "ethers/lib/ethers";

export function getPercentiles(data: BigNumber[], percentiles: number[]): BigNumber[] {
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
