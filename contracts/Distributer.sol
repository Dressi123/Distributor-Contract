// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

contract Distributor is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bool private initialized;

    IERC20Upgradeable public stakeToken;
    IERC20Upgradeable public rewardToken;

    address public treasury;

    // roles for the contract
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

    // total amount of tokens staked
    uint public totalStake;
    // used to keep track of how much reward each staked token is entitled to
    uint public rewardPerStake;
    // total amount of rewards distributed to stakers so far
    uint public totalRewardsDistributed;

    // minimum of stake required to be eligible for rewards
    uint public minStake;

    // vesting period for rewards
    uint public vestingPeriod;

    // tax rate for withdrawing before the vesting period is over
    uint public taxRate;

    // used to keep track of vesting entries
    struct VestingEntry {
        uint amount;
        uint endTime;
    }
    // used to keep track of vesting entries in a min heap
    struct MinHeap {
        VestingEntry[] entries;
    }

    // keeps track of each user's stake
    mapping (address => uint) userStakes;
    // keeps track of each user's rewardPerStake at the time of their last deposit
    mapping (address => uint) rewardPerStakeAtDeposit;
    // keeps track of each user's rewards that have accumulated since their first deposit or last claim
    mapping (address => uint) userRewards;
    // keeps track of each user's total rewards claimed
    mapping (address => uint) totalUserRewardsClaimed;
    // keeps track of each user's vesting entries in a min heap
    mapping (address => MinHeap) userVestings;

    // events to notify the frontend when deposits, distributions, claims, and withdrawals occur
    event Deposited(address user, uint amount);
    event Distributed(uint rewardAmount, uint totalStake);
    event Claimed(address user, uint amount);
    event Withdrawn(address user, uint stakeTokenAmount, uint rewardTokenAmount);
    event MinStakeUpdated(uint newMinStake);
    event VestingPeriodUpdated(uint newVestingPeriod);
    event TaxRateUpdated(uint newTaxRate);
    event TreasuryUpdated(address newTreasury);
    event StakeTokenUpdated(address newStakeToken);
    event RewardTokenUpdated(address newRewardToken);
    event Recovered(address token, uint amount);

    // initializes the contract with the given token address (only called once during deployment)
    function initialize(
        IERC20Upgradeable _stakeToken, IERC20Upgradeable _rewardToken, 
        address _treasury, uint _minimumStake, 
        uint _vestingPeriod, uint _taxRate
    ) public initializer {
        require(!initialized, "Contract instance has already been initialized");
        require(_treasury != address(0), "Treasury address cannot be 0x0");
        require(_minimumStake > 0, "Minimum stake must be greater than 0");
        require(_vestingPeriod > 0, "Vesting period must be greater than 0");
        initialized = true;

        // set up the roles for the contract
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DISTRIBUTOR_ROLE, msg.sender);

        stakeToken = _stakeToken;
        rewardToken = _rewardToken;
        treasury = _treasury;
        totalStake = 0;
        rewardPerStake = 0;


        // set the minimum stake to the given amount (in its smallest denomination)
        minStake = _minimumStake;

        // set the vesting period to the given amount (in seconds)
        vestingPeriod = _vestingPeriod;

        // set the tax rate to the given amount (in percent ex 10% = 10)
        taxRate = _taxRate;

    }
    // invokes the _disableInitializers function to automatically lock the initializer forever;
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // allows the contract owner to update the contract using the UUPS proxy pattern
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // deposits the given amount of tokens to the contract and updates the user's stake
    function Deposit(uint _amount) external {
        require(_amount > 0, "Deposit amount must be greater than 0");
        require(stakeToken.balanceOf(msg.sender) >= _amount, "User does not have enough tokens to deposit");
        require(stakeToken.allowance(msg.sender, address(this)) >= _amount, "User has not approved the contract to spend tokens on their behalf");
        require(userStakes[msg.sender] + _amount >= minStake, "User must deposit at least the minimum stake");

        // Create a new vesting entry for this deposit
        VestingEntry memory entry = VestingEntry(_amount, block.timestamp + vestingPeriod);
        insert(userVestings[msg.sender], entry);

        // calculate the user's rewards since their last deposit
        uint userReward = userStakes[msg.sender] * (rewardPerStake - rewardPerStakeAtDeposit[msg.sender]);
        userRewards[msg.sender] += userReward;

        userStakes[msg.sender] += _amount;
        // update the rewardPerStakeAtDeposit to the current rewardPerStake
        rewardPerStakeAtDeposit[msg.sender] = rewardPerStake;
        totalStake += _amount;
        // transfer the tokens from the user to the contract 
        // (requires the user to have approved the contract to spend tokens on their behalf)
        stakeToken.safeTransferFrom(msg.sender, address(this), _amount);
        // emit an event to notify the frontend
        emit Deposited(msg.sender, _amount);
    }

    // distributes the given amount of tokens to all stakers based on their stake
    function Distribute(uint _rewardAmount) external {
        require(_rewardAmount > 0, "Reward amount must be greater than 0");
        require(hasRole(DISTRIBUTOR_ROLE, msg.sender), "Caller is not an approved distributor");
        require(totalStake > 0, "Nothing is staked yet, so no users to distribute to");
        require(_rewardAmount >= totalStake, "Reward amount must be greater than or equal to the total stake");
        require(rewardToken.balanceOf(msg.sender) >= _rewardAmount, "Distributor does not have enough tokens to distribute");
        // transfer the tokens from the distributor to the contract
        rewardToken.safeTransferFrom(msg.sender, address(this), _rewardAmount);
        // we need to subtract the totalRewardsDistributed from the total tokens to get the new tokens + tokens received outside of the distribute function if any
        uint totalTokens = rewardToken.balanceOf(address(this)) - totalRewardsDistributed;
        // update the rewardPerStake to reflect the new rewards
        rewardPerStake += totalTokens / totalStake;
        // update the totalRewardsDistributed to keep track of the total rewards distributed
        totalRewardsDistributed += totalTokens;
        // emit an event to notify the frontend
        emit Distributed(_rewardAmount, totalStake);
    }

    // transfers the accumulated rewards back to the user without withdrawing the deposited tokens
    function Claim() external nonReentrant {
        require(userStakes[msg.sender] > 0, "User has no tokens staked");
        require(userRewards[msg.sender] > 0, "User has no rewards to claim");
        require(rewardPerStake >= rewardPerStakeAtDeposit[msg.sender], "No new rewards to claim");
        // Calculate the user's reward based on their stake and the increase in rewardPerStake since their last deposit.
        // This represents the new rewards the user has accumulated.
        uint userReward = userStakes[msg.sender] * (rewardPerStake - rewardPerStakeAtDeposit[msg.sender]);
        userRewards[msg.sender] += userReward;

        // calculate the total amount to be claimed
        uint totalClaimAmount = userRewards[msg.sender];
        // make sure the contract has enough tokens to pay out the rewards
        require(rewardToken.balanceOf(address(this)) >= totalClaimAmount, "Contract does not have enough tokens to pay out rewards");

        // update the user's total rewards claimed
        totalUserRewardsClaimed[msg.sender] += totalClaimAmount;
        // update the rewardPerStakeAtDeposit to the current rewardPerStake
        rewardPerStakeAtDeposit[msg.sender] = rewardPerStake;
        // reset the user's rewards to 0
        userRewards[msg.sender] = 0;
        // transfer the accumulated rewards back to the user
        rewardToken.safeTransfer(msg.sender, totalClaimAmount);
        // emit an event to notify the frontend
        emit Claimed(msg.sender, totalClaimAmount);
    }

    // withdraws the deposited tokens + accumulated rewards back to the user
    function Withdraw(uint _amount) external nonReentrant {
        require(userStakes[msg.sender] > 0, "User has no tokens staked");
        require(userStakes[msg.sender] >= _amount, "User does not have enough tokens staked");
        if (userStakes[msg.sender] - _amount < minStake) {
            require(userStakes[msg.sender] - _amount == 0, "User must withdraw all tokens if their stake will be less than the minimum stake");
        }

        // get the requested withdraw amount
        uint reqWithdrawAmount = _amount;
        // Calculate the user's reward based on their stake and the increase in rewardPerStake since their last deposit.
        // This represents the new rewards the user has accumulated.
        uint userReward = reqWithdrawAmount * (rewardPerStake - rewardPerStakeAtDeposit[msg.sender]);
        userRewards[msg.sender] += userReward;
        // update the totalStake
        totalStake -= reqWithdrawAmount;

        // Calculate tax-free amount based on vesting entries
        uint taxfreeAmount = 0;
        MinHeap storage heap = userVestings[msg.sender];

        // Remove vesting entries from the heap until the tax-free amount is found
        while (heap.entries.length > 0 && heap.entries[0].endTime <= block.timestamp && taxfreeAmount < _amount) {
            VestingEntry memory entry = removeMin(heap);
            uint availableTaxFree = entry.amount;
            uint neededTaxFree = _amount - taxfreeAmount;
            taxfreeAmount += availableTaxFree < neededTaxFree ? availableTaxFree : neededTaxFree;
        }


        uint rewardTokenWithdrawAmount = userRewards[msg.sender];
        require(rewardToken.balanceOf(address(this)) >= rewardTokenWithdrawAmount, "Contract does not have enough tokens to pay out rewards");
        uint stakeTokenWithdrawAmount = 0;
        uint taxAmount = 0;
        // Check if the user has enough tax-free tokens to cover the requested withdrawal amount
        if (taxfreeAmount >= reqWithdrawAmount) {
            stakeTokenWithdrawAmount += reqWithdrawAmount;
            // make sure the contract has enough tokens to pay out the stake tokens
            require(stakeToken.balanceOf(address(this)) >= stakeTokenWithdrawAmount, "Contract does not have enough tokens");
        } else {
            // Calculate taxable amount
            uint taxableAmount = reqWithdrawAmount - taxfreeAmount;
            // calculate tax based on the taxable amount
            taxAmount = taxableAmount * taxRate / 100;
            // Calculate total withdrawal amount including tax-free and taxable amounts minus the tax
            stakeTokenWithdrawAmount += taxfreeAmount + (taxableAmount - taxAmount);

            require(stakeToken.balanceOf(address(this)) >= stakeTokenWithdrawAmount + taxAmount, "Contract does not have enough tokens");

            // Transfer the tax amount to the treasury wallet
            stakeToken.safeTransfer(treasury, taxAmount);
        }
        
        // ipdate the user's total rewards claimed
        totalUserRewardsClaimed[msg.sender] += userRewards[msg.sender];

        // update the users stake
        userStakes[msg.sender] -= reqWithdrawAmount;
        // they will withdraw the requested amount + their accumulated rewards so reset their rewards to 0
        userRewards[msg.sender] = 0;
        // update the rewardPerStakeAtDeposit to the current rewardPerStake
        rewardPerStakeAtDeposit[msg.sender] = rewardPerStake;

        // transfer the deposited tokens back to the user
        stakeToken.safeTransfer(msg.sender, stakeTokenWithdrawAmount);
        // transfer the accumulated rewards back to the user
        rewardToken.safeTransfer(msg.sender, rewardTokenWithdrawAmount);
        // emit an event to notify the frontend
        emit Withdrawn(msg.sender, stakeTokenWithdrawAmount, rewardTokenWithdrawAmount);
    }

    // returns the amount of tokens that can be claimed by the user
    function ClaimableAmount(address _user) external view returns (uint) {
        uint userReward = userStakes[_user] * (rewardPerStake - rewardPerStakeAtDeposit[_user]);
        return userRewards[_user] + userReward;
    }

    // returns the total amount of rewards claimed by the user
    function TotalUserRewardsClaimed(address _user) external view returns (uint) {
        return totalUserRewardsClaimed[_user];
    }

    // returns the total stake of the user
    function UserStake(address _user) external view returns (uint) {
        return userStakes[_user];
    }

    // returns an array of the user's vesting entries
    function UserVestings(address _user) external view returns (VestingEntry[] memory) {
        return userVestings[_user].entries;
    }

    // updates the minimum stake required to be eligible for rewards
    function UpdateMinStake(uint _minStake) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        require(_minStake > 0, "Minimum stake must be greater than 0");
        minStake = _minStake;
        emit MinStakeUpdated(_minStake);
    }

    // updates the vesting period
    function UpdateVestingPeriod(uint _vestingPeriod) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        require(_vestingPeriod > 0, "Vesting period must be greater than 0");
        vestingPeriod = _vestingPeriod;
        emit VestingPeriodUpdated(_vestingPeriod);
    }

    // updates the tax rate
    function UpdateTaxRate(uint _taxRate) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        require(_taxRate >= 0 && _taxRate <= 100, "Tax rate must be between 0 and 100");
        taxRate = _taxRate;
        emit TaxRateUpdated(_taxRate);
    }

    // updates the treasury wallet
    function UpdateTreasury(address _treasury) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        require(_treasury != address(0), "Treasury cannot be the zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // updates the staking token
    function UpdateStakeToken(address _stakeToken) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        require(_stakeToken != address(0), "Stake token cannot be the zero address");
        stakeToken = IERC20Upgradeable(_stakeToken);
        emit StakeTokenUpdated(_stakeToken);
    }

    // updates the reward token
    function UpdateRewardToken(address _rewardToken) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        require(_rewardToken != address(0), "Reward token cannot be the zero address");
        rewardToken = IERC20Upgradeable(_rewardToken);
        emit RewardTokenUpdated(_rewardToken);
    }

    // Emergency function to recover any ERC20 tokens
    function EmergencyRecoverTokens(address _token, uint _amount) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        //require(_token != address(token), "Cannot recover the staked token");
        IERC20Upgradeable(_token).safeTransfer(msg.sender, _amount);
        emit Recovered(_token, _amount);
    }

    // Emergency function to recover any Ether
    function EmergencyRecoverETH(uint _amount) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        payable(msg.sender).transfer(_amount);
        emit Recovered(address(0), _amount);
    }

    function insert(MinHeap storage heap, VestingEntry memory entry) internal {
        heap.entries.push(entry);
        uint i = heap.entries.length - 1;
        while (i > 0 && heap.entries[parent(i)].endTime > heap.entries[i].endTime) {
            // Use a temporary variable to perform the swap
            VestingEntry memory temp = heap.entries[i];
            heap.entries[i] = heap.entries[parent(i)];
            heap.entries[parent(i)] = temp;
            i = parent(i);
        }
    }


    function parent(uint i) internal pure returns (uint) {
        return (i - 1) / 2;
    }

    function removeMin(MinHeap storage heap) internal returns (VestingEntry memory) {
        require(heap.entries.length > 0, "Heap is empty");

        VestingEntry memory minEntry = heap.entries[0];
        heap.entries[0] = heap.entries[heap.entries.length - 1];
        heap.entries.pop();
        heapify(heap, 0);

        return minEntry;
    }

    function heapify(MinHeap storage heap, uint i) internal {
        uint left = 2 * i + 1;
        uint right = 2 * i + 2;
        uint smallest = i;

        if (left < heap.entries.length && heap.entries[left].endTime < heap.entries[smallest].endTime) {
            smallest = left;
        }
        if (right < heap.entries.length && heap.entries[right].endTime < heap.entries[smallest].endTime) {
            smallest = right;
        }
        if (smallest != i) {
            // Use a temporary variable to perform the swap
            VestingEntry memory temp = heap.entries[i];
            heap.entries[i] = heap.entries[smallest];
            heap.entries[smallest] = temp;
            heapify(heap, smallest);
        }
    }



}