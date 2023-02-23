/* eslint-disable prettier/prettier */
/* eslint-disable node/no-missing-import */
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import hre from "hardhat";
import { getENV } from "../utils/network";

/*
npx hardhat --network rinkeby run --no-compile scripts/testEnvInfo.ts
*/
async function main(): Promise<void> {
  const ethers = hre.ethers;
  const utils = ethers.utils;
  const [owner] = await ethers.getSigners();

  const lockAddress = getENV(hre, "lock");
  const pulAddress = getENV(hre, "pul");

  const lock = (await ethers.getContractFactory("PulsarDAOLock")).attach(lockAddress);
  const pul = (await ethers.getContractFactory("MyERC20")).attach(pulAddress);

  const [
    locked,
    ownerPUL,
    lockPUL,
    allowance,
  ] = await Promise.all([
    lock.locked(owner.address),
    pul.balanceOf(owner.address),
    pul.balanceOf(lock.address),
    pul.allowance(owner.address, lock.address),
  ]);

  console.log("owner locked %s", utils.formatEther(locked));
  console.log("owner PUL %s", utils.formatEther(ownerPUL));
  console.log("lock contract PUL %s", utils.formatEther(lockPUL));
  console.log("allowance %s", utils.formatEther(allowance));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
