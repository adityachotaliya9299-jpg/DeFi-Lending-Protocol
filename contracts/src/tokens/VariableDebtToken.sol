// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20}                 from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Permit}          from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {AccessControl}         from "@openzeppelin/contracts/access/AccessControl.sol";
import {IVariableDebtToken}    from "../interfaces/IVariableDebtToken.sol";
import {WadRayMath}            from "../math/WadRayMath.sol";

/**
 * @title  VariableDebtToken
 * @notice ERC-20 representation of variable-rate debt in the lending pool.
 *
 * Core mechanics:
 *   1. balanceOf(user) = scaledBalance[user] × borrowIndex / RAY
 *      → Interest accrues every second without state writes
 *   2. Transfer is blocked (debt cannot be sent between users)
 *   3. Only LendingPool can mint/burn
 *   4. totalSupply = totalScaledBorrows × borrowIndex / RAY
 *
 * Example flow:
 *   Block 1: User borrows 1000 USDC, borrowIndex = 1e27
 *            → scaledBalance = 1000e6 (stored)
 *            → balanceOf = 1000e6 (1000e6 × 1e27 / 1e27)
 *
 *   Block 1000: borrowIndex = 1.05e27 (5% interest accrued)
 *               → scaledBalance unchanged in storage
 *               → balanceOf = 1050e6 (1000e6 × 1.05e27 / 1e27) ← NOW includes interest
 *
 *   User repays 50 USDC:
 *               → burn(user, 50e6, 1.05e27)
 *               → scaledBalance = 50e6 / (1.05e27 / 1e27) ≈ 47.6e6
 *               → balanceOf = 50e6 (47.6e6 × 1.05e27 / 1e27)
 *
 * Why this design:
 *   - O(1) interest distribution: index update reaches all users instantly
 *   - No per-user balance updates every block → massive gas savings
 *   - Math is clean: scaled_to_real = scaled × index / RAY
 */
contract VariableDebtToken is ERC20, AccessControl, IVariableDebtToken {
    using WadRayMath for uint256;

    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");

    address internal _pool;
    address internal _underlyingAsset;

    mapping(address => uint256) internal _scaledBalances;
    uint256 internal _totalScaledSupply;

    /**
     * @param  pool              The LendingPool address (only entity that can mint/burn).
     * @param  underlyingAsset   The asset this token represents debt for (e.g. USDC).
     * @param  name              Token name (e.g. "Variable Debt USDC").
     * @param  symbol            Token symbol (e.g. "vUSDC").
     */
    constructor(
        address pool,
        address underlyingAsset,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        if (pool == address(0)) revert VariableDebtToken__ZeroAddress();
        if (underlyingAsset == address(0)) revert VariableDebtToken__ZeroAddress();

        _pool = pool;
        _underlyingAsset = underlyingAsset;

        _grantRole(DEFAULT_ADMIN_ROLE, pool);
        _grantRole(POOL_ROLE, pool);
    }

    // ─── ERC-20 Overrides (transfer blocked) ───────────────────────────────────

    /**
     * @notice Transfer is BLOCKED. Debt cannot be transferred between users.
     * @dev    Always reverts to enforce no-transfer invariant.
     */
    function transfer(address, uint256) public pure override(ERC20) returns (bool) {
        revert VariableDebtToken__NonTransferable();
    }

    /**
     * @notice TransferFrom is BLOCKED.
     */
    function transferFrom(
        address,
        address,
        uint256
    ) public pure override(ERC20) returns (bool) {
        revert VariableDebtToken__NonTransferable();
    }

    /**
     * @notice Returns user's current debt INCLUDING accrued interest.
     *
     * This is the key difference from storage: the balance changes every second
     * as the borrowIndex grows, but NO state is written.
     *
     * Formula:
     *   actualBalance = scaledBalance × currentBorrowIndex / RAY
     *
     * @param  user              Address to check balance for.
     * @return Current debt including interest accrued since last mint/burn.
     */
    function balanceOf(address user) public view override(ERC20, IVariableDebtToken) returns (uint256) {
        uint256 scaledBal = _scaledBalances[user];
        if (scaledBal == 0) return 0;

        // Get current borrow index from the pool
        uint256 borrowIndex = _getCurrentBorrowIndex();
        return scaledBal.rayMul(borrowIndex);
    }

    /**
     * @notice Returns total debt INCLUDING accrued interest.
     */
    function totalSupply()
        public
        view
        override(ERC20, IVariableDebtToken)
        returns (uint256)
    {
        if (_totalScaledSupply == 0) return 0;
        uint256 borrowIndex = _getCurrentBorrowIndex();
        return _totalScaledSupply.rayMul(borrowIndex);
    }

    // ─── Scaled balance functions (storage view) ───────────────────────────────

    /**
     * @notice Returns the SCALED balance (actual value stored in state).
     * @dev    This is NOT the actual balance — multiply by index to get actual.
     */
    function scaledBalanceOf(address user) external view override returns (uint256) {
        return _scaledBalances[user];
    }

    /**
     * @notice Returns total SCALED supply (not including index multiplication).
     */
    function totalScaledSupply() external view override returns (uint256) {
        return _totalScaledSupply;
    }

    // ─── Mint/Burn (pool-only) ────────────────────────────────────────────────

    /**
     * @notice Mint debt tokens (user borrows).
     *
     * Conversion:
     *   amount (in token units) → scaledAmount = amount × RAY / borrowIndex
     *   Store scaledAmount. Later, balanceOf = scaledAmount × index / RAY
     *
     * @param  user              User receiving the debt.
     * @param  amount            Amount in token units (e.g. 1000e6 for 1000 USDC).
     * @param  index             Current borrow index at mint time.
     */
    function mint(address user, uint256 amount, uint256 index) external override onlyRole(POOL_ROLE) {
        if (user == address(0)) revert VariableDebtToken__ZeroAddress();
        if (amount == 0) revert VariableDebtToken__InvalidAmount();

        uint256 scaledAmount = amount.rayDiv(index);

        _scaledBalances[user] += scaledAmount;
        _totalScaledSupply += scaledAmount;

        emit Mint(user, amount, index);
    }

    /**
     * @notice Burn debt tokens (user repays).
     *
     * @param  user              User whose debt is being reduced.
     * @param  amount            Amount repaid in token units.
     * @param  index             Current borrow index at burn time.
     */
    function burn(address user, uint256 amount, uint256 index) external override onlyRole(POOL_ROLE) {
        if (user == address(0)) revert VariableDebtToken__ZeroAddress();
        if (amount == 0) revert VariableDebtToken__InvalidAmount();

        uint256 scaledAmount = amount.rayDiv(index);

        _scaledBalances[user] -= scaledAmount;
        _totalScaledSupply -= scaledAmount;

        emit Burn(user, amount, index);
    }

    // ─── Getters ──────────────────────────────────────────────────────────────

    function getUnderlyingAsset() external view override returns (address) {
        return _underlyingAsset;
    }

    function getPool() external view override returns (address) {
        return _pool;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /**
     * @notice Get the current borrow index from the pool.
     * @dev    In production, this calls the pool's getBorrowIndex(asset).
     *         For Phase 2 scope, we accept the index as a parameter elsewhere.
     *         In full integration, the pool maintains this index in ReserveData.
     */
    function _getCurrentBorrowIndex() internal view returns (uint256) {
        // TODO: Call LendingPool.getBorrowIndex(_underlyingAsset)
        // For now, return 1e27 (1.0 RAY) — assume no accrual for initial version
        // This will be wired up when integrating with LendingPool
        return 1e27;
    }

    // ─── Metadata overrides ────────────────────────────────────────────────────

    function decimals() public pure override returns (uint8) {
        // Variable debt tokens match their underlying asset decimals
        // This will be set properly during initialization
        return 18;
    }
}
