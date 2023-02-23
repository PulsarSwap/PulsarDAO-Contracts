/* eslint-disable no-process-exit */
/* eslint-disable prettier/prettier */
import { expect } from "chai";
import hre from "hardhat";

const ethers = hre.ethers;
const utils = ethers.utils;

/**
npx hardhat --network mumbai run scripts/deployCombinedPULPolygon.ts

npx hardhat --network polygon run scripts/deployCombinedPULPolygon.ts
 */
async function main() {
    const [a, owner] = await ethers.getSigners();
    expect(owner.address.toLowerCase()).eq("0x0dee503261FA153BC9372f5b201C56Ead3b33721".toLowerCase());

    const PulsarDAOCombinedFactory = await ethers.getContractFactory("PulsarDAOCombinedPolygon");
    const PulsarDAOCombinedPolygon = await PulsarDAOCombinedFactory.connect(owner).deploy({
        maxFeePerGas: utils.parseUnits("120", "gwei"),
        maxPriorityFeePerGas: utils.parseUnits("30", "gwei"),
    });

    console.log("Combined PUL contract address:", PulsarDAOCombinedPolygon.address);
    console.log(
        "npx hardhat --network %s verify --contract contracts/PulsarDAOCombinedPolygon.sol:PulsarDAOCombinedPolygon %s",
        hre.network.name,
        PulsarDAOCombinedPolygon.address,
    );
    await PulsarDAOCombinedPolygon.deployed();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
