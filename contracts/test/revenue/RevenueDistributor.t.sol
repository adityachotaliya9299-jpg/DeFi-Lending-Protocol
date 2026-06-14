// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {RevenueDistributor} from "../../src/revenue/RevenueDistributor.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/**
 * @title RevenueDistributorTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 5 tests for epoch-based protocol revenue distribution
 */
contract RevenueDistributorTest is Test {

    RevenueDistributor internal dist;
    MockERC20          internal token;

    address internal admin = makeAddr("admin");
    address internal dao   = makeAddr("dao");
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    // 60% stakers, 30% LPs, 10% DAO
    uint256 constant STAKER_BPS = 6_000;
    uint256 constant LP_BPS     = 3_000;
    uint256 constant DAO_BPS    = 1_000;

    function setUp() public {
        token = new MockERC20("Revenue", "REV", 18);
        dist  = new RevenueDistributor(admin, dao, address(token), STAKER_BPS, LP_BPS, DAO_BPS);

        token.mint(admin, 1_000_000e18);
        vm.prank(admin);
        token.approve(address(dist), type(uint256).max);
    }

    function test_fundEpoch_storesRevenue() public {
        vm.prank(admin);
        dist.fundEpoch(100_000e18);

        RevenueDistributor.EpochData memory ep = dist.getEpochData(1);
        assertEq(ep.totalRevenue,  100_000e18);
        assertEq(ep.stakerRevenue, 60_000e18);
        assertEq(ep.lpRevenue,     30_000e18);
        assertEq(ep.daoRevenue,    10_000e18);
    }

    function test_claimStaker_proportionalToClaim() public {
        vm.prank(admin);
        dist.fundEpoch(100_000e18);

        // Alice = 3x Bob in staker shares
        vm.startPrank(admin);
        dist.snapshotStaker(1, alice, 3_000e18);
        dist.snapshotStaker(1, bob,   1_000e18);
        vm.stopPrank();

        // Advance epoch
        vm.warp(block.timestamp + 7 days + 1);
        dist.advanceEpoch();

        vm.prank(alice);
        dist.claimStaker(1);

        // Alice gets 3/4 of 60_000 = 45_000
        assertApproxEqAbs(token.balanceOf(alice), 45_000e18, 1e15);
    }

    function test_claimLP_works() public {
        vm.prank(admin);
        dist.fundEpoch(100_000e18);

        vm.prank(admin);
        dist.snapshotLP(1, alice, 1_000e18);

        vm.warp(block.timestamp + 7 days + 1);
        dist.advanceEpoch();

        vm.prank(alice);
        dist.claimLP(1);

        assertGt(token.balanceOf(alice), 0);
    }

    function test_doubleClaim_reverts() public {
        vm.prank(admin);
        dist.fundEpoch(100_000e18);
        vm.prank(admin);
        dist.snapshotStaker(1, alice, 1_000e18);

        vm.warp(block.timestamp + 7 days + 1);
        dist.advanceEpoch();

        vm.prank(alice);
        dist.claimStaker(1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(
            RevenueDistributor.RevDist__AlreadyClaimed.selector, alice, 1
        ));
        dist.claimStaker(1);
    }

    function test_updateSplit_badSumReverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(
            RevenueDistributor.RevDist__SplitMustSum10000.selector, 9_000
        ));
        dist.updateSplit(5_000, 3_000, 1_000); // sums to 9_000
    }
}
