// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {WadRayMath} from "../math/WadRayMath.sol";

/**
 * @title YieldVault
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice ERC-4626 compliant vault wrapping LendFi lTokens
 *
 * Key design:
 * - Accepts underlying asset (e.g. USDC), deposits into LendingPool, gets lTokens
 * - Issues vault shares proportional to total assets under management
 * - totalAssets() reads current lToken value (principal + interest)
 * - Auto-compounds: interest accrues without claiming
 * - convertToShares / convertToAssets follow ERC-4626 standard
 * - Management fee (BPS) taken on harvest
 */
contract YieldVault is ERC20, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    error YieldVault__ZeroAddress();
    error YieldVault__ZeroAmount();
    error YieldVault__InsufficientShares();
    error YieldVault__ExceedsMaxDeposit();

    event Deposit(
        address indexed caller,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    event FeesCollected(address indexed treasury, uint256 amount);

    IERC20 public immutable asset;
    address public immutable lToken; // LendingPool receipt token
    address public immutable pool; // LendingPool address
    address public treasury;
    uint256 public managementFeeBps; // e.g. 200 = 2%
    uint256 public maxDeposit_; // 0 = unlimited

    constructor(
        address _asset,
        address _lToken,
        address _pool,
        address _treasury,
        address admin,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        if (_asset == address(0)) revert YieldVault__ZeroAddress();
        if (_lToken == address(0)) revert YieldVault__ZeroAddress();
        if (_pool == address(0)) revert YieldVault__ZeroAddress();
        if (_treasury == address(0)) revert YieldVault__ZeroAddress();
        if (admin == address(0)) revert YieldVault__ZeroAddress();

        asset = IERC20(_asset);
        lToken = _lToken;
        pool = _pool;
        treasury = _treasury;
        managementFeeBps = 200; // 2% default

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // =========================================================================
    //  ERC-4626 Core
    // =========================================================================

    /**
     * @notice Total assets managed = lToken balance of vault (in underlying terms)
     */
    function totalAssets() public view returns (uint256) {
        return IERC20(lToken).balanceOf(address(this));
    }

    /**
     * @notice Convert assets to shares (deposit preview)
     */
    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return assets; // 1:1 for first deposit
        return (assets * supply) / totalAssets();
    }

    /**
     * @notice Convert shares to assets (withdraw preview)
     */
    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return shares;
        return (shares * totalAssets()) / supply;
    }

    /**
     * @notice Preview how many shares a deposit would mint
     */
    function previewDeposit(uint256 assets) external view returns (uint256) {
        return convertToShares(assets);
    }

    /**
     * @notice Preview how many assets a redeem would return
     */
    function previewRedeem(uint256 shares) external view returns (uint256) {
        return convertToAssets(shares);
    }

    /**
     * @notice Deposit assets, receive shares
     * @param assets  Amount of underlying to deposit
     * @param receiver  Who receives the vault shares
     */
    function deposit(
        uint256 assets,
        address receiver
    ) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert YieldVault__ZeroAmount();
        if (receiver == address(0)) revert YieldVault__ZeroAddress();
        if (maxDeposit_ > 0 && assets > maxDeposit_)
            revert YieldVault__ExceedsMaxDeposit();

        shares = convertToShares(assets);

        // Pull underlying from caller
        asset.safeTransferFrom(msg.sender, address(this), assets);

        // Deposit into LendingPool to get lTokens
        asset.approve(pool, assets);
        (bool ok, ) = pool.call(
            abi.encodeWithSignature(
                "deposit(address,uint256)",
                address(asset),
                assets
            )
        );
        require(ok, "YieldVault: pool deposit failed");

        // Mint vault shares
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /**
     * @notice Redeem shares for underlying assets
     * @param shares    Amount of vault shares to burn
     * @param receiver  Who receives the underlying
     * @param owner     Who owns the shares
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert YieldVault__ZeroAmount();
        if (receiver == address(0)) revert YieldVault__ZeroAddress();
        if (balanceOf(owner) < shares) revert YieldVault__InsufficientShares();

        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        assets = convertToAssets(shares);

        // Burn shares
        _burn(owner, shares);

        // Withdraw from LendingPool
        (bool ok, ) = pool.call(
            abi.encodeWithSignature(
                "withdraw(address,uint256)",
                address(asset),
                assets
            )
        );
        require(ok, "YieldVault: pool withdraw failed");

        // Apply management fee
        uint256 fee = (assets * managementFeeBps) / 10_000;
        if (fee > 0) {
            asset.safeTransfer(treasury, fee);
            assets -= fee;
            emit FeesCollected(treasury, fee);
        }

        asset.safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    function setManagementFee(uint256 bps) external onlyRole(ADMIN_ROLE) {
        require(bps <= 1_000, "fee too high"); // max 10%
        managementFeeBps = bps;
    }

    function setMaxDeposit(uint256 max) external onlyRole(ADMIN_ROLE) {
        maxDeposit_ = max;
    }

    function setTreasury(address _treasury) external onlyRole(ADMIN_ROLE) {
        if (_treasury == address(0)) revert YieldVault__ZeroAddress();
        treasury = _treasury;
    }
}
