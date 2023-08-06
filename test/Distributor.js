const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Distributor", async function () {

    async function deployStakeTokenFixture() {
        const StakeToken = await ethers.getContractFactory("StakeToken");
        const stakeToken = await StakeToken.deploy(10000000);
        await stakeToken.waitForDeployment();

        return { stakeToken };
    }

    async function deployRewardTokenFixture() {
        const RewardToken = await ethers.getContractFactory("RewardToken");
        const rewardToken = await RewardToken.deploy(10000000);
        await rewardToken.waitForDeployment();

        return { rewardToken };
    }

    async function deployDistributorFixture(stakeToken, rewardToken, treasury) {

        const minimumStake = 1000;
        const vestingPeriod = 1000;
        const taxRate = 10;
        
        const Distributor = await ethers.getContractFactory("Distributor");
        const distributor = await upgrades.deployProxy(Distributor, [
            stakeToken, rewardToken, treasury,
            minimumStake, vestingPeriod, taxRate,
        ], { initializer: 'initialize', kind: 'uups' }
        );

        await distributor.waitForDeployment();

        return { distributor, minimumStake, vestingPeriod, taxRate };
    }
    let StakeToken;
    describe("StakeToken", function () {
        it("Should deploy stake token", async function () {
            const { stakeToken } = await loadFixture(deployStakeTokenFixture);
            StakeToken = stakeToken;
            expect(await stakeToken.totalSupply()).to.equal(10000000);
           
        });
    });
    let RewardToken;
    describe("RewardToken", function () {
        it("Should deploy reward token", async function () {
            const { rewardToken } = await loadFixture(deployRewardTokenFixture);
            RewardToken = rewardToken;
            expect(await rewardToken.totalSupply()).to.equal(10000000);
           
        });
    });

    describe("Distributor", function () {
        let Distributor;
        it("Should deploy distributor with correct settings", async function () {
            const [owner, treasury] = await ethers.getSigners();
            const stakeTokenAddress = await StakeToken.getAddress();
            const rewardTokenAddress = await RewardToken.getAddress();
            const distributorFixture = () => deployDistributorFixture(stakeTokenAddress, rewardTokenAddress, treasury.address);
            const { distributor } = await loadFixture(distributorFixture);
            Distributor = distributor;
            expect(await distributor.stakeToken()).to.equal(stakeTokenAddress);
            expect(await distributor.rewardToken()).to.equal(rewardTokenAddress);
            expect(await distributor.treasury()).to.equal(treasury.address);
            expect(await distributor.minStake()).to.equal(1000);
            expect(await distributor.vestingPeriod()).to.equal(1000);
            expect(await distributor.taxRate()).to.equal(10);
        });

        it("Should set access roles correctly", async function () {
            const [owner] = await ethers.getSigners();
            const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
            expect(await Distributor.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await Distributor.hasRole(ethers.keccak256(ethers.toUtf8Bytes("DISTRIBUTOR_ROLE")), owner.address)).to.be.true;
        });
        
        it("Should lock the initilizer function", async function () {
            const [owner, treasury] = await ethers.getSigners();
            const stakeTokenAddress = await StakeToken.getAddress();
            const rewardTokenAddress = await RewardToken.getAddress();
            const treasuryAddress = treasury.address;
            const minimumStake = 1000;
            const vestingPeriod = 1000;
            const taxRate = 10;
            await expect(Distributor.initialize(
                stakeTokenAddress, rewardTokenAddress, treasuryAddress,
                minimumStake, vestingPeriod, taxRate
            )).to.be.revertedWith("Initializable: contract is already initialized");
        });

        describe("Deposit", function () {
            it("Should revert if user tries to deposit 0 tokens", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 0;

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, Amount);
                await expect(Distributor.Deposit(Amount)).to.be.revertedWith("Deposit amount must be greater than 0");
            });

            it("Should revert if user tries to deposit more tokens than they have", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 100000000;

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, Amount);
                await expect(Distributor.Deposit(Amount)).to.be.revertedWith("User does not have enough tokens to deposit");
            });

            it("Should revert if user tries to deposit more tokens than they have approved", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 1000;

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, Amount - 1);
                await expect(Distributor.Deposit(Amount)).to.be.revertedWith("User has not approved the contract to spend tokens on their behalf");

            });


            it("Should revert if amount is less than minimum stake", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 500;

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, Amount);
                await expect(Distributor.Deposit(Amount)).to.be.revertedWith("User must deposit at least the minimum stake");
            });

            it("Should decrease user balance and increase contract balance", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 1000;
                const stakeTokenAddress = await StakeToken.getAddress();
                const rewardTokenAddress = await RewardToken.getAddress();
                const distributorFixture = () => deployDistributorFixture(stakeTokenAddress, rewardTokenAddress, treasury.address);
                const { distributor } = await loadFixture(distributorFixture);

                const distributorAddress = await distributor.getAddress();

                await StakeToken.approve(distributorAddress, Amount);
                await distributor.Deposit(Amount);
                expect(await StakeToken.balanceOf(owner.address)).to.equal(10000000 - Amount);
                expect(await StakeToken.balanceOf(distributorAddress)).to.equal(Amount);
            });

            it("Should allow the minimum stake and above", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 1000;

                const { stakeToken } = await loadFixture(deployStakeTokenFixture);
                expect(await stakeToken.totalSupply()).to.equal(10000000);
                StakeToken = stakeToken;
                const { rewardToken } = await loadFixture(deployRewardTokenFixture);
                expect(await rewardToken.totalSupply()).to.equal(10000000);
                RewardToken = rewardToken;
                const stakeTokenAddress = await stakeToken.getAddress();
                const rewardTokenAddress = await rewardToken.getAddress();
                const distributorFixture = () => deployDistributorFixture(stakeTokenAddress, rewardTokenAddress, treasury.address);
                const { distributor } = await loadFixture(distributorFixture);
                Distributor = distributor;
                const distributorAddress = await distributor.getAddress();

                await stakeToken.approve(distributorAddress, Amount);
                await distributor.Deposit(Amount);
                expect(await stakeToken.balanceOf(owner.address)).to.equal(10000000 - Amount);
                expect(await stakeToken.balanceOf(distributorAddress)).to.equal(Amount);
                await stakeToken.approve(distributorAddress, Amount + 10000);
                await distributor.Deposit(Amount + 10000);
                expect(await stakeToken.balanceOf(owner.address)).to.equal(10000000 - Amount - Amount - 10000);
                expect(await stakeToken.balanceOf(distributorAddress)).to.equal(Amount + Amount + 10000);
                expect(await distributor.UserStake(owner.address)).to.equal(Amount + Amount + 10000);
            });

            it("Should emit a Deposit event", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 100000;

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, Amount);
                await expect(Distributor.Deposit(Amount))
                    .to.emit(Distributor, "Deposited")
                    .withArgs(owner.address, Amount);
            });

            it("If user has already deposited, should add to their balance", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 100000;

                const distributorAddress = await Distributor.getAddress();
                await StakeToken.transfer(treasury.address, Amount + Amount);
                await StakeToken.connect(treasury).approve(distributorAddress, Amount + Amount);
                const prevBalance = await StakeToken.balanceOf(distributorAddress);
                await Distributor.connect(treasury).Deposit(Amount);
                await Distributor.connect(treasury).Deposit(Amount);
                expect(await StakeToken.balanceOf(treasury.address)).to.equal(0);
                expect(await StakeToken.balanceOf(distributorAddress)).to.equal(Number(prevBalance) + Amount + Amount);
                expect(await Distributor.UserStake(treasury.address)).to.equal(Amount + Amount);
            });

            it("Vesting period should be set correctly", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 10000;

                const distributorAddress = await Distributor.getAddress();
                await StakeToken.transfer(treasury.address, Amount + Amount);
                await StakeToken.connect(treasury).approve(distributorAddress, Amount + Amount);
                await Distributor.connect(treasury).Deposit(Amount);
                const timestamp = await time.latest();
                console.log(await Distributor.UserVestings(treasury.address));
                const vestingPeriod = await Distributor.UserVestings(treasury.address);
                expect(vestingPeriod[2][0]).to.equal(10000);
                expect(vestingPeriod[2][1]).to.equal(timestamp + 1000);
            });

            it("Gas usage should be acceptable for multiple deposits testing 100", async function () {
                const [owner, treasury, addr3] = await ethers.getSigners();
                const Amount = 1000000;

                const distributorAddress = await Distributor.getAddress();
                await StakeToken.transfer(addr3.address, Amount);
                await StakeToken.connect(addr3).approve(distributorAddress, Amount);
                const prevBalance = await StakeToken.balanceOf(distributorAddress);
                for (let i = 0; i < 100; i++) {
                    await Distributor.connect(addr3).Deposit(Amount / 100);
                }
                expect(await StakeToken.balanceOf(addr3.address)).to.equal(0);
                expect(await StakeToken.balanceOf(distributorAddress)).to.equal(Number(prevBalance) + Amount);
                expect(await Distributor.UserStake(addr3.address)).to.equal(Amount);
                const vestingPeriod = await Distributor.UserVestings(addr3.address);
                expect(vestingPeriod.length).to.equal(100);
            });

        });

        describe("Distributor", function () {
            
        });
        
    });     
});