// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { ethers, upgrades } = require("hardhat");

async function main() {
  const stakeTokenAddress = "0x7268ba13a180866007f28a82bc38e6B25630e676";
  const rewardTokenAddress = "0x216683054c51DE9d3d69B83dc0D0b3056e18c54f";
  const treasuryAddress = "0x672883c16A2e70AA5F6444778CbF8E9E60ec6095";
  const minimumStake = BigInt(250000 * 10 ** 9);
  const minimumDistributeAmount = BigInt(1 * 10 ** 6);
  const vestingPeriod = 1000;
  const taxRate = 10;

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
