// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");

async function main() {
  const StakeToken = await ethers.getContractFactory("StakeToken");

  const intitalSupply = BigInt("1000000000000000000");

  const stakeToken = await StakeToken.deploy(intitalSupply);

  await stakeToken.waitForDeployment();

  console.log(
    `deployed StakeToken to ${await stakeToken.getAddress()} with constructor args:`,
  );

  const RewardToken = await ethers.getContractFactory("RewardToken");

  const intitalSupply1 = BigInt("39026949359163005");

  const rewardToken = await RewardToken.deploy(intitalSupply1);

  await rewardToken.waitForDeployment();

  console.log(
    `deployed RewardToken to ${await rewardToken.getAddress()} with constructor args:`,
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
