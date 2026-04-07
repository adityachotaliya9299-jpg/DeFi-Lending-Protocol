// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {LendingToken} from "../../src/tokens/LendingToken.sol";
import {MockERC20}    from "../../src/mocks/MockERC20.sol";
import {WadRayMath}   from "../../src/math/WadRayMath.sol";

/**
 * @title  LendingTokenTest
 * @notice Full test suite for LendingToken — mint, burn, scaled balances,
 *         access control, events, and interest accrual simulation.
 */
contract LendingTokenTest is Test {
    using WadRayMath for uint256;

    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint256 constant RAY = 1e27;

    // ─────────────────────────────────────────────────────────────────────────
    //  Actors
    // ─────────────────────────────────────────────────────────────────────────

    address internal admin  = makeAddr("admin");
    address internal minter = makeAddr("minter");
    address internal alice  = makeAddr("alice");
    address internal bob    = makeAddr("bob");

    LendingToken internal lToken;
    MockERC20    internal underlying;

    // ─────────────────────────────────────────────────────────────────────────
    //  Setup
    // ─────────────────────────────────────────────────────────────────────────

    function setUp() public {
        underlying = new MockERC20("Wrapped Ether", "WETH", 18);

        lToken = new LendingToken(
            "Lending ETH",   // name
            "lETH",          // symbol
            18,              // decimals
            address(underlying),
            admin,
            minter
        );
    }

    // =========================================================================
    //  Deployment / constructor
    // =========================================================================

    function test_deployment_metadata() public view {
        assertEq(lToken.name(),     "Lending ETH");
        assertEq(lToken.symbol(),   "lETH");
        assertEq(lToken.decimals(), 18);
        assertEq(lToken.underlying(), address(underlying));
    }

    function test_deployment_rolesAssigned() public view {
        assertTrue(lToken.hasRole(lToken.MINTER_ROLE(),         minter));
        assertTrue(lToken.hasRole(lToken.DEFAULT_ADMIN_ROLE(),  admin));
        assertFalse(lToken.hasRole(lToken.MINTER_ROLE(),        alice));
    }

    function test_deployment_zeroUnderlyingReverts() public {
        vm.expectRevert(LendingToken.LendingToken__ZeroAddress.selector);
        new LendingToken("X", "X", 18, address(0), admin, minter);
    }

    function test_deployment_zeroAdminReverts() public {
        vm.expectRevert(LendingToken.LendingToken__ZeroAddress.selector);
        new LendingToken("X", "X", 18, address(underlying), address(0), minter);
    }

    function test_deployment_zeroMinterReverts() public {
        vm.expectRevert(LendingToken.LendingToken__ZeroAddress.selector);
        new LendingToken("X", "X", 18, address(underlying), admin, address(0));
    }

    // =========================================================================
    //  mint
    // =========================================================================

    function test_mint_basicMint() public {
        vm.prank(minter);
        lToken.mint(alice, 1_000e18, RAY); // deposit 1000 ETH at index 1.0

        // ERC-20 balance should reflect the mint amount
        assertEq(lToken.balanceOf(alice), 1_000e18);

        // Scaled balance: amount / RAY = 1000e18 (at index 1.0 it equals amount)
        assertEq(lToken.scaledBalanceOf(alice), 1_000e18);

        // Total supply
        assertEq(lToken.totalSupply(),       1_000e18);
        assertEq(lToken.totalScaledSupply(), 1_000e18);
    }

    function test_mint_onlyMinter() public {
        vm.prank(alice);
        vm.expectRevert();
        lToken.mint(alice, 1_000e18, RAY);
    }

    function test_mint_zeroAmountReverts() public {
        vm.prank(minter);
        vm.expectRevert(LendingToken.LendingToken__ZeroAmount.selector);
        lToken.mint(alice, 0, RAY);
    }

    function test_mint_zeroAddressReverts() public {
        vm.prank(minter);
        vm.expectRevert(LendingToken.LendingToken__ZeroAddress.selector);
        lToken.mint(address(0), 1_000e18, RAY);
    }

    function test_mint_zeroIndexReverts() public {
        vm.prank(minter);
        vm.expectRevert(LendingToken.LendingToken__ZeroIndex.selector);
        lToken.mint(alice, 1_000e18, 0);
    }

    function test_mint_emitsMintEvent() public {
        vm.prank(minter);
        vm.expectEmit(true, false, false, true);
        emit LendingToken.Mint(alice, 1_000e18, RAY);
        lToken.mint(alice, 1_000e18, RAY);
    }

    function test_mint_atHigherIndex_scaledBalanceIsLower() public {
        // At index 1.5 (interest has accrued), the same deposit gets fewer scaled tokens
        uint256 index = 1.5e27; // 1.5 RAY

        vm.prank(minter);
        lToken.mint(alice, 1_500e18, index);

        // scaledBalance = 1500 / 1.5 = 1000
        assertApproxEqAbs(lToken.scaledBalanceOf(alice), 1_000e18, 1);
    }

    function test_mint_multipleTimes_accumulatesBalance() public {
        vm.startPrank(minter);
        lToken.mint(alice, 500e18, RAY);
        lToken.mint(alice, 500e18, RAY);
        vm.stopPrank();

        assertEq(lToken.balanceOf(alice),       1_000e18);
        assertEq(lToken.scaledBalanceOf(alice), 1_000e18);
    }

    // =========================================================================
    //  burn
    // =========================================================================

    function test_burn_basicBurn() public {
        vm.startPrank(minter);
        lToken.mint(alice, 1_000e18, RAY);
        lToken.burn(alice, 400e18, RAY);
        vm.stopPrank();

        assertEq(lToken.balanceOf(alice),       600e18);
        assertEq(lToken.scaledBalanceOf(alice), 600e18);
    }

    function test_burn_fullBalance() public {
        vm.startPrank(minter);
        lToken.mint(alice, 1_000e18, RAY);
        lToken.burn(alice, 1_000e18, RAY);
        vm.stopPrank();

        assertEq(lToken.balanceOf(alice), 0);
        assertEq(lToken.totalSupply(),    0);
    }

    function test_burn_onlyMinter() public {
        vm.prank(minter);
        lToken.mint(alice, 1_000e18, RAY);

        vm.prank(alice);
        vm.expectRevert();
        lToken.burn(alice, 500e18, RAY);
    }

    function test_burn_zeroAmountReverts() public {
        vm.prank(minter);
        vm.expectRevert(LendingToken.LendingToken__ZeroAmount.selector);
        lToken.burn(alice, 0, RAY);
    }

    function test_burn_zeroIndexReverts() public {
        vm.prank(minter);
        vm.expectRevert(LendingToken.LendingToken__ZeroIndex.selector);
        lToken.burn(alice, 1_000e18, 0);
    }

    function test_burn_emitsBurnEvent() public {
        vm.startPrank(minter);
        lToken.mint(alice, 1_000e18, RAY);
        vm.expectEmit(true, false, false, true);
        emit LendingToken.Burn(alice, 500e18, RAY);
        lToken.burn(alice, 500e18, RAY);
        vm.stopPrank();
    }

    // =========================================================================
    //  burnAll
    // =========================================================================

    function test_burnAll_clearsEntireBalance() public {
        vm.startPrank(minter);
        lToken.mint(alice, 1_000e18, RAY);
        uint256 burned = lToken.burnAll(alice, RAY);
        vm.stopPrank();

        assertEq(burned,                        1_000e18);
        assertEq(lToken.balanceOf(alice),       0);
        assertEq(lToken.scaledBalanceOf(alice), 0);
        assertEq(lToken.totalScaledSupply(),    0);
    }

    function test_burnAll_zeroBalance_returnsZero() public {
        vm.prank(minter);
        uint256 burned = lToken.burnAll(alice, RAY);
        assertEq(burned, 0);
    }

    // =========================================================================
    //  Interest accrual via balanceWithIndex
    // =========================================================================

    /**
     * @dev Alice deposits 1000 ETH at index 1.0.
     *      Over time the index grows to 1.1 (10% yield).
     *      Her redeemable balance should be 1100 ETH.
     */
    function test_balanceWithIndex_interestAccrual() public {
        vm.prank(minter);
        lToken.mint(alice, 1_000e18, RAY); // index = 1.0

        uint256 scaledBalance = lToken.scaledBalanceOf(alice);
        assertEq(scaledBalance, 1_000e18);

        // Index grows to 1.1 after interest accrual
        uint256 newIndex = 1.1e27;
        uint256 redeemable = lToken.balanceWithIndex(alice, newIndex);

        // Expected: 1000e18 * 1.1e27 / 1e27 = 1100e18
        assertApproxEqAbs(redeemable, 1_100e18, 1);
    }

    function test_balanceWithIndex_zeroIndex_returnsZero() public view {
        assertEq(lToken.balanceWithIndex(alice, 0), 0);
    }

    function test_balanceWithIndex_zeroBalance_returnsZero() public view {
        assertEq(lToken.balanceWithIndex(alice, RAY), 0);
    }

    // =========================================================================
    //  Multi-user scaled balance correctness
    // =========================================================================

    /**
     * @dev Scenario:
     *       1. Alice deposits 1000 ETH at index 1.0  → scaledBalance = 1000
     *       2. Index grows to 1.2  (20% interest)
     *       3. Bob deposits 1200 ETH at index 1.2    → scaledBalance = 1000
     *       4. Index grows to 1.5
     *       5. Both should have redeemable = 1500 ETH
     */
    function test_multiUser_scaledBalancesAreEqual() public {
        vm.prank(minter);
        lToken.mint(alice, 1_000e18, RAY);         // index 1.0

        uint256 indexAtBobDeposit = 1.2e27;

        vm.prank(minter);
        lToken.mint(bob, 1_200e18, indexAtBobDeposit); // index 1.2

        // Both scaled balances should equal 1000e18 (within 1 wei rounding)
        assertApproxEqAbs(lToken.scaledBalanceOf(alice), 1_000e18, 1);
        assertApproxEqAbs(lToken.scaledBalanceOf(bob),   1_000e18, 1);

        // At index 1.5, both should redeem ~1500 ETH
        uint256 finalIndex = 1.5e27;
        assertApproxEqAbs(lToken.balanceWithIndex(alice, finalIndex), 1_500e18, 2);
        assertApproxEqAbs(lToken.balanceWithIndex(bob,   finalIndex), 1_500e18, 2);
    }

    // =========================================================================
    //  ERC-20 standard behaviour
    // =========================================================================

    function test_transfer_works() public {
        vm.prank(minter);
        lToken.mint(alice, 1_000e18, RAY);

        vm.prank(alice);
        lToken.transfer(bob, 400e18);

        assertEq(lToken.balanceOf(alice), 600e18);
        assertEq(lToken.balanceOf(bob),   400e18);
    }

    function test_transferFrom_withApproval() public {
        vm.prank(minter);
        lToken.mint(alice, 1_000e18, RAY);

        vm.prank(alice);
        lToken.approve(bob, 300e18);

        vm.prank(bob);
        lToken.transferFrom(alice, bob, 300e18);

        assertEq(lToken.balanceOf(alice), 700e18);
        assertEq(lToken.balanceOf(bob),   300e18);
    }

    function test_totalSupply_tracksCorrectly() public {
        vm.startPrank(minter);
        lToken.mint(alice, 500e18,  RAY);
        lToken.mint(bob,   300e18,  RAY);
        assertEq(lToken.totalSupply(), 800e18);

        lToken.burn(alice, 200e18, RAY);
        assertEq(lToken.totalSupply(), 600e18);
        vm.stopPrank();
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    /// @dev Mint then burn full amount should leave zero balance.
    function testFuzz_mintThenBurnFull(uint256 amount, uint256 index) public {
        amount = bound(amount, 1, 1e30);
        index  = bound(index,  1, 100 * RAY); // index range: 1 → 100x

        vm.startPrank(minter);
        lToken.mint(alice, amount, index);
        lToken.burn(alice, amount, index);
        vm.stopPrank();

        // After full burn, scaled balance should be ~0 (within 1 for rounding)
        assertLe(lToken.scaledBalanceOf(alice), 1);
        assertLe(lToken.totalScaledSupply(),    1);
    }

    /// @dev balanceWithIndex should be proportional to amount minted.
    function testFuzz_balanceWithIndex_proportional(
        uint256 amount,
        uint256 mintIndex,
        uint256 currentIndex
    ) public {
        amount       = bound(amount,       1e9,  1e30);
        mintIndex    = bound(mintIndex,    RAY,  10 * RAY);
        currentIndex = bound(currentIndex, mintIndex, 20 * RAY);

        vm.prank(minter);
        lToken.mint(alice, amount, mintIndex);

        uint256 redeemable = lToken.balanceWithIndex(alice, currentIndex);

        uint256 expected = WadRayMath.rayMul(
            WadRayMath.rayDiv(amount, mintIndex),
            currentIndex
        );
        assertApproxEqAbs(redeemable, expected, 2);
    }
}
