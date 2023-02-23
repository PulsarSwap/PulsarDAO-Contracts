/* eslint-disable prettier/prettier */
/* eslint-disable node/no-missing-import */
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import hre from "hardhat";
import { getENV, getNonce } from "../utils/network";

/*
npx hardhat --network rinkeby run --no-compile scripts/testEnvDeposit.ts
*/
async function main(): Promise<void> {
  const ethers = hre.ethers;
  const utils = ethers.utils;
  const [owner] = await ethers.getSigners();

  const lockAddress = getENV(hre, "lock");
  const pulAddress = getENV(hre, "pul");

  const lock = (await ethers.getContractFactory("PulsarDAOLock")).attach(lockAddress);
  const pul = (await ethers.getContractFactory("MyERC20")).attach(pulAddress);

  await pul.connect(owner).mint(utils.parseEther("100"), {
    nonce: await getNonce(owner),
    maxFeePerGas: utils.parseUnits("200", "gwei"),
    maxPriorityFeePerGas: utils.parseUnits("1", "gwei"),
    gasLimit: 1000000,
  });

  await pul.connect(owner).approve(lock.address, utils.parseEther("1000000"), {
    nonce: await getNonce(owner),
    maxFeePerGas: utils.parseUnits("200", "gwei"),
    maxPriorityFeePerGas: utils.parseUnits("1", "gwei"),
    gasLimit: 1000000,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
