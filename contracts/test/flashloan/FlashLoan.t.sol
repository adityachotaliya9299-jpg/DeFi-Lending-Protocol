// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2, Vm}       from "forge-std/Test.sol";
import {LendingPool}           from "../../src/core/LendingPool.sol";
import {CollateralManager}     from "../../src/core/CollateralManager.sol";
import {PriceOracle}           from "../../src/oracle/PriceOracle.sol";
import {InterestRateModel}     from "../../src/interest/InterestRateModel.sol";
import {ProtocolTreasury}      from "../../src/treasury/ProtocolTreasury.sol";
import {IFlashLoanReceiver}    from "../../src/interfaces/IFlashLoanReceiver.sol";
import {ICollateralManager}    from "../../src/interfaces/ICollateralManager.sol";
import {MockChainlinkFeed}     from "../../src/mocks/MockChainlinkFeed.sol";
import {MockERC20}             from "../../src/mocks/MockERC20.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title  MockFlashLoanReceiver
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Test double — receives flash loan, optionally repays it.
 */
contract MockFlashLoanReceiver is IFlashLoanReceiver {
    bool    public shouldRepay  = true;
    bool    public returnValue  = true;
    uint256 public receivedAmt;
    uint256 public receivedFee;
    address public pool;

    constructor(address _pool) { pool = _pool; }

    function setShouldRepay(bool v) external { shouldRepay = v; }
    function setReturnValue(bool v) external { returnValue = v; }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 fee,
        address /*initiator*/,
        bytes calldata /*params*/
    ) external override returns (bool) {
        receivedAmt = amount;
        receivedFee = fee;

        if (shouldRepay) {
            // Must TRANSFER back (not approve) — pool reads balanceOf, not transferFrom
            IERC20(asset).transfer(pool, amount + fee);
        }

        return returnValue;
    }
}

contract FlashLoanTest is Test {

    LendingPool           internal pool;
    CollateralManager     internal cm;
    PriceOracle           internal oracle;
    InterestRateModel     internal irm;
    ProtocolTreasury      internal treasury;
    MockERC20             internal usdc;
    MockChainlinkFeed     internal usdcFeed;
    MockFlashLoanReceiver internal receiver;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");

    function setUp() public {
        vm.startPrank(admin);
        treasury = new ProtocolTreasury(admin);
        cm       = new CollateralManager(admin);
        oracle   = new PriceOracle(admin);
        irm      = new InterestRateModel(admin, 100, 400, 7_500, 8_000);
        pool     = new LendingPool(admin, address(cm), address(oracle), address(irm), address(treasury));

        usdc     = new MockERC20("USD Coin", "USDC", 6);
        usdcFeed = new MockChainlinkFeed(); usdcFeed.setPrice(1e8);
        oracle.registerFeed(address(usdc), address(usdcFeed), 86_400);

        cm.setAssetConfig(address(usdc), ICollateralManager.AssetConfig({
            ltv: 8_500, liquidationThreshold: 9_000, liquidationBonus: 500,
            reserveFactor: 500, isActive: true, isBorrowEnabled: true
        }));
        pool.initAsset(address(usdc));
        vm.stopPrank();

        receiver = new MockFlashLoanReceiver(address(pool));

        // Alice provides USDC liquidity
        usdc.mint(alice, 100_000e6);
        vm.startPrank(alice);
        usdc.approve(address(pool), 100_000e6);
        pool.deposit(address(usdc), 100_000e6);
        vm.stopPrank();
    }

    // =========================================================================
    //  Constants / view functions
    // =========================================================================

    function test_flashLoan_feeConstantIsCorrect() public view {
        assertEq(pool.FLASH_LOAN_FEE_BPS(), 9);
    }

    function test_flashLoan_maxFlashLoan_equalsAvailableLiquidity() public view {
        uint256 available = pool.maxFlashLoan(address(usdc));
        assertGt(available, 0);
        assertLe(available, 100_000e6);
    }

    function test_flashLoan_flashFee_calculation() public view {
        // 0.09% of 10,000 USDC = 9 USDC (in 6-decimal units = 9e6)
        assertEq(pool.flashFee(address(usdc), 10_000e6), 9e6);
    }

    // =========================================================================
    //  Successful flash loan
    // =========================================================================

    function test_flashLoan_receiverGetsCorrectAmount() public {
        uint256 borrowAmt = 10_000e6;
        uint256 fee       = pool.flashFee(address(usdc), borrowAmt);

        // Pre-fund receiver with fee (simulates arbitrage profit)
        usdc.mint(address(receiver), fee);

        pool.flashLoan(address(receiver), address(usdc), borrowAmt, "");

        assertEq(receiver.receivedAmt(), borrowAmt, "receiver got correct amount");
        assertEq(receiver.receivedFee(), fee,        "receiver told correct fee");
    }

    function test_flashLoan_poolBalanceIncreasedByFee() public {
        uint256 borrowAmt  = 10_000e6;
        uint256 fee        = pool.flashFee(address(usdc), borrowAmt);
        uint256 poolBefore = usdc.balanceOf(address(pool));

        usdc.mint(address(receiver), fee);
        pool.flashLoan(address(receiver), address(usdc), borrowAmt, "");

        uint256 poolAfter = usdc.balanceOf(address(pool));
        assertGe(poolAfter, poolBefore + fee, "pool balance must increase by fee");
        console2.log("Pool gained:", poolAfter - poolBefore);
    }

    function test_flashLoan_emitsEvent() public {
        uint256 amt = 5_000e6;
        uint256 fee = pool.flashFee(address(usdc), amt);
        usdc.mint(address(receiver), fee);

        // Record all logs emitted during the flash loan
        vm.recordLogs();
        pool.flashLoan(address(receiver), address(usdc), amt, "");

        // Verify at least one event was emitted (the FlashLoan event from FlashLoanProvider)
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertGt(logs.length, 0, "flash loan must emit at least one event");
    }

    // =========================================================================
    //  Failure cases
    // =========================================================================

    function test_flashLoan_zeroAmount_reverts() public {
        vm.expectRevert();
        pool.flashLoan(address(receiver), address(usdc), 0, "");
    }

    function test_flashLoan_zeroReceiver_reverts() public {
        vm.expectRevert();
        pool.flashLoan(address(0), address(usdc), 1_000e6, "");
    }

    function test_flashLoan_exceedingLiquidity_reverts() public {
        vm.expectRevert();
        pool.flashLoan(address(receiver), address(usdc), 200_000e6, "");
    }

    function test_flashLoan_noRepayment_reverts() public {
        receiver.setShouldRepay(false);
        vm.expectRevert();
        pool.flashLoan(address(receiver), address(usdc), 10_000e6, "");
    }

    function test_flashLoan_receiverReturnsFalse_reverts() public {
        receiver.setReturnValue(false);
        usdc.mint(address(receiver), 10_000e6);
        vm.expectRevert();
        pool.flashLoan(address(receiver), address(usdc), 10_000e6, "");
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_flashLoan_feeIsNonZeroForNonTrivialAmounts(
        uint256 amount
    ) public view {
        amount = bound(amount, 1_000e6, 90_000e6);
        assertGt(pool.flashFee(address(usdc), amount), 0);
    }
}
