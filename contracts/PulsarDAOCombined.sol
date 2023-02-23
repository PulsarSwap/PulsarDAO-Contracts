// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IMasterChefV2UserInfo {
    function userInfo(uint256 pid, address account) external view returns (uint256, uint256);
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IPulsarDAOStaking is IERC20 {
    function getPULPool() external view returns(uint256);
}

contract PulsarDAOCombined {
    IMasterChefV2UserInfo public constant _chefV2 = IMasterChefV2UserInfo(0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d);
    IERC20 public constant _pulWETHPair = IERC20(0xB84C45174Bfc6b8F3EaeCBae11deE63114f5c1b2);
    IERC20 public constant _pulToken = IERC20(0x3b484b82567a09e2588A13D54D032153f0c0aEe0);
    IPulsarDAOStaking public constant _vePULToken = IPulsarDAOStaking(0xEDd27C961CE6f79afC16Fd287d934eE31a90D7D1);

    uint256 private constant PUL_WETH_POOL_ID = 45;

    function balanceOf(address account) external view returns (uint256) {
        return getBalance(account, _chefV2, _pulToken, _pulWETHPair, _vePULToken);
    }

    function getBalance(address account, IMasterChefV2UserInfo chefV2, IERC20 pulToken, IERC20 pulWETHPair, IPulsarDAOStaking vePULToken) public view returns (uint256) {
        uint256 pulBalance = pulToken.balanceOf(account);

        // vePUL Balance
        uint256 _stakedPUL = 0;
        {
            uint256 totalPUL = vePULToken.getPULPool();
            uint256 totalShares = vePULToken.totalSupply();
            uint256 _share = vePULToken.balanceOf(account);
            if (totalShares != 0) {
                _stakedPUL = _share * totalPUL / totalShares;
            }
        }

        // LP Provider

        (uint256 lpStakedBalance, ) = chefV2.userInfo(PUL_WETH_POOL_ID, account);
        uint256 lpUnstaked = pulWETHPair.balanceOf(account);
        uint256 lpBalance = lpStakedBalance + lpUnstaked;

        uint256 lpAdjustedBalance = lpBalance * pulToken.balanceOf(address(pulWETHPair)) / pulWETHPair.totalSupply() * 2;

        // Sum them up!

        uint256 combinedPULBalance = pulBalance + lpAdjustedBalance + _stakedPUL;
        return combinedPULBalance;
    }

    function totalSupply() external view returns (uint256) {
        return getSupply(_pulToken, _pulWETHPair);
    }

    function getSupply(IERC20 pulToken, IERC20 pulWETHPair) public view returns (uint256) {
        return pulToken.totalSupply() + pulToken.balanceOf(address(pulWETHPair));
    }

    function name() external pure returns (string memory) { return "cPUL"; }
    function symbol() external pure returns (string memory) { return "PulsarDAOCombined"; }
    function decimals() external view returns (uint8) { return _pulToken.decimals(); }
    function allowance(address, address) external pure returns (uint256) { return 0; }
    function approve(address, uint256) external pure returns (bool) { return false; }
    function transfer(address, uint256) external pure returns (bool) { return false; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return false; }
}
