// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PulsarDAOStaking is ERC20("vePUL", "vePUL"), Ownable {
    using SafeERC20 for IERC20;
    using SafeCast for int256;
    using SafeCast for uint256;

    struct Config {
        // Timestamp in seconds is small enough to fit into uint64
        uint64 periodFinish;
        uint64 periodStart;

        // Staking incentive rewards to distribute in a steady rate
        uint128 totalReward;
    }

    IERC20 public pul;
    Config public config;

    /*
     * Construct an PulsarDAOStaking contract.
     *
     * @param _pul the contract address of PUL token
     * @param _periodStart the initial start time of rewards period
     * @param _rewardsDuration the duration of rewards in seconds
     */
    constructor(IERC20 _pul, uint64 _periodStart, uint64 _rewardsDuration) {
        require(address(_pul) != address(0), "PulsarDAOStaking: _pul cannot be the zero address");
        pul = _pul;
        setPeriod(_periodStart, _rewardsDuration);
    }

    /*
     * Add PUL tokens to the reward pool.
     *
     * @param _pulAmount the amount of PUL tokens to add to the reward pool
     */
    function addRewardPUL(uint256 _pulAmount) external {
        Config memory cfg = config;
        require(block.timestamp < cfg.periodFinish, "PulsarDAOStaking: Adding rewards is forbidden");

        pul.safeTransferFrom(msg.sender, address(this), _pulAmount);
        cfg.totalReward += _pulAmount.toUint128();
        config = cfg;
    }

    /*
     * Set the reward peroid. If only possible to set the reward period after last rewards have been
     * expired.
     *
     * @param _periodStart timestamp of reward starting time
     * @param _rewardsDuration the duration of rewards in seconds
     */
    function setPeriod(uint64 _periodStart, uint64 _rewardsDuration) public onlyOwner {
        require(_periodStart >= block.timestamp, "PulsarDAOStaking: _periodStart shouldn't be in the past");
        require(_rewardsDuration > 0, "PulsarDAOStaking: Invalid rewards duration");

        Config memory cfg = config;
        require(cfg.periodFinish < block.timestamp, "PulsarDAOStaking: The last reward period should be finished before setting a new one");

        uint64 _periodFinish = _periodStart + _rewardsDuration;
        config.periodStart = _periodStart;
        config.periodFinish = _periodFinish;
        config.totalReward = 0;
    }

    /*
     * Returns the staked pul + release rewards
     *
     * @returns amount of available pul
     */
    function getPULPool() public view returns(uint256) {
        return pul.balanceOf(address(this)) - frozenRewards();
    }

    /*
     * Returns the frozen rewards
     *
     * @returns amount of frozen rewards
     */
    function frozenRewards() public view returns(uint256) {
        Config memory cfg = config;

        uint256 time = block.timestamp;
        uint256 remainingTime;
        uint256 duration = uint256(cfg.periodFinish) - uint256(cfg.periodStart);

        if (time <= cfg.periodStart) {
            remainingTime = duration;
        } else if (time >= cfg.periodFinish) {
            remainingTime = 0;
        } else {
            remainingTime = cfg.periodFinish - time;
        }

        return remainingTime * uint256(cfg.totalReward) / duration;
    }

    /*
     * Staking specific amount of PUL token and get corresponding amount of vePUL
     * as the user's share in the pool
     *
     * @param _pulAmount
     */
    function enter(uint256 _pulAmount) external {
        require(_pulAmount > 0, "PulsarDAOStaking: Should at least stake something");

        uint256 totalPUL = getPULPool();
        uint256 totalShares = totalSupply();

        pul.safeTransferFrom(msg.sender, address(this), _pulAmount);

        if (totalShares == 0 || totalPUL == 0) {
            _mint(msg.sender, _pulAmount);
        } else {
            uint256 _share = _pulAmount * totalShares / totalPUL;
            _mint(msg.sender, _share);
        }
    }

    /*
     * Redeem specific amount of vePUL to PUL tokens according to the user's share in the pool.
     * vePUL will be burnt.
     *
     * @param _share
     */
    function leave(uint256 _share) external {
        require(_share > 0, "PulsarDAOStaking: Should at least unstake something");

        uint256 totalPUL = getPULPool();
        uint256 totalShares = totalSupply();

        _burn(msg.sender, _share);

        uint256 _pulAmount = _share * totalPUL / totalShares;
        pul.safeTransfer(msg.sender, _pulAmount);
    }
}
