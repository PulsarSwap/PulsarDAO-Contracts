/* eslint-disable no-process-exit */
/* eslint-disable prettier/prettier */
import { ethers } from "hardhat";

const utils = ethers.utils;

/**
npx hardhat --network rinkeby run scripts/deployCombinedPUL.ts
npx hardhat --network rinkeby verify --contract contracts/PulsarDAOCombined.sol:PulsarDAOCombined 0x00
 */
async function main() {
    const [owner] = await ethers.getSigners();

    const PulsarDAOCombinedFactory = await ethers.getContractFactory("PulsarDAOCombined");
    const PulsarDAOCombined = await PulsarDAOCombinedFactory.connect(owner).deploy({
        maxFeePerGas: utils.parseUnits("120", "gwei"),
        maxPriorityFeePerGas: utils.parseUnits("1.18", "gwei"),
        gasLimit: 3519404,
    });

    console.log("Combined PUL contract address:", PulsarDAOCombined.address);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
