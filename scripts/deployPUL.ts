/* eslint-disable prettier/prettier */
/* eslint-disable node/no-missing-import */
import hre from "hardhat";
import { MyERC20 } from "../typechain";

const ethers = hre.ethers;
const utils = ethers.utils;

/**
npx hardhat --network goerli run scripts/deployPUL.ts
 */
async function main() {
  const [owner] = await ethers.getSigners();
  const name = "PUL";

  const MyERC20Factory = await ethers.getContractFactory("MyERC20");
  const PUL: MyERC20 = await MyERC20Factory.connect(owner).deploy(name, {
    maxFeePerGas: utils.parseUnits("85", "gwei"),
    maxPriorityFeePerGas: utils.parseUnits("2", "gwei"),
  });
  console.log("PUL deployed to:", PUL.address);

  console.log(
    "npx hardhat --network %s verify --contract contracts/MyERC20.sol:MyERC20 %s %s",
    hre.network.name,
    PUL.address,
    name,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
