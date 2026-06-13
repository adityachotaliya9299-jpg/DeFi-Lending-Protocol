// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {StableDebtToken} from "../../src/tokens/StableDebtToken.sol";
import {IStableDebtToken} from "../../src/interfaces/IStableDebtToken.sol";
import {WadRayMath} from "../../src/math/WadRayMath.sol";

/**
 * @title StableDebtTokenTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Tests for stable-rate debt token functionality
 */
contract StableDebtTokenTest is Test {
    using WadRayMath for uint256;

    StableDebtToken internal token;
    address internal pool = makeAddr("pool");
    address internal underlying = makeAddr("underlying");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 constant RAY = 1e27;

    function setUp() public {
        vm.prank(pool);
        token = new StableDebtToken(
            pool,
            underlying,
            "Stable Debt USDC",
            "stableUSDC"
        );
    }

    // =========================================================================
    //  Basic Minting & Burning
    // =========================================================================

    function test_mint_basic() public {
        vm.prank(pool);
        bool success = token.mint(alice, 1_000e6, 1e15);
        assertTrue(success);
        assertEq(token.balanceOf(alice), 1_000e6);
        assertEq(token.totalSupply(), 1_000e6);
    }

    function test_mint_emitsEvent() public {
        vm.prank(pool);
        vm.expectEmit(true, false, false, true);
        emit IStableDebtToken.Mint(alice, 1_000e6, 1e15);
        token.mint(alice, 1_000e6, 1e15);
    }

    function test_mint_zeroAddressReverts() public {
        vm.prank(pool);
        vm.expectRevert("StableDebtToken__ZeroAddress");
        token.mint(address(0), 1_000e6, 1e15);
    }

    function test_mint_zeroAmountReverts() public {
        vm.prank(pool);
        vm.expectRevert("StableDebtToken__ZeroAmount");
        token.mint(alice, 0, 1e15);
    }

    function test_mint_zeroRateReverts() public {
        vm.prank(pool);
        vm.expectRevert("StableDebtToken__ZeroRate");
        token.mint(alice, 1_000e6, 0);
    }

    function test_mint_onlyPool() public {
        vm.prank(alice);
        vm.expectRevert("StableDebtToken__OnlyPool");
        token.mint(alice, 1_000e6, 1e15);
    }

    function test_burn_basic() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 1e15);

        vm.prank(pool);
        token.burn(alice, 500e6);

        assertApproxEqAbs(token.balanceOf(alice), 500e6, 1);
        assertApproxEqAbs(token.totalSupply(), 500e6, 1);
    }

    function test_burn_emitsEvent() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 1e15);

        vm.prank(pool);
        vm.expectEmit(true, false, false, true);
        emit IStableDebtToken.Burn(alice, 500e6);
        token.burn(alice, 500e6);
    }

    function test_burn_onlyPool() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 1e15);

        vm.expectRevert("StableDebtToken__OnlyPool");
        token.burn(alice, 500e6);
    }

    function test_burn_zeroAmountReverts() public {
        vm.prank(pool);
        vm.expectRevert("StableDebtToken__ZeroAmount");
        token.burn(alice, 0);
    }

    function test_burn_tooMuchReverts() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 1e15);

        vm.prank(pool);
        vm.expectRevert("StableDebtToken__RepayTooMuch");
        token.burn(alice, 2_000e6);
    }

    // =========================================================================
    //  Interest Accrual
    // =========================================================================

    function test_interestAccrues_overTime() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 31e15); // ~100% APR for testing

        uint256 balBefore = token.balanceOf(alice);

        vm.warp(block.timestamp + 365 days);

        uint256 balAfter = token.balanceOf(alice);
        assertGt(balAfter, balBefore);
        console2.log("Balance after 1 year (e6):", balAfter / 1e6);
    }

    function test_interestAccrues_withMultipleMints() public {
        uint256 highRate = 1e18;

        vm.prank(pool);
        token.mint(alice, 1_000e6, highRate);

        vm.warp(block.timestamp + 180 days);

        vm.prank(pool);
        token.mint(alice, 500e6, highRate);

        vm.warp(block.timestamp + 1 days);

        uint256 bal = token.balanceOf(alice);
        assertGt(bal, 1_500e6, "balance should exceed 1500e6 after interest");
        console2.log("Balance after 2nd mint + interest (e6):", bal / 1e6);
    }

    function test_burnAccountsForInterest() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 1e15);

        vm.warp(block.timestamp + 30 days);

        uint256 debtBefore = token.balanceOf(alice);

        vm.prank(pool);
        token.burn(alice, 500e6);

        uint256 remaining = token.balanceOf(alice);
        assertApproxEqAbs(remaining, debtBefore - 500e6, 5_000);
    }

    function test_principalBalanceOf() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 1e15);

        assertEq(token.principalBalanceOf(alice), 1_000e6);

        vm.warp(block.timestamp + 1 days);

        // Principal unchanged despite interest
        assertEq(token.principalBalanceOf(alice), 1_000e6);

        // But actual balance increased
        assertGt(token.balanceOf(alice), 1_000e6);
    }

    // =========================================================================
    //  Stable Rate Tracking
    // =========================================================================

    function test_getStableBorrowRate() public {
        uint256 rate = 1e15;
        vm.prank(pool);
        token.mint(alice, 1_000e6, rate);

        assertEq(token.getStableBorrowRate(alice), rate);
    }

    function test_rateUpdatesOnMint() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 1e15);

        vm.prank(pool);
        token.mint(alice, 500e6, 2e15);

        uint256 newRate = token.getStableBorrowRate(alice);
        assertEq(newRate, 2e15);
    }

    // =========================================================================
    //  Transfer Disabled
    // =========================================================================

    function test_transferDisabled() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 1e15);

        vm.prank(alice);
        vm.expectRevert("StableDebtToken__TransferDisabled");
        token.transfer(bob, 500e6);
    }

    function test_transferFromDisabled() public {
        vm.prank(pool);
        token.mint(alice, 1_000e6, 1e15);

        vm.prank(alice);
        vm.expectRevert("StableDebtToken__ApprovalDisabled");
        token.approve(bob, 500e6);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_mint_balanceIsAmount(uint256 amount, uint256 rate)
        public
    {
        amount = bound(amount, 1e6, 1e12);
        rate = bound(rate, 1e14, 1e17);

        vm.prank(pool);
        token.mint(alice, amount, rate);

        assertEq(token.balanceOf(alice), amount);
    }

    function testFuzz_burn_reducesBalance(
        uint256 mintAmount,
        uint256 burnAmount,
        uint256 rate
    ) public {
        mintAmount = bound(mintAmount, 1e6, 1e10);
        burnAmount = bound(burnAmount, 1, mintAmount);
        rate = bound(rate, 1e14, 1e17);

        vm.prank(pool);
        token.mint(alice, mintAmount, rate);

        vm.prank(pool);
        token.burn(alice, burnAmount);

        assertLe(token.balanceOf(alice), mintAmount);
    }

    function testFuzz_principalInvariant_afterBurn(
        uint256 mintAmount,
        uint256 burnAmount,
        uint256 rate
    ) public {
        mintAmount = bound(mintAmount, 1e6, 1e10);
        burnAmount = bound(burnAmount, 1, mintAmount);
        rate = bound(rate, 1e14, 1e17);

        vm.prank(pool);
        token.mint(alice, mintAmount, rate);

        uint256 principalBefore = token.principalBalanceOf(alice);

        vm.warp(block.timestamp + 1 days);

        vm.prank(pool);
        token.burn(alice, burnAmount);

        uint256 principalAfter = token.principalBalanceOf(alice);

        // Principal should reduce, but not by full burnAmount (due to interest)
        assertLt(principalAfter, principalBefore);
    }
}
