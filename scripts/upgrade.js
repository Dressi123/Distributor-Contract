// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { ethers, upgrades } = require("hardhat");

async function main() {
  const Distributor2 = await ethers.getContractFactory("Distributor2");

  const distributorAddress = "<DISTRIBUTOR_ADDRESS>";

  const distributor2 = await upgrades.upgradeProxy(distributorAddress, Distributor2);

  await distributor2.waitForDeployment();

  console.log(
    `Upgraded Distributor to ${await distributor2.getAddress()} with constructor args:`,
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});