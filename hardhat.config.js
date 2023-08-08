require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("@openzeppelin/hardhat-upgrades");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    },
  },
  networks: {
    sepolia: {
      url: `${process.env.INFURA_URL}${process.env.INFURA_KEY}`,
      accounts: [process.env.PRIVATE_KEY]
    },
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY
  },
};
