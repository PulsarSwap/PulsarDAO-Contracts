/* eslint-disable node/no-missing-import */
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import hre from "hardhat";
import { getENV, getNonce } from "../utils/network";

/*
npx hardhat --network rinkeby run scripts/deployLock.ts

npx hardhat --network goerli run scripts/deployLock.ts

npx hardhat --network mainnet run scripts/deployLock.ts
*/
async function main(): Promise<void> {
  const ethers = hre.ethers;
  const utils = ethers.utils;
  const [owner] = await ethers.getSigners();

  const pulAddress = getENV(hre, "pul");
  const duration = Number(getENV(hre, "Duration"));

  const lock = await (await ethers.getContractFactory("PulsarDAOLock"))
    .connect(owner)
    .deploy(pulAddress, duration, {
      maxFeePerGas: utils.parseUnits("200", "gwei"),
      maxPriorityFeePerGas: utils.parseUnits("1.01", "gwei"),
      nonce: await getNonce(owner),
    });
  console.log("deploying to:", lock.address);
  console.log(
    "npx hardhat --network %s verify --contract contracts/PulsarDAOLock.sol:PulsarDAOLock %s %s %s",
    hre.network.name,
    lock.address,
    pulAddress,
    duration
  );
  await lock.deployed();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
