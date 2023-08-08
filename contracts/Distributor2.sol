// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// this is a test to see the upgradeability of a contract

import "./Distributor.sol";

contract Distributor2 is Distributor {

    uint public testVariable;

    function testFunction() external {
        testVariable += 1;
    }
}