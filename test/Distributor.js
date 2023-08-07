const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const StakeTokenSupply = BigInt("39026949359163005") * 10n ** 9n;
const RewardTokenSupply = BigInt("1000000000000000000") * 10n ** 6n;
const minimumStake = BigInt(250000 * 10 ** 9);
const SCALE = BigInt(10 ** 18);

describe("Testing", async function () {

    async function deployStakeTokenFixture() {
        const StakeToken = await ethers.getContractFactory("StakeToken");
        const stakeToken = await StakeToken.deploy(BigInt("39026949359163005"));
        await stakeToken.waitForDeployment();

        return { stakeToken };
    }

    async function deployRewardTokenFixture() {
        const RewardToken = await ethers.getContractFactory("RewardToken");
        const rewardToken = await RewardToken.deploy(BigInt("1000000000000000000"));
        await rewardToken.waitForDeployment();

        return { rewardToken };
    }

    async function deployDistributorFixture(stakeToken, rewardToken, treasury) {

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
            expect(await stakeToken.totalSupply()).to.equal(StakeTokenSupply);
           
        });
    });
    let RewardToken;
    describe("RewardToken", function () {
        it("Should deploy reward token", async function () {
            const { rewardToken } = await loadFixture(deployRewardTokenFixture);
            RewardToken = rewardToken;
            expect(await rewardToken.totalSupply()).to.equal(RewardTokenSupply);
           
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
            expect(await distributor.minStake()).to.equal(minimumStake);
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

                const balance = await StakeToken.balanceOf(treasury.address);

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.connect(treasury).approve(distributorAddress, balance + 1n);
                await expect(Distributor.connect(treasury).Deposit(balance + 1n)).to.be.revertedWith("User does not have enough tokens to deposit");
            });

            it("Should revert if user tries to deposit more tokens than they have approved", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 250000 * 10 ** 9;

                await StakeToken.transfer(treasury.address, Amount);

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.connect(treasury).approve(distributorAddress, Amount - 1);
                await expect(Distributor.connect(treasury).Deposit(Amount)).to.be.revertedWith("User has not approved the contract to spend tokens on their behalf");

            });


            it("Should revert if amount is less than minimum stake", async function () {
                const [owner, treasury] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, minimumStake - 1n);
                await expect(Distributor.Deposit(minimumStake - 1n)).to.be.revertedWith("User must deposit at least the minimum stake");
            });

            it("Should decrease user balance and increase contract balance", async function () {
                const [owner, treasury] = await ethers.getSigners();

                const stakeTokenAddress = await StakeToken.getAddress();
                const rewardTokenAddress = await RewardToken.getAddress();
                const distributorFixture = () => deployDistributorFixture(stakeTokenAddress, rewardTokenAddress, treasury.address);
                const { distributor } = await loadFixture(distributorFixture);

                const distributorAddress = await distributor.getAddress();

                await StakeToken.approve(distributorAddress, minimumStake);
                const prevBalance = await StakeToken.balanceOf(owner.address);
                await distributor.Deposit(minimumStake);
                expect(await StakeToken.balanceOf(owner.address)).to.equal(prevBalance - minimumStake);
                expect(await StakeToken.balanceOf(distributorAddress)).to.equal(minimumStake);
            });

            it("Should allow the minimum stake and above", async function () {
                const [owner, treasury] = await ethers.getSigners();

                const { stakeToken } = await loadFixture(deployStakeTokenFixture);
                expect(await stakeToken.totalSupply()).to.equal(StakeTokenSupply);
                StakeToken = stakeToken;
                const { rewardToken } = await loadFixture(deployRewardTokenFixture);
                expect(await rewardToken.totalSupply()).to.equal(RewardTokenSupply);
                RewardToken = rewardToken;
                const stakeTokenAddress = await stakeToken.getAddress();
                const rewardTokenAddress = await rewardToken.getAddress();
                const distributorFixture = () => deployDistributorFixture(stakeTokenAddress, rewardTokenAddress, treasury.address);
                const { distributor } = await loadFixture(distributorFixture);
                Distributor = distributor;
                const distributorAddress = await distributor.getAddress();

                await stakeToken.approve(distributorAddress, minimumStake);
                let prevBalance = await stakeToken.balanceOf(owner.address);
                await distributor.Deposit(minimumStake);
                expect(await stakeToken.balanceOf(owner.address)).to.equal(prevBalance - minimumStake);
                expect(await stakeToken.balanceOf(distributorAddress)).to.equal(minimumStake);
                await stakeToken.approve(distributorAddress, minimumStake + 1n);
                prevBalance = await stakeToken.balanceOf(owner.address);
                await distributor.Deposit(minimumStake + 1n);
                expect(await stakeToken.balanceOf(owner.address)).to.equal(prevBalance - minimumStake - 1n);
                expect(await stakeToken.balanceOf(distributorAddress)).to.equal(minimumStake + minimumStake + 1n);
                expect(await distributor.UserStake(owner.address)).to.equal(minimumStake + minimumStake + 1n);
            });

            it("Should emit a Deposit event", async function () {
                const [owner, treasury] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, minimumStake);
                await expect(Distributor.Deposit(minimumStake))
                    .to.emit(Distributor, "Deposited")
                    .withArgs(owner.address, minimumStake);
            });

            it("If user has already deposited, should add to their balance", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 10000n;

                const distributorAddress = await Distributor.getAddress();
                await StakeToken.transfer(treasury.address, Amount + minimumStake);
                await StakeToken.connect(treasury).approve(distributorAddress, Amount + minimumStake);
                const prevBalance = await StakeToken.balanceOf(distributorAddress);
                await Distributor.connect(treasury).Deposit(minimumStake);
                await Distributor.connect(treasury).Deposit(Amount);
                expect(await StakeToken.balanceOf(treasury.address)).to.equal(0);
                expect(await StakeToken.balanceOf(distributorAddress)).to.equal(prevBalance + Amount + minimumStake);
                expect(await Distributor.UserStake(treasury.address)).to.equal(Amount + minimumStake);
            });

            it("Vesting period should be set correctly", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 10000n;

                const distributorAddress = await Distributor.getAddress();
                await StakeToken.transfer(treasury.address, Amount + Amount);
                await StakeToken.connect(treasury).approve(distributorAddress, Amount + Amount);
                await Distributor.connect(treasury).Deposit(Amount);
                const timestamp = await time.latest();
                const vestingPeriod = await Distributor.UserVestings(treasury.address);
                expect(vestingPeriod[2][0]).to.equal(10000);
                expect(vestingPeriod[2][1]).to.equal(timestamp + 1000);
            });

            it("Gas usage should be acceptable for multiple deposits testing 100", async function () {
                const [owner, treasury, addr3] = await ethers.getSigners();
                const Amount = 1000000n;

                const distributorAddress = await Distributor.getAddress();
                await StakeToken.transfer(addr3.address, Amount + minimumStake);
                await StakeToken.connect(addr3).approve(distributorAddress, Amount + minimumStake);
                const prevBalance = await StakeToken.balanceOf(distributorAddress);
                await Distributor.connect(addr3).Deposit(minimumStake);
                for (let i = 0; i < 100; i++) {
                    await Distributor.connect(addr3).Deposit(Amount / 100n);
                }
                expect(await StakeToken.balanceOf(addr3.address)).to.equal(0);
                expect(await StakeToken.balanceOf(distributorAddress)).to.equal(prevBalance + Amount + minimumStake);
                expect(await Distributor.UserStake(addr3.address)).to.equal(Amount + minimumStake);
                const vestingPeriod = await Distributor.UserVestings(addr3.address);
                expect(vestingPeriod.length).to.equal(101);
            });

        });

        describe("Distributor", function () {
            it("Should revert if amount is 0 ", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 0;

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.approve(distributorAddress, Amount);
                await expect(Distributor.Distribute(Amount)).to.be.revertedWith("Reward amount must be greater than 0");
            });

            it("Should revert if caller is not an approved distributor", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 1;

                await StakeToken.approve(treasury.address, Amount);
                await expect(Distributor.connect(treasury).Distribute(Amount)).to.be.revertedWith("Caller is not an approved distributor");
            });

            it("Should revert if nothing has been staked yet", async function () {
                const [owner, treasury] = await ethers.getSigners();
                const Amount = 100000;

                const stakeTokenAddress = await StakeToken.getAddress();
                const rewardTokenAddress = await RewardToken.getAddress();
                const distributorFixture = () => deployDistributorFixture(stakeTokenAddress, rewardTokenAddress, treasury.address);
                const { distributor } = await loadFixture(distributorFixture);
                const distributorAddress = await distributor.getAddress();
                Distributor = distributor;

                await StakeToken.approve(distributorAddress, Amount);
                await expect(distributor.Distribute(Amount)).to.be.revertedWith("Nothing is staked yet, so no users to distribute to");
            });

            /* it("Should revert if amount is less than total stake", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                await StakeToken.transfer(addr3.address, minimumStake);
                await StakeToken.transfer(addr4.address, minimumStake);

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.connect(addr3).approve(distributorAddress, minimumStake);
                await Distributor.connect(addr3).Deposit(minimumStake);
                await StakeToken.connect(addr4).approve(distributorAddress, minimumStake);
                await Distributor.connect(addr4).Deposit(minimumStake);
                await expect(Distributor.Distribute(minimumStake - 1n)).to.be.revertedWith("Reward amount must be greater than or equal to the total stake");
            }); */

            it("Should revert if distributor doesnt have enough tokens", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                await StakeToken.transfer(addr3.address, minimumStake);
                await StakeToken.transfer(addr4.address, minimumStake);

                const distributorAddress = await Distributor.getAddress();

                const balance = await RewardToken.balanceOf(owner.address);

                await StakeToken.connect(addr3).approve(distributorAddress, minimumStake);
                await Distributor.connect(addr3).Deposit(minimumStake);
                await StakeToken.connect(addr4).approve(distributorAddress, minimumStake);
                await Distributor.connect(addr4).Deposit(minimumStake);
                await expect(Distributor.Distribute(balance + 1n)).to.be.revertedWith("Distributor does not have enough tokens to distribute");
            });

            it("Should revert if distributor hasnt approved tokens", async function () {
                const [owner] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                const balance = await StakeToken.balanceOf(distributorAddress);

                await expect(Distributor.Distribute(balance)).to.be.revertedWith("Distributor has not approved the contract to spend tokens on their behalf");
            });

            it("Should distribute tokens to all users", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                const amount = 1n * 10n ** 6n;

                const distributorAddress = await Distributor.getAddress();

                const totalRewardsDistributed = await Distributor.totalRewardsDistributed();

                const totalStake = await Distributor.totalStake();
                await RewardToken.approve(distributorAddress, amount);
                await Distributor.Distribute(amount);

                const rewardPerStake = await Distributor.rewardPerStake();

                const expectedRewardPerStake = (amount * SCALE) / totalStake;

                expect(rewardPerStake).to.equal(expectedRewardPerStake);

                expect(await Distributor.totalRewardsDistributed()).to.equal(totalRewardsDistributed + amount);
            });

            it("Should distribute tokens to all users again", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                const balance = await StakeToken.balanceOf(distributorAddress);

                const totalRewardsDistributed = await Distributor.totalRewardsDistributed();

                const totalStake = await Distributor.totalStake();

                const prevClaimableAmount = await Distributor.ClaimableAmount(addr3.address);

       /*          await StakeToken.transfer(addr3.address, 1n);
                await StakeToken.connect(addr3).approve(distributorAddress, 1n);
                await Distributor.connect(addr3).Deposit(1n); */

                const balance1 = await Distributor.UserStake(addr3.address);


                await RewardToken.approve(distributorAddress, balance + 1n);
                let rewardPerStake = await Distributor.rewardPerStake();
                await Distributor.Distribute(balance + 1n);
                
                const expectedRewardPerStake = (((balance + 1n) * SCALE) / totalStake) + rewardPerStake;
                const expectedClaimableAmount = prevClaimableAmount + ((balance1 * (expectedRewardPerStake - rewardPerStake) / SCALE));
                expect(await Distributor.ClaimableAmount(addr3.address)).to.equal(expectedClaimableAmount);
                
                rewardPerStake = await Distributor.rewardPerStake();
                
                expect(rewardPerStake).to.equal(expectedRewardPerStake);

                expect(await Distributor.totalRewardsDistributed()).to.equal(totalRewardsDistributed + balance + 1n);
            });

            it("Should distribute tokens to all users again again", async function () {
                const [owner, treasury, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10] = await ethers.getSigners();

                const stakeTokenAddress = await StakeToken.getAddress();
                const rewardTokenAddress = await RewardToken.getAddress();
                const distributorFixture = () => deployDistributorFixture(stakeTokenAddress, rewardTokenAddress, treasury.address);
                const { distributor } = await loadFixture(distributorFixture);

                const distributorAddress = await distributor.getAddress();

                await StakeToken.transfer(a1.address, 250123456789012n);
                await StakeToken.transfer(a2.address, 312987654321098n);
                await StakeToken.transfer(a3.address, 267890123456789n);
                await StakeToken.transfer(a4.address, 278654321098765n);
                await StakeToken.transfer(a5.address, 299876543210987n);
                await StakeToken.transfer(a6.address, 305432109876543n);
                await StakeToken.transfer(a7.address, 314159265358979n);
                await StakeToken.transfer(a8.address, 271828182845904n);
                await StakeToken.transfer(a9.address, 288888888888888n);
                await StakeToken.transfer(a10.address, 302030303030303n);

                await StakeToken.connect(a1).approve(distributorAddress, 250123456789012n);
                await StakeToken.connect(a2).approve(distributorAddress, 312987654321098n);
                await StakeToken.connect(a3).approve(distributorAddress, 267890123456789n);
                await StakeToken.connect(a4).approve(distributorAddress, 278654321098765n);
                await StakeToken.connect(a5).approve(distributorAddress, 299876543210987n);
                await StakeToken.connect(a6).approve(distributorAddress, 305432109876543n);
                await StakeToken.connect(a7).approve(distributorAddress, 314159265358979n);
                await StakeToken.connect(a8).approve(distributorAddress, 271828182845904n);
                await StakeToken.connect(a9).approve(distributorAddress, 288888888888888n);
                await StakeToken.connect(a10).approve(distributorAddress, 302030303030303n);

                await distributor.connect(a1).Deposit(250123456789012n);
                await distributor.connect(a2).Deposit(312987654321098n);
                await distributor.connect(a3).Deposit(267890123456789n);
                await distributor.connect(a4).Deposit(278654321098765n);
                await distributor.connect(a5).Deposit(299876543210987n);
                await distributor.connect(a6).Deposit(305432109876543n);
                await distributor.connect(a7).Deposit(314159265358979n);
                await distributor.connect(a8).Deposit(271828182845904n);
                await distributor.connect(a9).Deposit(288888888888888n);
                await distributor.connect(a10).Deposit(302030303030303n);

                const balance = await StakeToken.balanceOf(owner.address);

                const amount = 1245793469n;

                await RewardToken.approve(distributorAddress, amount);

                await distributor.Distribute(amount);

                expect(await distributor.totalRewardsDistributed()).to.equal(amount);

                expect(await distributor.UserStake(a1.address)).to.equal(250123456789012n);
                expect(await distributor.UserStake(a2.address)).to.equal(312987654321098n);
                expect(await distributor.UserStake(a3.address)).to.equal(267890123456789n);
                expect(await distributor.UserStake(a4.address)).to.equal(278654321098765n);
                expect(await distributor.UserStake(a5.address)).to.equal(299876543210987n);
                expect(await distributor.UserStake(a6.address)).to.equal(305432109876543n);
                expect(await distributor.UserStake(a7.address)).to.equal(314159265358979n);
                expect(await distributor.UserStake(a8.address)).to.equal(271828182845904n);
                expect(await distributor.UserStake(a9.address)).to.equal(288888888888888n);
                expect(await distributor.UserStake(a10.address)).to.equal(302030303030303n);

                const claimableAmount = await distributor.ClaimableAmount(a1.address);
                const claimableAmount2 = await distributor.ClaimableAmount(a2.address);
                const claimableAmount3 = await distributor.ClaimableAmount(a3.address);
                const claimableAmount4 = await distributor.ClaimableAmount(a4.address);
                const claimableAmount5 = await distributor.ClaimableAmount(a5.address);
                const claimableAmount6 = await distributor.ClaimableAmount(a6.address);
                const claimableAmount7 = await distributor.ClaimableAmount(a7.address);
                const claimableAmount8 = await distributor.ClaimableAmount(a8.address);
                const claimableAmount9 = await distributor.ClaimableAmount(a9.address);
                const claimableAmount10 = await distributor.ClaimableAmount(a10.address);
                const sum = claimableAmount + claimableAmount2 + claimableAmount3 + claimableAmount4 + claimableAmount5 + claimableAmount6 + claimableAmount7 + claimableAmount8 + claimableAmount9 + claimableAmount10;

                /* console.log("A1", claimableAmount);
                console.log("A2", claimableAmount2);
                console.log("A3", claimableAmount3);
                console.log("A4", claimableAmount4);
                console.log("A5", claimableAmount5);
                console.log("A6", claimableAmount6);
                console.log("A7", claimableAmount7);
                console.log("A8", claimableAmount8);
                console.log("A9", claimableAmount9);
                console.log("A10", claimableAmount10); */

                expect(sum).to.be.lessThan(amount);

            });

            /* it("Should distribute rewards to 100x users ", async function () {
                const [owner, treasury] = await ethers.getSigners();

                const stakeTokenAddress = await StakeToken.getAddress();
                const rewardTokenAddress = await RewardToken.getAddress();
                const distributorFixture = () => deployDistributorFixture(stakeTokenAddress, rewardTokenAddress, treasury.address);
                const { distributor } = await loadFixture(distributorFixture);

                const distributorAddress = await distributor.getAddress();

                const provider = owner.provider;
                let users = [];
                for (let i = 0; i < 100; i++) {
                    const userWallet = ethers.Wallet.createRandom();
                    const user = userWallet.connect(provider);
                    users.push(user);
                    // send some eth
                    await owner.sendTransaction({
                        to: user.address,
                        value: ethers.parseEther("0.1")
                    });
                    await StakeToken.transfer(user.address, minimumStake);
                    await StakeToken.connect(user).approve(distributorAddress, minimumStake);
                    await distributor.connect(user).Deposit(minimumStake);
                    expect(await distributor.UserStake(user.address)).to.equal(minimumStake);
                    expect(await distributor.ClaimableAmount(user.address)).to.equal(0n);
                }

                const amount = 1245793469n;

                await RewardToken.approve(distributorAddress, amount);
                await distributor.Distribute(amount);
                let totalClaimable = 0n;
                for (let i = 0; i < 100; i++) {
                    const user = users[i];
                    expect(await distributor.UserStake(user.address)).to.equal(minimumStake);
                    totalClaimable += await distributor.ClaimableAmount(user.address);
                }
                expect(amount - totalClaimable).to.be.lessThan(100n);
            }); */

            it("Should emit event", async function () {

                const distributorAddress = await Distributor.getAddress();

                const totalStake = await Distributor.totalStake();

                await RewardToken.approve(distributorAddress, totalStake);
                await expect(Distributor.Distribute(totalStake))
                    .to.emit(Distributor, "Distributed")
                    .withArgs(totalStake, totalStake);
            });
                
        });

        describe("Claim", function () {
            it("Should revert if nothing has been staked yet", async function () {
                const [owner, treasury, addr3, addr4, addr5] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                expect(await Distributor.UserStake(addr5.address)).to.equal(0n);

                await expect(Distributor.Claim()).to.be.revertedWith("User has no tokens staked");
            });

            it("Should revert if user has no claimable amount", async function () {
                const [owner, treasury, addr3, addr4, addr5] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.transfer(addr5.address, minimumStake);
                await StakeToken.connect(addr5).approve(distributorAddress, minimumStake);
                await Distributor.connect(addr5).Deposit(minimumStake);

                expect(await Distributor.ClaimableAmount(addr5.address)).to.equal(0n);

                await expect(Distributor.connect(addr5).Claim()).to.be.revertedWith("User has no rewards to claim");
            });

            it("Should claim tokens and update values correctly", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                const balance = await RewardToken.balanceOf(addr4.address);

                const claimableAmount = await Distributor.ClaimableAmount(addr4.address);

                const totalUserRewardsClaimed = await Distributor.TotalUserRewardsClaimed(addr4.address);

                await Distributor.connect(addr4).Claim();

                expect(await RewardToken.balanceOf(addr4.address)).to.equal(balance + claimableAmount);

                expect(await Distributor.ClaimableAmount(addr4.address)).to.equal(0n);

                expect(await Distributor.TotalUserRewardsClaimed(addr4.address)).to.equal(totalUserRewardsClaimed + claimableAmount);
                await expect(Distributor.connect(addr4).Claim()).to.be.revertedWith("User has no rewards to claim");
            });

            it("Should emit event", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                
                const distributorAddress = await Distributor.getAddress();

                const balance = await RewardToken.balanceOf(distributorAddress);
                const totalRewardsDistributed = await Distributor.totalRewardsDistributed();
                const totalRewardsClaimed = await Distributor.totalRewardsClaimed();
                console.log("balance", balance);
                console.log("totalRewardsDistributed", totalRewardsDistributed);
                console.log("totalRewardsClaimed", totalRewardsClaimed);

                console.log(balance + totalRewardsClaimed - totalRewardsDistributed);

                await RewardToken.approve(distributorAddress, 10n * 10n ** 6n);
                await Distributor.Distribute(10n * 10n ** 6n);

                const claimableAmount = await Distributor.ClaimableAmount(addr3.address);
                console.log("claimableAmount", claimableAmount);
                await expect(Distributor.connect(addr3).Claim())
                    .to.emit(Distributor, "Claimed")
                    .withArgs(addr3.address, claimableAmount);
            });
        });

        describe("Withdraw", function () {
            it("Should revert if withdraw amount is 0", async function () {
                const [owner, treasury, addr3, addr4, addr5, addr6] = await ethers.getSigners();

                expect(await Distributor.UserStake(addr6.address)).to.equal(0n);

                await expect(Distributor.connect(addr6).Withdraw(0n)).to.be.revertedWith("Withdraw amount must be greater than 0");
            });

            it("Should revert if nothing has been staked yet", async function () {
                const [owner, treasury, addr3, addr4, addr5, addr6] = await ethers.getSigners();

                expect(await Distributor.UserStake(addr6.address)).to.equal(0n);

                await expect(Distributor.connect(addr6).Withdraw(minimumStake)).to.be.revertedWith("User has no tokens staked");
            });

            it("Should revert if user hasnt enough tokens staked", async function (
            ) {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                expect(await Distributor.UserStake(addr4.address)).to.equal(minimumStake);

                await expect(Distributor.connect(addr4).Withdraw(minimumStake + 1n)).to.be.revertedWith("User does not have enough tokens staked");
            });

            it("Should revert if user tries to withdraw below minimumstake ", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                expect(await Distributor.UserStake(addr4.address)).to.equal(minimumStake);

                await expect(Distributor.connect(addr4).Withdraw(minimumStake - 1n)).to.be.revertedWith("User must withdraw all tokens if their stake will be less than the minimum stake");
            });

            it("Should withdraw tokens and update values correctly", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                const balance = await StakeToken.balanceOf(addr4.address);
                const balance1 = await RewardToken.balanceOf(addr4.address);

                const claimableAmount = await Distributor.ClaimableAmount(addr4.address);

                const totalStake = await Distributor.totalStake();

                const userStake = await Distributor.UserStake(addr4.address);

                await Distributor.connect(addr4).Withdraw(userStake);

                expect(await StakeToken.balanceOf(addr4.address)).to.equal(userStake * 90n / 100n);

                expect(await RewardToken.balanceOf(addr4.address)).to.equal(balance1 + claimableAmount);

                expect(await Distributor.totalStake()).to.equal(totalStake - userStake);

                expect(await Distributor.UserStake(addr4.address)).to.equal(0);
            });

            it("Should not add tax after vesting completed", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();

                const balance = await StakeToken.balanceOf(addr3.address);
                const balance1 = await RewardToken.balanceOf(addr3.address);

                const claimableAmount = await Distributor.ClaimableAmount(addr3.address);

                const totalStake = await Distributor.totalStake();

                const userStake = await Distributor.UserStake(addr3.address);

                await time.increase(1000);

                await Distributor.connect(addr3).Withdraw(userStake);

                expect(await StakeToken.balanceOf(addr3.address)).to.equal(userStake);
                expect(await RewardToken.balanceOf(addr3.address)).to.equal(balance1 + claimableAmount);
                expect(await Distributor.totalStake()).to.equal(totalStake - userStake);
                expect(await Distributor.UserStake(addr3.address)).to.equal(0);
            });

            it("Should work with multiple vestings", async function () {
                const [owner, treasury, addr3] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();
                await StakeToken.transfer(addr3.address, minimumStake);
                await StakeToken.connect(addr3).approve(distributorAddress, minimumStake);
                await Distributor.connect(addr3).Deposit(minimumStake);

                let vestings = await Distributor.UserVestings(addr3.address);
                console.log(vestings);

                await time.increase(1000);
                
                const amount = 1n * 10n ** 6n;

                await StakeToken.transfer(addr3.address, amount * 2n);
                await StakeToken.connect(addr3).approve(distributorAddress, amount * 2n);
                await Distributor.connect(addr3).Deposit(amount);

                vestings = await Distributor.UserVestings(addr3.address);
                console.log(vestings);

                balance = await StakeToken.balanceOf(addr3.address);
                await Distributor.connect(addr3).Withdraw(amount);

                vestings = await Distributor.UserVestings(addr3.address);
                console.log(vestings);

                expect(await StakeToken.balanceOf(addr3.address)).to.equal(balance + amount);

                await Distributor.connect(addr3).Deposit(amount);

                balance = await StakeToken.balanceOf(addr3.address);

                vestings = await Distributor.UserVestings(addr3.address);
                console.log(vestings);

                const treasuryBalance = await StakeToken.balanceOf(treasury.address);

                await Distributor.connect(addr3).Withdraw(amount + minimumStake);

                const stake = await Distributor.UserStake(addr3.address);
                console.log(stake);

                expect(await StakeToken.balanceOf(addr3.address)).to.equal(balance + minimumStake - amount + (amount * 2n * 90n / 100n));
                expect(await StakeToken.balanceOf(treasury.address)).to.equal(treasuryBalance + (amount * 2n * 10n / 100n));
            });

            it("Should work with multiple vestings 10x", async function () {
                const [owner, treasury, addr3, addr4] = await ethers.getSigners();
                const amount = 10n * 10n ** 6n;
                const distributorAddress = await Distributor.getAddress();
                await StakeToken.transfer(addr3.address, minimumStake + amount);
                await StakeToken.connect(addr3).approve(distributorAddress, minimumStake + amount);
                await Distributor.connect(addr3).Deposit(minimumStake);
                for (let i = 0; i < 10; i++) {
                    await time.increase(200);
                    await Distributor.connect(addr3).Deposit(amount / 10n);
                }
                const balance = await StakeToken.balanceOf(addr3.address);
                const balance1 = await StakeToken.balanceOf(treasury.address);
                await Distributor.connect(addr3).Withdraw(minimumStake + amount);

                console.log(balance + minimumStake);

                expect(await StakeToken.balanceOf(addr3.address)).to.equal(balance + minimumStake + amount / 10n * 7n + (amount / 10n * 3n * 90n/100n));
                expect(await StakeToken.balanceOf(treasury.address)).to.equal(balance1 + (amount / 10n * 3n * 10n / 100n));
            });

            it("Should emit event", async function () {
                const [owner, treasury, addr3] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                await StakeToken.transfer(addr3.address, minimumStake);
                await StakeToken.connect(addr3).approve(distributorAddress, minimumStake);
                await Distributor.connect(addr3).Deposit(minimumStake);
                await RewardToken.approve(distributorAddress, 1n * 10n ** 6n);
                await Distributor.Distribute(1n * 10n ** 6n);

                const claimableAmount = await Distributor.ClaimableAmount(addr3.address);

                await expect(Distributor.connect(addr3).Withdraw(minimumStake))
                    .to.emit(Distributor, 'Withdrawn')
                    .withArgs(addr3.address, minimumStake * 90n / 100n, claimableAmount);
            });
        });

        describe("Additional tests", function () {
            it ("TotalStake should be updated correctly", async function () {
                const [owner, treasury, addr3] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                const totalStake = await Distributor.totalStake();

                await StakeToken.transfer(addr3.address, minimumStake);
                await StakeToken.connect(addr3).approve(distributorAddress, minimumStake);
                await Distributor.connect(addr3).Deposit(minimumStake);

                expect(await Distributor.totalStake()).to.equal(totalStake + minimumStake);
            });

            it("minStake returns correctly", async function () {
                const [owner, treasury, addr3] = await ethers.getSigners();

                expect(await Distributor.minStake()).to.equal(minimumStake);
            });

            it("vestingPeriod returns correctly", async function () {
                const [owner, treasury, addr3] = await ethers.getSigners();

                expect(await Distributor.vestingPeriod()).to.equal(1000);
            });

            it("taxRate returns correctly", async function () {
                const [owner, treasury, addr3] = await ethers.getSigners();

                expect(await Distributor.taxRate()).to.equal(10);
            });

            it("TotalUserRewardsClaimed updates correctly", async function () {
                const [owner, treasury, addr3, addr4, addr5] = await ethers.getSigners();

                const distributorAddress = await Distributor.getAddress();

                const totalUserRewardsClaimed = await Distributor.TotalUserRewardsClaimed(addr5.address);

                const claimable = await Distributor.ClaimableAmount(addr5.address);

                await Distributor.connect(addr5).Claim();

                expect(await Distributor.TotalUserRewardsClaimed(addr5.address)).to.equal(totalUserRewardsClaimed + claimable);
            });

        });
        
    });     
});