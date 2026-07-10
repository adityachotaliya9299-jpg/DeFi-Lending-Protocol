// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {NFTCollateralManager} from "../../src/nft/NFTCollateralManager.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockNFT
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @dev Simple mintable ERC-721 for testing
 */
contract MockNFT is ERC721 {
    uint256 public nextId;
    constructor() ERC721("Mock NFT", "MNFT") {}
    function mint(address to) external returns (uint256 id) {
        id = ++nextId;
        _mint(to, id);
    }
}

/**
 * @title NFTCollateralManagerTest
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice 20 tests for NFT collateral management
 */
contract NFTCollateralManagerTest is Test {
    NFTCollateralManager internal ncm;
    MockNFT internal nft;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal token = makeAddr("token"); // borrow token

    uint256 constant FLOOR_PRICE = 10_000e18; // $10,000 WAD
    uint256 constant LTV_BPS = 5_000; // 50% LTV
    uint256 constant LIQ_BONUS_BPS = 800; // 8% bonus

    function setUp() public {
        ncm = new NFTCollateralManager(admin, token);
        nft = new MockNFT();

        vm.startPrank(admin);
        ncm.addCollection(address(nft), LTV_BPS, LIQ_BONUS_BPS);
        ncm.updateFloorPrice(address(nft), FLOOR_PRICE);
        vm.stopPrank();

        // Mint NFTs to alice
        nft.mint(alice); // tokenId = 1
        nft.mint(alice); // tokenId = 2
        nft.mint(bob); // tokenId = 3
    }

    function _deposit(address user, uint256 tokenId) internal {
        vm.startPrank(user);
        nft.approve(address(ncm), tokenId);
        ncm.depositNFT(address(nft), tokenId);
        vm.stopPrank();
    }

    // =========================================================================
    //  Admin — addCollection
    // =========================================================================

    function test_addCollection_storesConfig() public view {
        (uint256 ltv, uint256 bonus, bool supported) = _getConfig();
        assertEq(ltv, LTV_BPS);
        assertEq(bonus, LIQ_BONUS_BPS);
        assertTrue(supported);
    }

    function test_addCollection_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        ncm.addCollection(makeAddr("newNFT"), 5_000, 800);
    }

    function test_addCollection_ltvTooHighReverts() public {
        vm.prank(admin);
        vm.expectRevert(
            NFTCollateralManager.NFTCollateral__LtvTooHigh.selector
        );
        ncm.addCollection(makeAddr("newNFT"), 8_000, 800); // > 70% cap
    }

    function test_updateFloorPrice_storesValue() public view {
        assertEq(ncm.floorPrices(address(nft)), FLOOR_PRICE);
    }

    function test_updateFloorPrice_onlyOracle() public {
        vm.prank(alice);
        vm.expectRevert();
        ncm.updateFloorPrice(address(nft), 20_000e18);
    }

    function test_updateFloorPrice_zeroReverts() public {
        vm.prank(admin);
        vm.expectRevert(
            NFTCollateralManager.NFTCollateral__ZeroFloorPrice.selector
        );
        ncm.updateFloorPrice(address(nft), 0);
    }

    // =========================================================================
    //  depositNFT
    // =========================================================================

    function test_depositNFT_transfersNFTToContract() public {
        _deposit(alice, 1);
        assertEq(nft.ownerOf(1), address(ncm));
    }

    function test_depositNFT_tracksPosition() public {
        _deposit(alice, 1);
        NFTCollateralManager.NFTPosition memory pos = ncm.getPosition(
            address(nft),
            1
        );
        assertEq(pos.owner, alice);
        assertEq(pos.floorPriceAtDeposit, FLOOR_PRICE);
        assertFalse(pos.hasLoan);
    }

    function test_depositNFT_emitsEvent() public {
        vm.startPrank(alice);
        nft.approve(address(ncm), 1);
        vm.expectEmit(true, true, false, false);
        emit NFTCollateralManager.NFTDeposited(alice, address(nft), 1, 0);
        ncm.depositNFT(address(nft), 1);
        vm.stopPrank();
    }

    function test_depositNFT_unsupportedCollectionReverts() public {
        MockNFT unsupported = new MockNFT();
        unsupported.mint(alice);

        vm.startPrank(alice);
        unsupported.approve(address(ncm), 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                NFTCollateralManager
                    .NFTCollateral__CollectionNotSupported
                    .selector,
                address(unsupported)
            )
        );
        ncm.depositNFT(address(unsupported), 1);
        vm.stopPrank();
    }

    // =========================================================================
    //  withdrawNFT
    // =========================================================================

    function test_withdrawNFT_returnsNFT() public {
        _deposit(alice, 1);

        vm.prank(alice);
        ncm.withdrawNFT(address(nft), 1);

        assertEq(nft.ownerOf(1), alice);
    }

    function test_withdrawNFT_withActiveLoanReverts() public {
        _deposit(alice, 1);

        vm.prank(alice);
        ncm.borrow(address(nft), 1, 1_000e18);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                NFTCollateralManager.NFTCollateral__HasActiveLoan.selector,
                address(nft),
                1
            )
        );
        ncm.withdrawNFT(address(nft), 1);
    }

    function test_withdrawNFT_notOwnerReverts() public {
        _deposit(alice, 1);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                NFTCollateralManager.NFTCollateral__NotOwner.selector,
                bob,
                alice
            )
        );
        ncm.withdrawNFT(address(nft), 1);
    }

    // =========================================================================
    //  borrow + HF
    // =========================================================================

    function test_borrow_withinLTV() public {
        _deposit(alice, 1);
        uint256 maxBorrow = ncm.getMaxBorrow(address(nft));

        vm.prank(alice);
        ncm.borrow(address(nft), 1, maxBorrow);

        NFTCollateralManager.NFTPosition memory pos = ncm.getPosition(
            address(nft),
            1
        );
        assertEq(pos.borrowedAmount, maxBorrow);
        assertTrue(pos.hasLoan);
    }

    function test_borrow_exceedsLTVReverts() public {
        _deposit(alice, 1);
        uint256 maxBorrow = ncm.getMaxBorrow(address(nft));

        vm.prank(alice);
        vm.expectRevert("exceeds LTV");
        ncm.borrow(address(nft), 1, maxBorrow + 1);
    }

    function test_healthFactor_noLoan_isMax() public {
        _deposit(alice, 1);
        uint256 hf = ncm.getHealthFactor(address(nft), 1);
        assertEq(hf, type(uint256).max);
    }

    function test_healthFactor_aboveOne_afterSafeBorrow() public {
        _deposit(alice, 1);
        uint256 safeBorrow = (FLOOR_PRICE * LTV_BPS) / 10_000 / 2; // 25% LTV

        vm.prank(alice);
        ncm.borrow(address(nft), 1, safeBorrow);

        uint256 hf = ncm.getHealthFactor(address(nft), 1);
        assertGt(hf, 1e18, "should be healthy");
    }

    // =========================================================================
    //  liquidate
    // =========================================================================

    function test_liquidate_healthyPositionReverts() public {
        _deposit(alice, 1);
        uint256 safeBorrow = 1_000e18;

        vm.prank(alice);
        ncm.borrow(address(nft), 1, safeBorrow);

        vm.prank(bob);
        vm.expectRevert();
        ncm.liquidate(alice, address(nft), 1);
    }

    function test_liquidate_unhealthyPosition_transfersNFT() public {
        _deposit(alice, 1);
        uint256 maxBorrow = ncm.getMaxBorrow(address(nft));

        vm.prank(alice);
        ncm.borrow(address(nft), 1, maxBorrow);

        // Crash floor price to make position liquidatable
        vm.prank(admin);
        ncm.updateFloorPrice(address(nft), FLOOR_PRICE / 3); // -67%

        assertTrue(ncm.isLiquidatable(address(nft), 1));

        vm.prank(bob);
        ncm.liquidate(alice, address(nft), 1);

        assertEq(nft.ownerOf(1), bob, "liquidator receives NFT");
    }

    // =========================================================================
    //  Helpers
    // =========================================================================

    function _getConfig() internal view returns (uint256, uint256, bool) {
        (uint256 ltv, uint256 bonus, bool supported) = ncm.collections(
            address(nft)
        );
        return (ltv, bonus, supported);
    }
}
