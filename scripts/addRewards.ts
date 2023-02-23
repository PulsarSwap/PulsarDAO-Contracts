/* eslint-disable camelcase */
/* eslint-disable prettier/prettier */
/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { timestampInSecond } from "../utils/timestamp";
import { PulsarDAOStaking } from "../typechain";
import { YEAR, HOUR } from "../utils/constants";

const utils = ethers.utils;

/**
npx hardhat --network rinkeby run scripts/addRewards.ts
 */
async function main() {
  const [owner] = await ethers.getSigners();

  const pul_address = process.env.pul_address as string;
  const vePUL_address = process.env.vePUL_address as string;
  const PUL = (await ethers.getContractFactory("MyERC20")).attach(pul_address);
  const vePUL = (await ethers.getContractFactory("PulsarDAOStaking")).attach(vePUL_address);

  let nonce = await owner.getTransactionCount();
  console.log("%s nonce %s", owner.address, nonce);

  await PUL.connect(owner).mint(BigInt(1e32), {
    maxFeePerGas: utils.parseUnits("85", "gwei"),
    maxPriorityFeePerGas: utils.parseUnits("1.1", "gwei"),
    gasLimit: 3519404,
    nonce: nonce++,
  });
  await PUL.connect(owner).approve(vePUL.address, BigInt(1e32), {
    maxFeePerGas: utils.parseUnits("85", "gwei"),
    maxPriorityFeePerGas: utils.parseUnits("1.1", "gwei"),
    gasLimit: 3519404,
    nonce: nonce++,
  });
  await vePUL.connect(owner).addRewardPUL(BigInt(2e+31), {
    maxFeePerGas: utils.parseUnits("85", "gwei"),
    maxPriorityFeePerGas: utils.parseUnits("1.1", "gwei"),
    gasLimit: 3519404,
    nonce: nonce++,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
