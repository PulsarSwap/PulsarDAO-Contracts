/* eslint-disable prefer-const */
/* eslint-disable node/no-missing-import */
/* eslint-disable prettier/prettier */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { PulsarDAOCombined, MyERC20, MasterChefV2Mock, PulsarDAOStaking } from "../typechain";
import { timestampInSecond } from "../utils/timestamp";
import { DAY, YEAR } from "../utils/constants";
// 0.000000001 Ether = 1Gwei
const provider = ethers.provider;
let now = timestampInSecond();

// eslint-disable-next-line no-unused-vars
const utils = ethers.utils;

let owner: SignerWithAddress;
// eslint-disable-next-line no-unused-vars
let alice: SignerWithAddress;
// eslint-disable-next-line no-unused-vars
let bob: SignerWithAddress;
// eslint-disable-next-line no-unused-vars
let charlie: SignerWithAddress;
// eslint-disable-next-line no-unused-vars
let david: SignerWithAddress;

let pul: MyERC20;
let vePUL: PulsarDAOStaking;
let pulWETHPair: MyERC20;
let combined: PulsarDAOCombined;
let chef: MasterChefV2Mock;

function b(amount: bigint): BigNumber { return utils.parseEther(amount.toString()) }

async function init() {
  expect(31337).eq((await provider.getNetwork()).chainId);
  [owner, alice, bob, charlie, david] = await ethers.getSigners();

  const MyERC20Factory = await ethers.getContractFactory("MyERC20");
  pul = await MyERC20Factory.connect(owner).deploy("PUL");
  pulWETHPair = await MyERC20Factory.connect(owner).deploy("pulWETHPair");

  const factoryMasterChefV2Mock = await ethers.getContractFactory("MasterChefV2Mock");
  chef = await factoryMasterChefV2Mock.connect(owner).deploy();

  const factory = await ethers.getContractFactory("PulsarDAOCombined");
  combined = await factory.connect(owner).deploy();

  vePUL = await (await ethers.getContractFactory("PulsarDAOStaking")).connect(owner).deploy(pul.address, now + DAY, now + YEAR);
}

async function addLiquidity(account: SignerWithAddress, amount: BigNumber) {
  // deposit pul
  await pul.connect(account).transfer(pulWETHPair.address, amount);
  // received slp
  await pulWETHPair.connect(account).mint(amount);
}

async function stake(account: SignerWithAddress, amount: BigNumber) {
  await pulWETHPair.connect(account).transfer(chef.address, amount);
  await chef.setLP(alice.address, amount);
}

/*
npx hardhat test test/test-combined.ts
*/
describe("test-combined.ts", function () {
  it("test", async () => {
    await init();
    await pul.connect(alice).approve(vePUL.address, b(10n ** 14n));
    await pul.connect(bob).approve(vePUL.address, b(10n ** 14n));
    await pul.connect(charlie).approve(vePUL.address, b(10n ** 14n));
    await pul.connect(david).approve(vePUL.address, b(10n ** 14n));

    expect(0).eq(await combined.getSupply(pul.address, pulWETHPair.address));

    await pul.connect(alice).mint(b(200n));
    await addLiquidity(alice, b(100n));
    await stake(alice, b(50n));

    await pul.connect(bob).mint(b(200n));
    await addLiquidity(bob, b(100n));
    await stake(bob, b(50n));
    await vePUL.connect(bob).enter(b(10n));

    await pul.connect(charlie).mint(b(200n));
    await vePUL.connect(charlie).enter(b(50n));
    await addLiquidity(charlie, b(100n));

    await pul.connect(david).mint(b(200n));
    await vePUL.connect(david).enter(b(100n));

    expect(b(800n + 300n)).eq(await combined.getSupply(pul.address, pulWETHPair.address));

    expect(await getBlance(alice)).eq(await combined.getBalance(alice.address, chef.address, pul.address, pulWETHPair.address, vePUL.address));
    expect(await getBlance(bob)).eq(await combined.getBalance(bob.address, chef.address, pul.address, pulWETHPair.address, vePUL.address));
    expect(await getBlance(charlie)).eq(await combined.getBalance(charlie.address, chef.address, pul.address, pulWETHPair.address, vePUL.address));
    expect(await getBlance(david)).eq(await combined.getBalance(david.address, chef.address, pul.address, pulWETHPair.address, vePUL.address));
  });
});

async function getBlance(account: SignerWithAddress) {
  const totalPUL = await vePUL.getPULPool();
  const totalShares = await vePUL.totalSupply();
  const _share = await vePUL.balanceOf(account.address);
  const _stakedPUL = _share.mul(totalPUL).div(totalShares);
  
  const lpBalance = (await chef.userInfo(45, account.address))[0].add(await pulWETHPair.balanceOf(account.address));
  const lpAdjustedBalance = lpBalance.mul((await pul.balanceOf(pulWETHPair.address)).div(await pulWETHPair.totalSupply())).mul(2)
  const pulBalance = await pul.balanceOf(account.address);
  return pulBalance.add(lpAdjustedBalance).add(_stakedPUL);
}
