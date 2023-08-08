// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract StakeToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("StakeToken", "SKT") {
        _mint(msg.sender, initialSupply * 10 ** 9);
    }

    function decimals() public view virtual override returns (uint8) {
        return 9;
    }
}

contract RewardToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("RewardToken", "RWT") {
        _mint(msg.sender, initialSupply * 10 ** 6);
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}