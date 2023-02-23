import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PulsarDAOStakingDev, MyERC20 } from '../typechain';
import { timestampInSecond } from '../utils/timestamp';
import { ETHER, UINT256_MAX, DAY } from '../utils/constants';

const provider = ethers.provider;
const utils = ethers.utils;

let owner: SignerWithAddress;
let alice: SignerWithAddress;
let bob: SignerWithAddress;
let charlie: SignerWithAddress;
let david: SignerWithAddress;

let pulToken: MyERC20;
let stakingPool: PulsarDAOStakingDev;

async function setupStakingPool(start: number, duration: number) {
  const MyERC20Factory = await ethers.getContractFactory('MyERC20');
  const PulsarDAOStakingFactory = await ethers.getContractFactory('PulsarDAOStakingDev');

  pulToken = await MyERC20Factory.deploy("MyERC20");
  stakingPool = await PulsarDAOStakingFactory.deploy(pulToken.address, start, duration);
}

async function grantTokenAndApprove(signer: SignerWithAddress, amount: bigint) {
  await pulToken.connect(signer).mint(amount);
  await pulToken.connect(signer).approve(stakingPool.address, UINT256_MAX);
}

describe('PulsarDAOStaking - TK', () => {
  beforeEach(async () => {
    expect(31337).eq((await provider.getNetwork()).chainId);
    [owner, alice, bob, charlie, david] = await ethers.getSigners();
  });

  describe('Constructor & default settings', () => {
    it('Should set a rewards duration', async () => {
      const startTime = timestampInSecond() + 3600;

      const PulsarDAOStakingFactory = await ethers.getContractFactory('PulsarDAOStaking');
      const MyERC20Factory = await ethers.getContractFactory('MyERC20');

      let pulToken = await MyERC20Factory.connect(owner).deploy('PUL');
      await expect(PulsarDAOStakingFactory.connect(owner).deploy(pulToken.address, startTime, 0))
        .to.be.revertedWith("PulsarDAOStaking: Invalid rewards duration");
    });

    it('Validate states', async () => {
      const startTime = timestampInSecond() + 3600;
      const MyERC20Factory = await ethers.getContractFactory('MyERC20');
      const PulsarDAOStakingFactory = await ethers.getContractFactory('PulsarDAOStaking');

      pulToken = await MyERC20Factory.connect(owner).deploy('PUL');
      stakingPool = await PulsarDAOStakingFactory.connect(owner).deploy(pulToken.address, startTime, DAY * 365);

      expect(await stakingPool.owner()).eq(owner.address);

      const poolConfig = await stakingPool.config();
      expect(poolConfig.periodStart).eq(startTime);
      expect(poolConfig.periodFinish).eq(startTime + DAY * 365);
      expect(poolConfig.totalReward).eq(0);

      expect(await stakingPool.pul()).eq(pulToken.address);
    })
  });

  describe('addRewardPUL(uint128)', () => {
    const startTime = timestampInSecond() + 3600;
    const duration = DAY * 7;
    const endTime = startTime + duration;

    beforeEach(async () => {
      await setupStakingPool(startTime, duration);
    })

    it('Should not add before reward period finished', async () => {
      await stakingPool.setblockTime(endTime + 10);

      await expect(stakingPool.addRewardPUL(ETHER * 1n))
        .to.be.revertedWith("PulsarDAOStaking: Adding rewards is forbidden");
    });

    it('Validate states', async () => {
      await stakingPool.setblockTime(startTime);
      await grantTokenAndApprove(alice, ETHER * 500n);
      await stakingPool.connect(alice).addRewardPUL(ETHER * 200n);

      expect(await (pulToken.balanceOf(stakingPool.address))).eq(ETHER * 200n);
      expect((await stakingPool.config()).totalReward).eq(ETHER * 200n);
    });
  });

  describe('enter(uint256)', () => {
    const startTime = timestampInSecond() + 3600;
    const duration = DAY * 7;
    const endTime = startTime + duration;
    const rewardPerSecond = ETHER * 953n;

    beforeEach(async () => {
      await setupStakingPool(startTime, duration);
    })

    it('Should not stake 0', async () => {
      await grantTokenAndApprove(alice, ETHER * 100n);

      expect(stakingPool.connect(alice).enter(0n))
        .to.be.revertedWith("PulsarDAOStaking: Should at least stake something");
    });

    it('Stake when pool is empty', async () => {
      await grantTokenAndApprove(alice, ETHER * 100n);
      await stakingPool.connect(alice).enter(ETHER * 50n);

      // Transfer correct amount of vePUL
      expect(await stakingPool.totalSupply()).eq(ETHER * 50n);
      expect(await stakingPool.balanceOf(alice.address)).eq(ETHER * 50n);

      // Stake correct amount of PUL
      expect(await pulToken.balanceOf(stakingPool.address)).eq(ETHER * 50n);
    });

    it('Stake when pool is empty', async () => {
      await grantTokenAndApprove(alice, ETHER * 100n);
      await stakingPool.connect(alice).enter(ETHER * 50n);

      // Transfer correct amount of vePUL
      expect(await stakingPool.totalSupply()).eq(ETHER * 50n);
      expect(await stakingPool.balanceOf(alice.address)).eq(ETHER * 50n);

      // Stake correct amount of PUL
      expect(await pulToken.balanceOf(stakingPool.address)).eq(ETHER * 50n);
    });

    it('Multiple staking across different time frames', async () => {
      const rewardAmount = rewardPerSecond * BigInt(duration);
      await grantTokenAndApprove(alice, rewardAmount);
      await stakingPool.connect(alice).addRewardPUL(rewardAmount);

      await grantTokenAndApprove(alice, ETHER * 600n);
      await grantTokenAndApprove(bob, ETHER * 100n);
      await grantTokenAndApprove(charlie, ETHER * 300n);

      // Inject 7 * rewardPerSecond into the pool
      await stakingPool.setblockTime(startTime + 7);
      await stakingPool.connect(alice).enter(ETHER * 600n);

      // Inject 8 * rewardPerSecond into the pool
      await stakingPool.setblockTime(startTime + 7 + 8);
      await stakingPool.connect(bob).enter(ETHER * 100n);
      await stakingPool.connect(charlie).enter(ETHER * 150n);

      // Inject 4 * rewardPerSecond into the pool
      await stakingPool.setblockTime(startTime + 7 + 8 + 4);
      await stakingPool.connect(charlie).enter(ETHER * 150n);

      expect(await stakingPool.getPULPool()).eq(ETHER * 19107n);
      expect(await stakingPool.totalSupply()).eq(ETHER * 600n + 4028197381671701913n + 10869566949657254205n)
      expect(await stakingPool.balanceOf(alice.address)).eq(ETHER * 600n);
      expect(await stakingPool.balanceOf(bob.address)).eq(4028197381671701913n);
      expect(await stakingPool.balanceOf(charlie.address)).eq(10869566949657254205n);
    });
  });



  describe('Integration tests', () => {
    const startTime = timestampInSecond() + 3600;
    const duration = DAY * 7;
    const endTime = startTime + duration;
    const rewardPerSecond = ETHER * 953n;

    beforeEach(async () => {
      await setupStakingPool(startTime, duration);
    });

    it('Stake before pool reward starts', async () => {

    });

    it('Enter and leave', async () => {
      const rewardAmount = rewardPerSecond * BigInt(duration);
      await grantTokenAndApprove(alice, rewardAmount);
      await stakingPool.connect(alice).addRewardPUL(rewardAmount);

      await grantTokenAndApprove(alice, ETHER * 600n);
      await grantTokenAndApprove(bob, ETHER * 100n);
      await grantTokenAndApprove(charlie, ETHER * 300n);

      // Inject 7 * rewardPerSecond into the pool
      await stakingPool.setblockTime(startTime + 7);
      await stakingPool.connect(alice).enter(ETHER * 600n);

      // Inject 8 * rewardPerSecond into the pool
      await stakingPool.setblockTime(startTime + 7 + 8);
      await stakingPool.connect(bob).enter(ETHER * 100n);
      await stakingPool.connect(charlie).enter(ETHER * 150n);

      // Inject 4 * rewardPerSecond into the pool
      await stakingPool.setblockTime(startTime + 7 + 8 + 4);
      await stakingPool.connect(charlie).enter(ETHER * 150n);

      // Inject 6 * rewardPerSecond into the pool
      await stakingPool.setblockTime(startTime + 7 + 8 + 4 + 6);
      await stakingPool.connect(charlie).leave(10869566949657254205n);

      // Inject 1 * rewardPerSecond into the pool
      await stakingPool.setblockTime(startTime + 7 + 8 + 4 + 6 + 1);
      await stakingPool.connect(bob).leave(4028197381671701913n);
      await stakingPool.connect(alice).leave(ETHER * 600n);

      expect(await stakingPool.getPULPool()).eq(0);
      expect(await stakingPool.totalSupply()).eq(0)
      expect(await pulToken.balanceOf(alice.address)).eq(25170183588363787815223n);
      expect(await pulToken.balanceOf(bob.address)).eq(168984112711405087698n);
      expect(await pulToken.balanceOf(charlie.address)).eq(438832298924807097079n);
    });
  });
});
