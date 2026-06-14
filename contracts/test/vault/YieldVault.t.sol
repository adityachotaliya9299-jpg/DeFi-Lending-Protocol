// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {YieldVault} from "../../src/vault/YieldVault.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {WadRayMath} from "../../src/math/WadRayMath.sol";

/**
 * @title MockPool
 * @dev Minimal pool mock: deposit mints lToken 1:1, withdraw burns it
 */
contract MockPool {
    MockERC20 public lToken;
    MockERC20 public underlying;

    constructor(address _underlying) {
        underlying = MockERC20(_underlying);
        lToken = new MockERC20("Lending USDC", "lUSDC", 6);
    }

    function deposit(address, uint256 amount) external {
        MockERC20(address(underlying)).transferFrom(msg.sender, address(this), amount);
        lToken.mint(msg.sender, amount);
    }

    function withdraw(address, uint256 amount) external returns (uint256) {
        lToken.burn(msg.sender, amount);
        underlying.transfer(msg.sender, amount);
        return amount;
    }
}

/**
 * @title YieldVaultTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 18 tests for ERC-4626 yield vault wrapping LendFi lTokens
 */
contract YieldVaultTest is Test {
    using WadRayMath for uint256;

    YieldVault  internal vault;
    MockPool    internal pool;
    MockERC20   internal usdc;

    address internal admin    = makeAddr("admin");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal treasury = makeAddr("treasury");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        pool = new MockPool(address(usdc));

        vault = new YieldVault(
            address(usdc),
            address(pool.lToken()),
            address(pool),
            treasury,
            admin,
            "LendFi USDC Vault",
            "lfUSDC"
        );

        // Fund users
        usdc.mint(alice, 100_000e6);
        usdc.mint(bob,   100_000e6);

        // Give pool underlying for withdrawals
        usdc.mint(address(pool), 1_000_000e6);
    }

    // =========================================================================
    //  ERC-4626 — convertToShares / convertToAssets
    // =========================================================================

    function test_convertToShares_firstDeposit_oneToOne() public view {
        // Before any deposits, 1:1 ratio
        assertEq(vault.convertToShares(1_000e6), 1_000e6);
    }

    function test_convertToAssets_firstDeposit_oneToOne() public view {
        assertEq(vault.convertToAssets(1_000e6), 1_000e6);
    }

    function test_previewDeposit_matchesConvertToShares() public view {
        assertEq(vault.previewDeposit(5_000e6), vault.convertToShares(5_000e6));
    }

    function test_previewRedeem_matchesConvertToAssets() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);
        vm.stopPrank();

        uint256 shares = vault.balanceOf(alice);
        assertEq(vault.previewRedeem(shares), vault.convertToAssets(shares));
    }

    // =========================================================================
    //  Deposit
    // =========================================================================

    function test_deposit_mintsShares() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        uint256 shares = vault.deposit(10_000e6, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), shares);
        assertGt(shares, 0);
    }

    function test_deposit_pullsUnderlying() public {
        uint256 balBefore = usdc.balanceOf(alice);

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), balBefore - 10_000e6);
    }

    function test_deposit_zeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(YieldVault.YieldVault__ZeroAmount.selector);
        vault.deposit(0, alice);
    }

    function test_deposit_zeroReceiverReverts() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 1_000e6);
        vm.expectRevert(YieldVault.YieldVault__ZeroAddress.selector);
        vault.deposit(1_000e6, address(0));
        vm.stopPrank();
    }

    function test_deposit_emitsEvent() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 1_000e6);
        vm.expectEmit(true, true, false, false);
        emit YieldVault.Deposit(alice, alice, 1_000e6, 0);
        vault.deposit(1_000e6, alice);
        vm.stopPrank();
    }

    function test_deposit_maxDepositEnforced() public {
        vm.prank(admin);
        vault.setMaxDeposit(5_000e6);

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vm.expectRevert(YieldVault.YieldVault__ExceedsMaxDeposit.selector);
        vault.deposit(6_000e6, alice);
        vm.stopPrank();
    }

    // =========================================================================
    //  Redeem
    // =========================================================================

    function test_redeem_returnsAssets() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        uint256 shares = vault.deposit(10_000e6, alice);
        vm.stopPrank();

        uint256 balBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        vault.redeem(shares, alice, alice);

        // Alice gets back assets minus fee (2%)
        uint256 received = usdc.balanceOf(alice) - balBefore;
        assertGt(received, 0);
        assertLe(received, 10_000e6); // at most original (minus fee)
    }

    function test_redeem_feeGoesToTreasury() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        uint256 shares = vault.deposit(10_000e6, alice);
        vm.stopPrank();

        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        vault.redeem(shares, alice, alice);

        assertGt(usdc.balanceOf(treasury), treasuryBefore, "treasury should collect fee");
    }

    function test_redeem_insufficientSharesReverts() public {
        vm.prank(alice);
        vm.expectRevert(YieldVault.YieldVault__InsufficientShares.selector);
        vault.redeem(1_000e6, alice, alice);
    }

    function test_redeem_burnsShares() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        uint256 shares = vault.deposit(10_000e6, alice);
        vault.redeem(shares, alice, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 0);
    }

    // =========================================================================
    //  Multi-user share dilution
    // =========================================================================

    function test_multiUser_sharesProportional() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, bob);
        vm.stopPrank();

        assertApproxEqAbs(vault.balanceOf(alice), vault.balanceOf(bob), 1);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_deposit_sharesProportional(uint256 amount) public {
        amount = bound(amount, 1e6, 50_000e6);
        usdc.mint(alice, amount);

        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(amount, alice);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(vault.totalSupply(), shares);
    }
}
