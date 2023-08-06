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
            it("Should deposit tokens", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 1000;

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, Amount);
                await Distributor.Deposit(Amount);
                expect(await StakeToken.balanceOf(owner.address)).to.equal(10000000 - Amount);
                expect(await StakeToken.balanceOf(distributorAddress)).to.equal(Amount);
            });

            it("Should revert if amount is less than minimum stake", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 500;

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, Amount);
                await expect(Distributor.Deposit(Amount)).to.be.revertedWith("Amount is less than minimum stake");
            });
        });
        
    });

    /* before(async function () {
        this.StakeToken = await ethers.getContractFactory("StakeToken");
        this.RewardToken = await ethers.getContractFactory("RewardToken");
        this.Distributor = await ethers.getContractFactory("Distributor");
    });

    beforeEach(async function () {
        this.stakeToken = await this.StakeToken.deploy(10000000);
        await this.stakeToken.deployed();

        this.rewardToken = await this.RewardToken.deploy(10000000);
        await this.rewardToken.deployed();


        const stakeTokenAddress = this.stakeToken.address;
        const rewardTokenAddress = this.rewardToken.address;
        const treasuryAddress = "0x00000";
        const minimumStake = 1000;
        const vestingPeriod = 1000;
        const taxRate = 10;

        // Contracts are deployed using the first signer/account by default
        const [this.owner, this.otherAccount] = await ethers.getSigners();
        
        this.distributor = await this.Distributor.deploy();
        await this.distributor.deployed();
    });


    it("Should set the right owner", async function () {
        expect(await this.distributor.owner()).to.equal(owner.address);
    }); */
        
});