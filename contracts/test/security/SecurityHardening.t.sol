// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {SecurityHardening} from "../../src/security/SecurityHardening.sol";

/**
 * @title SecurityHardeningTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 12 tests for per-asset circuit breakers and front-running mitigations
 */
contract SecurityHardeningTest is Test {

    SecurityHardening internal sec;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");
    address internal asset = makeAddr("asset");

    function setUp() public {
        sec = new SecurityHardening(admin);
        
        vm.warp(3601);
    }

    // =========================================================================
    //  Per-asset pause
    // =========================================================================

    function test_pauseAsset_preventsUse() public {
        vm.prank(admin);
        sec.pauseAsset(asset);

        vm.expectRevert(abi.encodeWithSelector(SecurityHardening.Security__AssetPaused.selector, asset));
        sec.requireAssetNotPaused(asset);
    }

    function test_unpauseAsset_allowsUse() public {
        vm.prank(admin);
        sec.pauseAsset(asset);
        vm.prank(admin);
        sec.unpauseAsset(asset);

        // Should not revert
        sec.requireAssetNotPaused(asset);
    }

    function test_pauseAsset_onlyGuardian() public {
        vm.prank(alice);
        vm.expectRevert();
        sec.pauseAsset(asset);
    }

    function test_pauseAsset_emitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit SecurityHardening.AssetPaused(asset, true);
        sec.pauseAsset(asset);
    }

    // =========================================================================
    //  Borrow cooldown
    // =========================================================================

    function test_borrowCooldown_firstBorrowSucceeds() public {
        vm.prank(admin);
        sec.checkAndUpdateBorrowCooldown(alice);
        // Should not revert
    }

    function test_borrowCooldown_tooSoonReverts() public {
        vm.prank(admin);
        sec.checkAndUpdateBorrowCooldown(alice);

        vm.prank(admin);
        vm.expectRevert();
        sec.checkAndUpdateBorrowCooldown(alice);
    }

    function test_borrowCooldown_afterCooldownSucceeds() public {
        vm.prank(admin);
        sec.checkAndUpdateBorrowCooldown(alice);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(admin);
        sec.checkAndUpdateBorrowCooldown(alice); // should succeed
    }

    // =========================================================================
    //  Commit-reveal
    // =========================================================================

    function test_commitLiquidation_stores() public {
        bytes32 salt = keccak256("salt");
        bytes32 hash = keccak256(abi.encode(alice, asset, asset, 1_000e6, salt));

        vm.prank(bob);
        sec.commitLiquidation(hash);

        (address liquidator, , , ) = sec.commits(hash);
        assertTrue(liquidator == bob);
    }

    function test_revealLiquidation_tooEarlyReverts() public {
        bytes32 salt  = keccak256("salt");
        address debt  = makeAddr("debt");
        address coll  = makeAddr("coll");
        bytes32 hash  = keccak256(abi.encode(alice, debt, coll, 1_000e6, salt));

        vm.prank(bob);
        sec.commitLiquidation(hash);

        vm.expectRevert();
        vm.prank(bob);
        sec.revealLiquidation(alice, debt, coll, 1_000e6, salt);
    }

   function test_revealLiquidation_afterDelaySucceeds() public {
        bytes32 salt = keccak256("salt");
        address debt = makeAddr("debt");
        address coll = makeAddr("coll");
        bytes32 hash = keccak256(abi.encode(alice, debt, coll, 1_000e6, salt));

        vm.prank(bob);
        sec.commitLiquidation(hash);

        vm.roll(block.number + 3); // past COMMIT_DELAY=2

        vm.prank(bob);
        sec.revealLiquidation(alice, debt, coll, 1_000e6, salt);

        (, , , bool revealed) = sec.commits(hash);
        assertTrue(revealed);
    }

    // =========================================================================
    //  Price deviation guard
    // =========================================================================

    function test_priceDeviation_withinBound_accepted() public {
        vm.prank(admin);
        sec.setTwapPrice(asset, 2_000e18);

        vm.prank(admin);
        bool accepted = sec.checkPriceDeviation(asset, 2_050e18); // 2.5% deviation
        assertTrue(accepted);
    }

    function test_priceDeviation_tooHighReverts() public {
        vm.prank(admin);
        sec.setTwapPrice(asset, 2_000e18);

        vm.prank(admin);
        vm.expectRevert();
        sec.checkPriceDeviation(asset, 3_000e18); // 50% deviation > 10% max
    }

    // =========================================================================
    //  Rate limit
    // =========================================================================

    function test_rateLimit_exceedingReverts() public {
        vm.prank(admin);
        sec.setBorrowRateLimit(asset, 1_000e6); // 1000 USDC per block

        vm.prank(admin);
        sec.checkAndUpdateRateLimit(asset, 800e6); // ok

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(
            SecurityHardening.Security__RateLimitExceeded.selector, asset, 1_000e6
        ));
        sec.checkAndUpdateRateLimit(asset, 300e6); // total 1100 > 1000
    }
}
