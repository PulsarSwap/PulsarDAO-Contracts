/* eslint-disable prefer-const */
/* eslint-disable node/no-missing-import */
/* eslint-disable prettier/prettier */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { PulsarDAOStakingDev, MyERC20 } from "../typechain";
import { timestampInSecond } from "../utils/timestamp";
import { MONTH, MINUTE, DAY, YEAR, HOUR } from "../utils/constants";
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

let PUL: MyERC20;
let vePUL: PulsarDAOStakingDev;

async function init(start: number, duration: number) {
  expect(31337).eq((await provider.getNetwork()).chainId);
  [owner, alice, bob, charlie, david] = await ethers.getSigners();

  const MyERC20Factory = await ethers.getContractFactory("MyERC20");
  PUL = await MyERC20Factory.connect(owner).deploy("PUL");

  const PulsarDAOPoolFactory = await ethers.getContractFactory("PulsarDAOStakingDev");
  vePUL = await PulsarDAOPoolFactory.connect(owner).deploy(PUL.address, start, duration);

  await vePUL.setblockTime(now);
}

async function depositPUL(signer: SignerWithAddress, amount: bigint) {
  await PUL.connect(signer).mint(e(amount));
  await PUL.connect(signer).approve(vePUL.address, e(BigInt(1e14)));
}

// eslint-disable-next-line no-unused-vars
function e2b(amount: bigint): BigNumber { return BigNumber.from(amount.toString()) }
function e(amount: bigint): bigint { return amount * BigInt(1e18) }
function b(amount: bigint): BigNumber { return utils.parseEther(amount.toString()) }
function b2e(amount: BigNumber): bigint { return BigInt(amount.toString()) }

async function advance(duration: number): Promise<number> {
  const t = (await vePUL.blockTime()).toNumber() + duration;
  now = t;
  await vePUL.connect(owner).setblockTime(t);
  return t;
}

async function predictEneter(_pulAmount: bigint): Promise<bigint> {
  const totalPUL = BigInt((await vePUL.getPULPool()).toString());
  const totalShares = BigInt((await vePUL.totalSupply()).toString());
  if (totalShares === 0n || totalPUL === 0n) {
    return _pulAmount;
  } else {
    return _pulAmount * totalShares / totalPUL;
  }
}

async function predictLeave(_share: bigint): Promise<bigint> {
  const totalPUL = BigInt((await vePUL.getPULPool()).toString());
  const totalShares = BigInt((await vePUL.totalSupply()).toString());
  return _share * totalPUL / totalShares;
}

async function getPULPoolTS(): Promise<bigint> {
  const cfg = await vePUL.config();
  const duration = b2e(cfg.periodFinish) - b2e(cfg.periodStart);
  let remainingTime: bigint;
  if (now <= cfg.periodStart.toNumber()) {
    remainingTime = duration;
  } else if (now >= cfg.periodFinish.toNumber()) {
    remainingTime = 0n;
  } else {
    remainingTime = BigInt(cfg.periodFinish.toNumber() - now);
  }
  const pulPool = b2e(await PUL.balanceOf(vePUL.address));
  return pulPool - remainingTime * b2e(cfg.totalReward) / duration;
}

/*
npx hardhat test test/test-pool.ts
*/
describe("test-pool.ts", function () {
  it("limitation min", async () => {
    const totalReward = BigInt(2e13);
    await init(now + DAY, YEAR);

    await depositPUL(david, totalReward);
    await vePUL.connect(david).addRewardPUL(e(totalReward));

    await PUL.connect(alice).mint(1);
    await PUL.connect(alice).approve(vePUL.address, e(BigInt(1e14)));

    let value = await predictEneter(1n);
    await vePUL.connect(alice).enter(1);
    expect(value).eq(await vePUL.balanceOf(alice.address));
    expect(1n).eq(value);

    await advance(YEAR * 2);

    let leaveValue = await predictLeave(value);
    await vePUL.connect(alice).leave(value);
    expect(leaveValue).eq(await PUL.balanceOf(alice.address));
    expect(leaveValue).eq(20000000000000000000000000000001n);
    expect(0n).eq(await vePUL.balanceOf(alice.address));
    // expect(BigInt(2e31) + 1n).eq(leaveValue);
    expect(BigInt(2e13) * BigInt(1e18) + 1n).eq(leaveValue);
    // console.log(leaveValue)
    // console.log(BigInt(2e13) * BigInt(1e18) + 1n)
  });

  it("limitation max", async () => {
    const otherPUL = BigInt(1e14 - 2e13);
    const totalReward = BigInt(2e13);
    await init(now + DAY, YEAR);

    await depositPUL(david, totalReward);
    await vePUL.connect(david).addRewardPUL(e(totalReward));

    await depositPUL(alice, otherPUL);
    let value = await predictEneter(e(otherPUL));
    await vePUL.connect(alice).enter(b(otherPUL));
    expect(value).eq(await vePUL.balanceOf(alice.address));

    await advance(YEAR * 2);

    value = await predictLeave(value);
    await vePUL.connect(alice).leave(await vePUL.balanceOf(alice.address));
    expect(value).eq(await PUL.balanceOf(alice.address));
    expect(0n).eq(await vePUL.balanceOf(alice.address));
    expect(e(BigInt(1e14))).eq(value);
  });

  it("setPeriod should fail", async () => {
    await init(now + DAY, YEAR);

    await expect(vePUL.connect(owner).setPeriod(now, 0)).to
      .revertedWith("PulsarDAOStaking: Invalid rewards duration");

    await expect(vePUL.connect(owner).setPeriod(now + MONTH, YEAR)).to
      .revertedWith("PulsarDAOStaking: The last reward period should be finished before setting a new one");

    await advance(YEAR + MONTH);
    await vePUL.connect(owner).setPeriod(now, YEAR);
  });

  it("addRewardPUL should fail", async () => {
    await init(now + DAY, YEAR);

    const totalReward = BigInt(2e13);
    await depositPUL(owner, totalReward);

    await advance(YEAR + DAY);
    await expect(vePUL.connect(owner).addRewardPUL(e(totalReward)))
      .to.revertedWith("PulsarDAOStaking: Adding rewards is forbidden");

    await advance(YEAR + DAY);
    await vePUL.connect(owner).setPeriod(now, YEAR);
    await vePUL.connect(owner).addRewardPUL(e(totalReward));
  });

  it("before faucet with addReward", async () => {
    const totalReward = BigInt(2e13);
    await init(now + DAY, YEAR);

    // initial user
    await depositPUL(alice, 100n);
    await depositPUL(bob, 100n);
    await depositPUL(charlie, 100n);
    await depositPUL(owner, totalReward);

    // initial pool
    await vePUL.connect(owner).addRewardPUL(e(totalReward));
    expect(0).eq(await vePUL.getPULPool());

    // check config
    const config = await vePUL.config();
    expect(now + DAY).eq(config.periodStart.toNumber());
    expect(now + DAY + YEAR).eq(config.periodFinish.toNumber());
    expect(b(totalReward)).eq(config.totalReward);

    await vePUL.connect(alice).enter(b(100n));
    await vePUL.connect(bob).enter(b(100n));
    await vePUL.connect(charlie).enter(b(100n));

    expect(0).eq(await PUL.balanceOf(alice.address));
    expect(0).eq(await PUL.balanceOf(bob.address));
    expect(0).eq(await PUL.balanceOf(charlie.address));

    expect(b(300n)).eq(await vePUL.getPULPool());
    expect(b(100n)).eq(await vePUL.balanceOf(alice.address));
    expect(b(100n)).eq(await vePUL.balanceOf(bob.address));
    expect(b(100n)).eq(await vePUL.balanceOf(charlie.address));

    await advance(DAY * 2);
    expect(await getPULPoolTS()).eq(await vePUL.getPULPool());

    let value = await predictLeave(e(100n));
    await vePUL.connect(alice).leave(b(100n));
    expect(0).eq(await vePUL.balanceOf(alice.address));
    expect(value).eq(await PUL.balanceOf(alice.address));

    await advance(MONTH * 5);

    value = await predictLeave(e(100n));
    await vePUL.connect(bob).leave(b(100n));
    expect(0).eq(await vePUL.balanceOf(bob.address));
    expect(value).eq(await PUL.balanceOf(bob.address));

    value = await predictLeave(e(100n));
    await vePUL.connect(charlie).leave(b(100n));
    expect(0).eq(await vePUL.balanceOf(charlie.address));
    expect(value).eq(await PUL.balanceOf(charlie.address));

    expect(0).eq(await vePUL.getPULPool());
    expect(0n).eq(await getPULPoolTS());
  });

  it("after faucet with addReward", async () => {
    await init(now + DAY, DAY);
    await depositPUL(owner, e(1000n));
    await vePUL.connect(owner).addRewardPUL(e(1000n));
    await advance(YEAR);

    expect(e(1000n)).eq(await vePUL.getPULPool());

    await depositPUL(alice, 100n);
    await depositPUL(bob, 100n);

    let value = await predictEneter(e(100n));
    await vePUL.connect(alice).enter(e(100n));
    expect(e(1100n)).eq(await vePUL.getPULPool());
    expect(value).eq(await vePUL.balanceOf(alice.address));

    // bob predict
    value = await predictEneter(e(100n));
    await vePUL.connect(bob).enter(e(100n));
    expect(value).eq(await vePUL.balanceOf(bob.address));

    expect(e(1200n)).eq(await vePUL.getPULPool());

    await advance(MONTH);

    let share = await vePUL.balanceOf(bob.address);
    value = await predictLeave(b2e(share));
    await vePUL.connect(bob).leave(share);
    expect(value).eq(await PUL.balanceOf(bob.address));

    share = await vePUL.balanceOf(alice.address);
    value = await predictLeave(b2e(share));
    await vePUL.connect(alice).leave(share);
    expect(value).eq(await PUL.balanceOf(alice.address));
  });

  it("before faucet with contribution", async () => {
    await init(now + YEAR, YEAR);
    await depositPUL(alice, 100n);
    await depositPUL(owner, 100000n);
    await PUL.mintTo(vePUL.address, b(100n));
    expect(e(100n)).eq(await vePUL.getPULPool());

    let value = await predictEneter(e(100n));
    await vePUL.connect(alice).enter(e(100n));
    expect(e(200n)).eq(await vePUL.getPULPool());
    expect(0).eq(await PUL.balanceOf(alice.address));
    expect(value).eq(await vePUL.balanceOf(alice.address));

    value = await predictLeave(e(100n));
    await vePUL.connect(alice).leave(e(100n));
    expect(value).eq(await PUL.balanceOf(alice.address));
    expect(0).eq(await vePUL.balanceOf(alice.address));
    expect(0).eq(await vePUL.getPULPool());

    // alice + bob

    await depositPUL(bob, 100n);
    await vePUL.connect(alice).enter(e(200n));

    // predict bob
    value = await predictEneter(e(100n));
    await vePUL.connect(bob).enter(e(100n));
    expect(value).eq(await vePUL.balanceOf(bob.address));

    await PUL.mintTo(vePUL.address, b(300n));

    const aliceShare = await vePUL.balanceOf(alice.address);
    const bobShare = await vePUL.balanceOf(bob.address);
    expect(e(200n)).eq(aliceShare);
    expect(e(100n)).eq(bobShare);

    expect(e(600n)).eq(await vePUL.getPULPool());
    await advance(MONTH);

    value = await predictLeave(b2e(aliceShare));
    await vePUL.connect(alice).leave(aliceShare);
    expect(0).eq(await vePUL.balanceOf(alice.address));
    expect(value).eq(await PUL.balanceOf(alice.address));

    value = await predictLeave(b2e(bobShare));
    await vePUL.connect(bob).leave(bobShare);
    expect(0).eq(await vePUL.balanceOf(bob.address));
    expect(value).eq(await PUL.balanceOf(bob.address));

    expect(0).eq(await vePUL.getPULPool());
  });

  it("without any injection of pul", async () => {
    async function f() {
      await depositPUL(alice, 100n);
      await depositPUL(bob, 100n);
      await depositPUL(charlie, 100n);

      const value = await predictEneter(e(100n));
      await vePUL.connect(alice).enter(e(100n));
      await vePUL.connect(bob).enter(e(100n));
      await vePUL.connect(charlie).enter(e(100n));

      expect(0).eq(await PUL.balanceOf(alice.address));
      expect(0).eq(await PUL.balanceOf(bob.address));
      expect(0).eq(await PUL.balanceOf(charlie.address));

      expect(e(100n)).eq(await vePUL.balanceOf(alice.address));
      expect(e(100n)).eq(await vePUL.balanceOf(bob.address));
      expect(e(100n)).eq(await vePUL.balanceOf(charlie.address));
      expect(value).eq(await vePUL.balanceOf(alice.address));
      expect(value).eq(await vePUL.balanceOf(bob.address));
      expect(value).eq(await vePUL.balanceOf(charlie.address));

      await expect(vePUL.connect(alice).leave(0)).to.be.revertedWith("PulsarDAOStaking: Should at least unstake something");

      const leave = await predictLeave(e(100n));

      await vePUL.connect(alice).leave(e(100n));
      await vePUL.connect(bob).leave(e(100n));
      await vePUL.connect(charlie).leave(e(100n));

      expect(leave).eq(await PUL.balanceOf(alice.address));
      expect(leave).eq(await PUL.balanceOf(bob.address));
      expect(leave).eq(await PUL.balanceOf(charlie.address));
      expect(e(100n)).eq(await PUL.balanceOf(alice.address));
      expect(e(100n)).eq(await PUL.balanceOf(bob.address));
      expect(e(100n)).eq(await PUL.balanceOf(charlie.address));

      expect(0).eq(await vePUL.balanceOf(alice.address));
      expect(0).eq(await vePUL.balanceOf(bob.address));
      expect(0).eq(await vePUL.balanceOf(charlie.address));
    }

    await init(now + HOUR, HOUR);
    await vePUL.setblockTime(now);
    await f();

    await init(now - MINUTE * 30, HOUR);
    await vePUL.setblockTime(now);
    await f();

    await init(now - HOUR * 2, HOUR);
    await vePUL.setblockTime(now);
    await f();
  });
});
