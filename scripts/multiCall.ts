/* eslint-disable camelcase */
/* eslint-disable no-process-exit */
/* eslint-disable prettier/prettier */
import { BigNumber, ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

/*
ts-node scripts/multiCall.ts
*/
async function main() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_URL || "");
    const user = process.env.DEMO_ADDR || "";

    const getPower = await initPowerGetter(provider);
    const block = await provider.getBlockNumber();
    const power = await getPower(user, block, 0.1);
    console.log("power %s block: %s %s", user, block, ethers.utils.formatEther(power.pulPower));
    console.log("lp    %s block: %s %s", user, block, ethers.utils.formatEther(power.lpAdjustedBalance));
}

async function initPowerGetter(provider: ethers.providers.JsonRpcProvider) {
    const PUL_WETH_POOL_ID = 45;
    const utils = ethers.utils;

    const multiCall = new ethers.Contract("0x5ba1e12693dc8f9c48aad8770482f4739beed696", [
        "function aggregate(tuple(address target, bytes callData)[] calls) returns (uint256 blockNumber, bytes[] returnData)",
    ], provider);

    const vePUL = new ethers.Contract("0xEDd27C961CE6f79afC16Fd287d934eE31a90D7D1", [
        "function getPULPool() public view returns(uint256)",
        "function totalSupply() public view returns(uint256)",
        "function balanceOf(address account) public view returns(uint256)",
    ], provider);

    const PUL = new ethers.Contract("0x3b484b82567a09e2588A13D54D032153f0c0aEe0", [
        "function balanceOf(address account) public view returns(uint256)",
    ], provider);

    const pulWETHPair = new ethers.Contract("0xB84C45174Bfc6b8F3EaeCBae11deE63114f5c1b2", [
        "function totalSupply() public view returns(uint256)",
        "function balanceOf(address account) public view returns(uint256)",
    ], provider);

    const chefV2 = new ethers.Contract("0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d", [
        "function userInfo(uint256, address _a) external view returns (uint256, uint256)",
    ], provider);

    const vePULGetPULPoolData: string = (await vePUL.populateTransaction.getPULPool()).data || "";
    const vePULTotalSupplyData: string = (await vePUL.populateTransaction.totalSupply()).data || "";
    const pulWETHPairTotalSupplyData: string = (await pulWETHPair.populateTransaction.totalSupply()).data || "";
    const pulBalanceOfWETHPairData: string = (await PUL.populateTransaction.balanceOf(pulWETHPair.address)).data || "";

    async function getPower(account: string, block: number, pulPercent: number) {
        const vePULBalanceOfAccountData: string = (await vePUL.populateTransaction.balanceOf(account)).data || "";
        const pulWETHPairBalanceOfAccountData: string = (await pulWETHPair.populateTransaction.balanceOf(account)).data || "";
        const pulBalanceOfAccountData: string = (await PUL.populateTransaction.balanceOf(account)).data || "";
        const lpStakedBalanceData = (await chefV2.populateTransaction.userInfo(PUL_WETH_POOL_ID, account)).data || "";

        const [bn, rts] = await multiCall.callStatic.aggregate([
            { target: vePUL.address, callData: vePULGetPULPoolData }, // 0
            { target: vePUL.address, callData: vePULTotalSupplyData }, // 1
            { target: vePUL.address, callData: vePULBalanceOfAccountData }, // 2
            { target: PUL.address, callData: pulBalanceOfAccountData }, // 3
            { target: chefV2.address, callData: lpStakedBalanceData }, // 4
            { target: pulWETHPair.address, callData: pulWETHPairTotalSupplyData }, // 5
            { target: pulWETHPair.address, callData: pulWETHPairBalanceOfAccountData }, // 6
            { target: PUL.address, callData: pulBalanceOfWETHPairData }, // 7
        ], {
            blockTag: block,
        });

        const vePULGetPULPool = BigNumber.from(rts[0].toString());
        const vePULTotalSupply = BigNumber.from(rts[1].toString());
        const vePULBalanceOfAccount = BigNumber.from(rts[2].toString());
        const pulBalanceOfAccount = BigNumber.from(rts[3].toString());
        const lpStakedBalance = utils.defaultAbiCoder.decode(["uint256", "uint256"], rts[4])[0];
        const pulWETHPairTotalSupply = BigNumber.from(rts[5].toString());
        const pulWETHPairBalanceOfAccount = BigNumber.from(rts[6].toString());
        const pulBalanceOfWETHPair = BigNumber.from(rts[7].toString());

        type Power = {
            blockNum: BigNumber,
            pulPower: BigNumber,
            pulBalance: BigNumber,
            vePULBalance: BigNumber,
            lpUnstaked: BigNumber,
            lpStakedBalance: BigNumber,
            lpAdjustedBalance: BigNumber,
        };
        const result: Power = {
            blockNum: bn,
            pulBalance: pulBalanceOfAccount,
            lpStakedBalance: lpStakedBalance,
            pulPower: BigNumber.from(0),
            vePULBalance: BigNumber.from(0),
            lpUnstaked: BigNumber.from(0),
            lpAdjustedBalance: BigNumber.from(0),
        };

        // uint256 pulBalance = pulToken.balanceOf(account);
        let pulBalance = pulBalanceOfAccount;
        pulBalance = pulBalance.mul(Math.floor(pulPercent * 10000000)).div(10000000); // We weak the power of PUL.

        // vePUL Balance
        let _stakedPUL = BigNumber.from(0); // uint256 _stakedPUL = 0;
        {
            const totalPUL = vePULGetPULPool; // uint256 totalPUL = vePULToken.getPULPool();
            const totalShares = vePULTotalSupply; // uint256 totalShares = vePULToken.totalSupply();
            const _share = vePULBalanceOfAccount; // uint256 _share = vePULToken.balanceOf(account);
            if (!totalShares.isZero()) { // if (totalShares != 0) {
                _stakedPUL = _share.mul(totalPUL).div(totalShares); // _stakedPUL = _share * totalPUL / totalShares;
            }
        }
        result.vePULBalance = vePULBalanceOfAccount;

        // LP Provider
        // (uint256 lpStakedBalance, ) = chefV2.userInfo(PUL_WETH_POOL_ID, account);
        // uint256 lpUnstaked = pulWETHPair.balanceOf(account);
        const lpUnstaked = pulWETHPairBalanceOfAccount;
        // uint256 lpBalance = lpStakedBalance + lpUnstaked;
        const lpBalance = lpStakedBalance.add(lpUnstaked);

        result.lpUnstaked = lpUnstaked;

        // uint256 lpAdjustedBalance = lpBalance * pulToken.balanceOf(address(pulWETHPair)) / pulWETHPair.totalSupply() * 2;
        const lpAdjustedBalance = lpBalance.mul(pulBalanceOfWETHPair).div(pulWETHPairTotalSupply).mul(2);

        // Sum them up!
        // uint256 combinedPULBalance = pulBalance + lpAdjustedBalance + _stakedPUL;
        const combinedPULBalance = pulBalance.add(lpAdjustedBalance).add(_stakedPUL);
        result.pulPower = combinedPULBalance;
        result.lpAdjustedBalance = lpAdjustedBalance;
        return result;
    }
    return getPower;
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

// const DATA = {
//     "code": 20000,
//     "message": "OK",
//     "data": {
//         "address": "0x8c0d2b62f133db265ec8554282ee60eca0fd5a9e",
//         "data7Days": [
//             {
//                 "block": 14070000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "377510961753.3948141496184822",
//                 "stakedSlpBalance": "0",
//                 "time": 1643049678,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14071000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "377712688206.2492701714165103",
//                 "stakedSlpBalance": "0",
//                 "time": 1643062876,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14072000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "377919000801.0382121276004991",
//                 "stakedSlpBalance": "0",
//                 "time": 1643076386,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14073000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "378125807876.9033355097874191",
//                 "stakedSlpBalance": "0",
//                 "time": 1643089915,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14074000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "378333098460.4939696582346181",
//                 "stakedSlpBalance": "0",
//                 "time": 1643103444,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14075000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "378542282731.0400403151848423",
//                 "stakedSlpBalance": "0",
//                 "time": 1643117060,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14076000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "378747528204.9654612244465012",
//                 "stakedSlpBalance": "0",
//                 "time": 1643130474,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14077000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "378951965206.2388688084486997",
//                 "stakedSlpBalance": "0",
//                 "time": 1643143803,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14078000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "379148337466.413651797696228",
//                 "stakedSlpBalance": "0",
//                 "time": 1643156615,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14079000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "379348981802.9772382038923494",
//                 "stakedSlpBalance": "0",
//                 "time": 1643169691,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14080000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "379554890862.6751722048449899",
//                 "stakedSlpBalance": "0",
//                 "time": 1643183227,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14081000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "379765901102.7876627519671007",
//                 "stakedSlpBalance": "0",
//                 "time": 1643197139,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14082000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "379956562194.536660693548849",
//                 "stakedSlpBalance": "0",
//                 "time": 1643209703,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14083000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "380162453225.5069882280697379",
//                 "stakedSlpBalance": "0",
//                 "time": 1643223274,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14084000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "380370699486.5093192284677231",
//                 "stakedSlpBalance": "0",
//                 "time": 1643236983,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14085000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "380574433768.8388242164517408",
//                 "stakedSlpBalance": "0",
//                 "time": 1643250395,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14086000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "380771643638.3630784182897703",
//                 "stakedSlpBalance": "0",
//                 "time": 1643263385,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14087000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "380979532851.9760884832572873",
//                 "stakedSlpBalance": "0",
//                 "time": 1643277087,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14088000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "381187523110.7126005446814693",
//                 "stakedSlpBalance": "0",
//                 "time": 1643290823,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14089000,
//                 "pulBalance": "1089763641.2786919254928309",
//                 "pulPower": "381382716383.818531902524124",
//                 "stakedSlpBalance": "0",
//                 "time": 1643303871,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14090000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "381726173679.257302829714519",
//                 "stakedSlpBalance": "0",
//                 "time": 1643317012,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14091000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "381923546656.6445675192232791",
//                 "stakedSlpBalance": "0",
//                 "time": 1643330208,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14092000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "382123738825.9681672918059187",
//                 "stakedSlpBalance": "0",
//                 "time": 1643343614,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14093000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "382326897150.0896784759556084",
//                 "stakedSlpBalance": "0",
//                 "time": 1643357231,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14094000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "382533832109.4793168204730246",
//                 "stakedSlpBalance": "0",
//                 "time": 1643371124,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14095000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "382722345778.5393395710538467",
//                 "stakedSlpBalance": "0",
//                 "time": 1643383903,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14096000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "382921454378.5609292940694398",
//                 "stakedSlpBalance": "0",
//                 "time": 1643397402,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14097000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "383116345341.678532952264161",
//                 "stakedSlpBalance": "0",
//                 "time": 1643410629,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14098000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "383306606964.7489780389584054",
//                 "stakedSlpBalance": "0",
//                 "time": 1643423560,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14099000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "383500453035.1700721532459719",
//                 "stakedSlpBalance": "0",
//                 "time": 1643437040,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14100000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "383687441380.7270408400324893",
//                 "stakedSlpBalance": "0",
//                 "time": 1643450273,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14101000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "383880199208.4962050293516952",
//                 "stakedSlpBalance": "0",
//                 "time": 1643463925,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14102000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "384069525777.4688305608486301",
//                 "stakedSlpBalance": "0",
//                 "time": 1643477325,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14103000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "384256742856.1676339949785145",
//                 "stakedSlpBalance": "0",
//                 "time": 1643490542,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14104000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "384446900838.6263700692395082",
//                 "stakedSlpBalance": "0",
//                 "time": 1643503916,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14105000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "384630834943.5888736682281509",
//                 "stakedSlpBalance": "0",
//                 "time": 1643516902,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14106000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "384819934787.3133307522673202",
//                 "stakedSlpBalance": "0",
//                 "time": 1643530381,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14107000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "385010414803.1827139816517479",
//                 "stakedSlpBalance": "0",
//                 "time": 1643544019,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14108000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "385196541456.1589538113410799",
//                 "stakedSlpBalance": "0",
//                 "time": 1643557452,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14109000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "385374711538.7169065410423929",
//                 "stakedSlpBalance": "0",
//                 "time": 1643570244,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14110000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "385556788666.4085029039382824",
//                 "stakedSlpBalance": "0",
//                 "time": 1643583240,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14111000,
//                 "pulBalance": "2558722258.2786919254928309",
//                 "pulPower": "385743591587.914538294006864",
//                 "stakedSlpBalance": "0",
//                 "time": 1643596554,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14112000,
//                 "pulBalance": "2731311497.9726919254928309",
//                 "pulPower": "385951446794.8513360776051505",
//                 "stakedSlpBalance": "0",
//                 "time": 1643610336,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14113000,
//                 "pulBalance": "2731311497.9726919254928309",
//                 "pulPower": "386132921198.4921031669226358",
//                 "stakedSlpBalance": "0",
//                 "time": 1643623637,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14114000,
//                 "pulBalance": "2731311497.9726919254928309",
//                 "pulPower": "386310736296.9550847989937934",
//                 "stakedSlpBalance": "0",
//                 "time": 1643636729,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14115000,
//                 "pulBalance": "2731311497.9726919254928309",
//                 "pulPower": "386493459903.5913869294185563",
//                 "stakedSlpBalance": "0",
//                 "time": 1643650174,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14116000,
//                 "pulBalance": "2731311497.9726919254928309",
//                 "pulPower": "386672775669.1397975270709162",
//                 "stakedSlpBalance": "0",
//                 "time": 1643663371,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14117000,
//                 "pulBalance": "2731311497.9726919254928309",
//                 "pulPower": "386854758642.5175253201528606",
//                 "stakedSlpBalance": "0",
//                 "time": 1643676746,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14118000,
//                 "pulBalance": "2731311497.9726919254928309",
//                 "pulPower": "387032797097.2856537793221518",
//                 "stakedSlpBalance": "0",
//                 "time": 1643689840,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             },
//             {
//                 "block": 14119000,
//                 "pulBalance": "6187114572.9726919254928309",
//                 "pulPower": "387556661410.0329615289642034",
//                 "stakedSlpBalance": "0",
//                 "time": 1643703036,
//                 "unstakeSlpBalance": "0",
//                 "vePULBalance": "345678999998.9999999997908162"
//             }
//         ],
//         "sampledInfo": {
//             "hasAllTiersMembership": false,
//             "hasTier1Membership": false,
//             "pulPower": "377510961753.3948141496184822"
//         }
//     }
// };

// eslint-disable-next-line no-unused-vars
// async function compareWithCPUL() {
//     const combined = (await ethers.getContractFactory("PulsarDAOCombined")).attach("0x41CBAC56EA5eC878135082f0F8d9a232a854447E");
//     const balanceOf = async (account: string, block: number) => {
//         return await combined.balanceOf(account, { blockTag: block })
//     }

//     const account = process.env.DEMO_ADDR || "";
//     const getPower = await initPowerGetter(ethers);

//     let b = await ethers.provider.getBlockNumber();
//     console.log("[")
//     for (let i = 0; i < 20; i++) {
//         const [aa, bb, cc] = await Promise.all([
//             balanceOf(account, b), getPower(account, b, 1), getPower(account, b, 0.1)
//         ])
//         expect(aa.toString()).eq(bb.pulPower.toString());
//         console.log("%s,", JSON.stringify({
//             account, blockNum: b, power: ethers.utils.formatEther(cc.pulPower)
//         }));
//         b -= 1661;
//     }
//     console.log("]")
// }
// const multiCallAbi = [{ "inputs": [{ "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes", "name": "callData", "type": "bytes" }], "internalType": "struct Multicall2.Call[]", "name": "calls", "type": "tuple[]" }], "name": "aggregate", "outputs": [{ "internalType": "uint256", "name": "blockNumber", "type": "uint256" }, { "internalType": "bytes[]", "name": "returnData", "type": "bytes[]" }], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes", "name": "callData", "type": "bytes" }], "internalType": "struct Multicall2.Call[]", "name": "calls", "type": "tuple[]" }], "name": "blockAndAggregate", "outputs": [{ "internalType": "uint256", "name": "blockNumber", "type": "uint256" }, { "internalType": "bytes32", "name": "blockHash", "type": "bytes32" }, { "components": [{ "internalType": "bool", "name": "success", "type": "bool" }, { "internalType": "bytes", "name": "returnData", "type": "bytes" }], "internalType": "struct Multicall2.Result[]", "name": "returnData", "type": "tuple[]" }], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "blockNumber", "type": "uint256" }], "name": "getBlockHash", "outputs": [{ "internalType": "bytes32", "name": "blockHash", "type": "bytes32" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getBlockNumber", "outputs": [{ "internalType": "uint256", "name": "blockNumber", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getCurrentBlockCoinbase", "outputs": [{ "internalType": "address", "name": "coinbase", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getCurrentBlockDifficulty", "outputs": [{ "internalType": "uint256", "name": "difficulty", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getCurrentBlockGasLimit", "outputs": [{ "internalType": "uint256", "name": "gaslimit", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getCurrentBlockTimestamp", "outputs": [{ "internalType": "uint256", "name": "timestamp", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "addr", "type": "address" }], "name": "getEthBalance", "outputs": [{ "internalType": "uint256", "name": "balance", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getLastBlockHash", "outputs": [{ "internalType": "bytes32", "name": "blockHash", "type": "bytes32" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "bool", "name": "requireSuccess", "type": "bool" }, { "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes", "name": "callData", "type": "bytes" }], "internalType": "struct Multicall2.Call[]", "name": "calls", "type": "tuple[]" }], "name": "tryAggregate", "outputs": [{ "components": [{ "internalType": "bool", "name": "success", "type": "bool" }, { "internalType": "bytes", "name": "returnData", "type": "bytes" }], "internalType": "struct Multicall2.Result[]", "name": "returnData", "type": "tuple[]" }], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "bool", "name": "requireSuccess", "type": "bool" }, { "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes", "name": "callData", "type": "bytes" }], "internalType": "struct Multicall2.Call[]", "name": "calls", "type": "tuple[]" }], "name": "tryBlockAndAggregate", "outputs": [{ "internalType": "uint256", "name": "blockNumber", "type": "uint256" }, { "internalType": "bytes32", "name": "blockHash", "type": "bytes32" }, { "components": [{ "internalType": "bool", "name": "success", "type": "bool" }, { "internalType": "bytes", "name": "returnData", "type": "bytes" }], "internalType": "struct Multicall2.Result[]", "name": "returnData", "type": "tuple[]" }], "stateMutability": "nonpayable", "type": "function" }];

    // await compareWithCPUL();
    // for (const day of DATA.data.data7Days) {
    //     const p = await getPower(DATA.data.address, day.block, 0.1);
    //     console.log("block: %s", day.block);

    //     let p1 = ethers.utils.formatEther(p.pulPower).substring(0, 25).replace("0.0", "0");
    //     let p2 = day.pulPower.substring(0, 25);
    //     expect(p1).eq(p2);
    //     // console.log("pulPower %s", p1);
    //     // console.log("pulPower %s", p2);

    //     p1 = ethers.utils.formatEther(p.vePULBalance).substring(0, 25).replace("0.0", "0");
    //     p2 = day.vePULBalance.substring(0, 25);
    //     expect(p1).eq(p2);
    //     // console.log("vePULBalance %s", p1);
    //     // console.log("vePULBalance %s", p2);

    //     p1 = ethers.utils.formatEther(p.pulBalance).substring(0, 25).replace("0.0", "0");
    //     p2 = day.pulBalance.substring(0, 25);
    //     expect(p1).eq(p2);
    //     // console.log("pulBalance %s", p1);
    //     // console.log("pulBalance %s", p2);

    //     p1 = ethers.utils.formatEther(p.lpStakedBalance).substring(0, 25).replace("0.0", "0");
    //     p2 = day.stakedSlpBalance.substring(0, 25);
    //     expect(p1).eq(p2);
    //     // console.log("lpStakedBalance %s", p1);
    //     // console.log("lpStakedBalance %s", p2);

    //     p1 = ethers.utils.formatEther(p.lpUnstaked).substring(0, 25).replace("0.0", "0");
    //     p2 = day.unstakeSlpBalance.substring(0, 25);
    //     expect(p1).eq(p2);
    //     // console.log("lpUnstaked %s", p1);
    //     // console.log("lpUnstaked %s", p2);
    // }
        // const iface = new ethers.utils.Interface(multiCallAbi);
    // const FormatTypes = ethers.utils.FormatTypes;
    // console.log(iface.format(FormatTypes.full))

    // const multiCall = (await ethers.getContractFactory("Multicall2")).attach("0x5ba1e12693dc8f9c48aad8770482f4739beed696");
    // const vePUL = (await ethers.getContractFactory("PulsarDAOStaking")).attach("0xEDd27C961CE6f79afC16Fd287d934eE31a90D7D1");
    // const PUL = (await ethers.getContractFactory("PulsarDAO")).attach("0x3b484b82567a09e2588A13D54D032153f0c0aEe0");
    // const pulWETHPair = (await ethers.getContractFactory("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20")).attach("0xB84C45174Bfc6b8F3EaeCBae11deE63114f5c1b2");
    // const chefV2 = (await ethers.getContractFactory("MasterChefV2Mock")).attach("0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d");
