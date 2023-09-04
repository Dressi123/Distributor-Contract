// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { ethers, upgrades } = require("hardhat");

async function main() {
  const stakeTokenAddress = "<STAKE_TOKEN_ADDRESS>"; 
  const rewardTokenAddress = "<REWARD_TOKEN_ADDRESS>"; 
  const treasuryAddress = "<TREASURY_ADDRESS>"; 
  const minimumStake = BigInt(250000 * 10 ** 9); // 250k tokens
  const minimumDistributeAmount = BigInt(1 * 10 ** 6); // 1 token
  const vestingPeriod = 604800; // 7 days
  const taxRate = 10; // 10%

  const Distributor = await ethers.getContractFactory("Distributor");

  const distributor = await upgrades.deployProxy(Distributor, [
    stakeTokenAddress, rewardTokenAddress, treasuryAddress,
    minimumStake, minimumDistributeAmount, vestingPeriod, taxRate
  ], { kind: "uups" });

  await distributor.waitForDeployment();

  console.log(
    `deployed Distributor to ${await distributor.getAddress()} with constructor args:`,
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});