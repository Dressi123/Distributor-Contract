# Distributor Smart Contract

The Distributor contract is a staking and reward system on the Ethereum blockchain. Users can deposit tokens and earn rewards based on their stake. The more you stake, the more rewards you earn.

A standout feature is the vesting mechanism. When users stake tokens, they're set on a timer. If they pull out early, they face a tax which goes to a treasury wallet. This encourages longer-term staking and commitment. To efficiently manage these vesting schedules, the contract employs a minheap data structure, ensuring optimal performance during withdrawals.

Safety is a priority. The contract uses the OpenZeppelin library, a trusted name in Ethereum. Plus, with the UUPS proxy pattern, the contract can be updated without hassles.

In short, The Distributor contract is all about rewarding users for staking, with built-in mechanisms for fairness, efficiency, and security.

> Note: While the contract has been thoroughly tested, it's always recommended to run and test the contract on a testnet before deploying to the mainnet.

## Contract Overview

### Main Functions:

- `initialize`: Sets up the initial state of the contract.
- `Deposit`: Allows users to deposit tokens into the contract.
- `Distribute`: Distributes rewards to all stakers based on their stake.
- `Claim`: Allows users to claim their accumulated rewards.
- `Withdraw`: Allows users to withdraw their staked tokens and rewards.
- `UpdateMinStake`: Updates the minimum stake required.
- `UpdateMinDistributeAmount`: Updates the minimum distribution amount.
- `UpdateVestingPeriod`: Updates the vesting period.
- `UpdateTaxRate`: Updates the tax rate.
- `UpdateTreasury`: Updates the treasury address.
- `UpdateStakeToken`: Updates the staking token.
- `UpdateRewardToken`: Updates the reward token.
- `EmergencyRecoverTokens`: Recovers any ERC20 tokens sent to the contract by mistake.

### Events:

- `Deposited`: Emitted when a user deposits tokens.
- `Distributed`: Emitted when rewards are distributed.
- `Claimed`: Emitted when a user claims rewards.
- `Withdrawn`: Emitted when a user withdraws tokens and rewards.
- `MinStakeUpdated`: Emitted when the minimum stake is updated.
- `MinDistributeUpdated`: Emitted when the minimum distribution amount is updated.
- `VestingPeriodUpdated`: Emitted when the vesting period is updated.
- `TaxRateUpdated`: Emitted when the tax rate is updated.
- `TreasuryUpdated`: Emitted when the treasury address is updated.
- `StakeTokenUpdated`: Emitted when the staking token is updated.
- `RewardTokenUpdated`: Emitted when the reward token is updated.
- `Recovered`: Emitted when tokens are recovered.

## Installation

1. Clone the repository:
```shell
git clone [repository_link]
```
2. Navigate to the project directory:
```shell
cd distributor-contract
```
3. Install the required dependencies:
```shell
npm install
```
4. Rename `.env.template` to `.env` and fill it out with your own keys
```YAML
INFURA_KEY=
PRIVATE_KEY=
COINMARKETCAP_API_KEY=
```
5. Compile the smart contract:
```shell
npx hardhat compile
```
6. Run tests to ensure the contract is working as expected:
```shell
npx hardhat test
```
> Note: While the contract has been thoroughly tested, it's always recommended to run and test the contract on a testnet before deploying to the mainnet.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
