// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {
    IERC721Receiver
} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title NFTCollateralManager
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Use ERC-721 NFTs as collateral for borrowing
 *
 * Key design:
 * - Supports multiple NFT collections with configurable LTV
 * - Floor price oracle per collection (updated by admin/keeper)
 * - User deposits NFT → credited collateral = floorPrice * ltv
 * - Borrowing limited to LTV% of NFT floor value
 * - Liquidation: HF < 1 → liquidator pays debt → receives NFT
 * - Partial liquidation: not supported (NFTs are atomic)
 * - Each NFT tracked individually (tokenId → owner)
 */
contract NFTCollateralManager is
    AccessControl,
    ReentrancyGuard,
    IERC721Receiver
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    uint256 public constant BPS_TOTAL = 10_000;
    uint256 public constant HEALTH_FACTOR_OK = 1e18;

    error NFTCollateral__ZeroAddress();
    error NFTCollateral__CollectionNotSupported(address collection);
    error NFTCollateral__NotOwner(address caller, address owner);
    error NFTCollateral__HasActiveLoan(address collection, uint256 tokenId);
    error NFTCollateral__NoLoan(address collection, uint256 tokenId);
    error NFTCollateral__HealthFactorOk(uint256 hf);
    error NFTCollateral__ZeroFloorPrice();
    error NFTCollateral__LtvTooHigh();

    event CollectionAdded(
        address indexed collection,
        uint256 ltvBps,
        uint256 liquidationBonusBps
    );
    event FloorPriceUpdated(address indexed collection, uint256 newPrice);
    event NFTDeposited(
        address indexed user,
        address indexed collection,
        uint256 tokenId,
        uint256 collateralValue
    );
    event NFTWithdrawn(
        address indexed user,
        address indexed collection,
        uint256 tokenId
    );
    event NFTLiquidated(
        address indexed borrower,
        address indexed liquidator,
        address collection,
        uint256 tokenId,
        uint256 debtRepaid
    );
    event LoanCreated(
        address indexed user,
        address indexed collection,
        uint256 tokenId,
        uint256 borrowAmount
    );

    struct CollectionConfig {
        uint256 ltvBps; // max borrow % of floor price
        uint256 liquidationBonusBps; // bonus for liquidators
        bool supported;
    }

    struct NFTPosition {
        address owner;
        address collection;
        uint256 tokenId;
        uint256 floorPriceAtDeposit; // WAD
        uint256 borrowedAmount; // underlying token units
        uint256 depositTime;
        bool hasLoan;
    }

    // collection → config
    mapping(address => CollectionConfig) public collections;

    // collection → tokenId → position
    mapping(address => mapping(uint256 => NFTPosition)) public positions;

    // user → list of (collection, tokenId) pairs
    mapping(address => address[]) public userCollections;
    mapping(address => uint256[]) public userTokenIds;

    // collection → current floor price (WAD)
    mapping(address => uint256) public floorPrices;

    // Underlying borrow token (e.g. USDC address)
    address public immutable borrowToken;

    constructor(address admin, address _borrowToken) {
        if (admin == address(0) || _borrowToken == address(0))
            revert NFTCollateral__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);

        borrowToken = _borrowToken;
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    function addCollection(
        address collection,
        uint256 ltvBps,
        uint256 liquidationBonusBps
    ) external onlyRole(ADMIN_ROLE) {
        if (collection == address(0)) revert NFTCollateral__ZeroAddress();
        if (ltvBps > 7_000) revert NFTCollateral__LtvTooHigh(); // max 70% for NFTs

        collections[collection] = CollectionConfig({
            ltvBps: ltvBps,
            liquidationBonusBps: liquidationBonusBps,
            supported: true
        });

        emit CollectionAdded(collection, ltvBps, liquidationBonusBps);
    }

    function updateFloorPrice(
        address collection,
        uint256 price
    ) external onlyRole(ORACLE_ROLE) {
        if (price == 0) revert NFTCollateral__ZeroFloorPrice();
        floorPrices[collection] = price;
        emit FloorPriceUpdated(collection, price);
    }

    // =========================================================================
    //  Deposit NFT as collateral
    // =========================================================================

    function depositNFT(
        address collection,
        uint256 tokenId
    ) external nonReentrant {
        CollectionConfig memory cfg = collections[collection];
        if (!cfg.supported)
            revert NFTCollateral__CollectionNotSupported(collection);

        uint256 floor = floorPrices[collection];
        if (floor == 0) revert NFTCollateral__ZeroFloorPrice();

        // Transfer NFT from user to this contract
        IERC721(collection).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        uint256 collateralValue = (floor * cfg.ltvBps) / BPS_TOTAL;

        positions[collection][tokenId] = NFTPosition({
            owner: msg.sender,
            collection: collection,
            tokenId: tokenId,
            floorPriceAtDeposit: floor,
            borrowedAmount: 0,
            depositTime: block.timestamp,
            hasLoan: false
        });

        userCollections[msg.sender].push(collection);
        userTokenIds[msg.sender].push(tokenId);

        emit NFTDeposited(msg.sender, collection, tokenId, collateralValue);
    }

    // =========================================================================
    //  Withdraw NFT
    // =========================================================================

    function withdrawNFT(
        address collection,
        uint256 tokenId
    ) external nonReentrant {
        NFTPosition storage pos = positions[collection][tokenId];
        if (pos.owner != msg.sender)
            revert NFTCollateral__NotOwner(msg.sender, pos.owner);
        if (pos.hasLoan)
            revert NFTCollateral__HasActiveLoan(collection, tokenId);

        delete positions[collection][tokenId];

        IERC721(collection).safeTransferFrom(
            address(this),
            msg.sender,
            tokenId
        );
        emit NFTWithdrawn(msg.sender, collection, tokenId);
    }

    // =========================================================================
    //  Borrow against NFT
    // =========================================================================

    function borrow(
        address collection,
        uint256 tokenId,
        uint256 amount
    ) external nonReentrant {
        NFTPosition storage pos = positions[collection][tokenId];
        if (pos.owner != msg.sender)
            revert NFTCollateral__NotOwner(msg.sender, pos.owner);

        CollectionConfig memory cfg = collections[collection];
        uint256 floor = floorPrices[collection];
        uint256 maxBorrow = (floor * cfg.ltvBps) / BPS_TOTAL;

        require(pos.borrowedAmount + amount <= maxBorrow, "exceeds LTV");

        pos.borrowedAmount += amount;
        pos.hasLoan = true;

        // Transfer borrow token to user (pool must have funded this contract)
        // In production: integrates with LendingPool.borrow()
        emit LoanCreated(msg.sender, collection, tokenId, amount);
    }

    // =========================================================================
    //  Liquidate
    // =========================================================================

    function liquidate(
        address borrower,
        address collection,
        uint256 tokenId
    ) external nonReentrant {
        NFTPosition storage pos = positions[collection][tokenId];

        require(pos.owner == borrower, "not borrower");
        if (!pos.hasLoan) revert NFTCollateral__NoLoan(collection, tokenId);

        // Check HF < 1
        uint256 hf = _getHealthFactor(collection, tokenId);
        if (hf >= HEALTH_FACTOR_OK) revert NFTCollateral__HealthFactorOk(hf);

        uint256 debt = pos.borrowedAmount;
        CollectionConfig memory cfg = collections[collection];
        uint256 bonus = (debt * cfg.liquidationBonusBps) / BPS_TOTAL;

        // Liquidator repays debt (pull from msg.sender in production)
        // Clear position
        address prevOwner = pos.owner;
        delete positions[collection][tokenId];

        // Transfer NFT to liquidator
        IERC721(collection).safeTransferFrom(
            address(this),
            msg.sender,
            tokenId
        );

        emit NFTLiquidated(prevOwner, msg.sender, collection, tokenId, debt);
    }

    // =========================================================================
    //  View
    // =========================================================================

    function getHealthFactor(
        address collection,
        uint256 tokenId
    ) external view returns (uint256) {
        return _getHealthFactor(collection, tokenId);
    }

    function getMaxBorrow(address collection) external view returns (uint256) {
        CollectionConfig memory cfg = collections[collection];
        return (floorPrices[collection] * cfg.ltvBps) / BPS_TOTAL;
    }

    function getPosition(
        address collection,
        uint256 tokenId
    ) external view returns (NFTPosition memory) {
        return positions[collection][tokenId];
    }

    function isLiquidatable(
        address collection,
        uint256 tokenId
    ) external view returns (bool) {
        return _getHealthFactor(collection, tokenId) < HEALTH_FACTOR_OK;
    }

    // =========================================================================
    //  Internal
    // =========================================================================

    function _getHealthFactor(
        address collection,
        uint256 tokenId
    ) internal view returns (uint256) {
        NFTPosition storage pos = positions[collection][tokenId];
        if (!pos.hasLoan || pos.borrowedAmount == 0) return type(uint256).max;

        CollectionConfig memory cfg = collections[collection];
        uint256 currentFloor = floorPrices[collection];
        // Adjusted collateral = floor * liquidationThreshold (use ltv + 5%)
        uint256 adjustedCollateral = (currentFloor * (cfg.ltvBps + 500)) /
            BPS_TOTAL;
        // HF = adjustedCollateral / debt
        return (adjustedCollateral * 1e18) / pos.borrowedAmount;
    }

    // =========================================================================
    //  ERC721Receiver
    // =========================================================================

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
