// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {WadRayMath} from "../math/WadRayMath.sol";

/**
 * @title  LendingToken
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Interest-bearing receipt token minted when users deposit into the
 *         LendingPool.  Analogous to Aave's aToken or Compound's cToken.
 *
 * @dev    DESIGN
 *         ──────
 *         Each `LendingToken` corresponds to exactly one underlying asset:
 *           • Deposit ETH  → receive lETH
 *           • Deposit USDC → receive lUSDC
 *
 *         SCALED BALANCES
 *         ───────────────
 *         Balances are stored *scaled* by the liquidity index so that
 *         interest accrues automatically without iterating over all holders.
 *
 *           scaledBalance = actualBalance / liquidityIndex
 *
 *         When the index grows (as interest accrues), `balanceOf` returns a
 *         larger number even though `scaledBalanceOf` stays constant.  This
 *         mirrors Aave's aToken accounting exactly.
 *
 *         TRANSFER RESTRICTION
 *         ─────────────────────
 *         Transfers update the recipient's scaled balance in the LendingPool
 *         via a callback.  For Phase 2 we keep it simple: only the
 *         LENDING_POOL_ROLE can mint / burn; unrestricted transfers are
 *         allowed between users (the pool handles health-factor checks).
 *
 *         ROLES
 *         ──────
 *         MINTER_ROLE  — LendingPool (set at construction)
 *         DEFAULT_ADMIN_ROLE — deployer / governance
 */
contract LendingToken is ERC20, ERC20Permit, AccessControl {
    using WadRayMath for uint256;

    // ─────────────────────────────────────────────────────────────────────────
    //  Roles
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Only accounts with this role can mint and burn tokens.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ─────────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The underlying ERC-20 asset this token represents.
    address public immutable underlying;

    /// @notice Number of decimals — mirrors the underlying asset.
    uint8 private immutable _decimals;

    // ─────────────────────────────────────────────────────────────────────────
    //  Scaled balance accounting
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Stores the *scaled* balance for each user.
    ///      scaledBalance = depositAmount / liquidityIndexAtDeposit
    mapping(address => uint256) private _scaledBalances;

    /// @dev Total scaled supply (sum of all _scaledBalances).
    uint256 private _totalScaledSupply;

    // ─────────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────────

    error LendingToken__ZeroAmount();
    error LendingToken__ZeroAddress();
    error LendingToken__ZeroIndex();

    // ─────────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted on every mint with the index used for scaling.
    event Mint(address indexed to, uint256 amount, uint256 index);

    /// @notice Emitted on every burn with the index used for scaling.
    event Burn(address indexed from, uint256 amount, uint256 index);

    // ─────────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param name_         Token name (e.g. "Lending ETH").
     * @param symbol_       Token symbol (e.g. "lETH").
     * @param decimals_     Must match the underlying token's decimals.
     * @param underlying_   Address of the underlying ERC-20 asset.
     * @param admin         Address granted DEFAULT_ADMIN_ROLE (governance).
     * @param minter        Address granted MINTER_ROLE (LendingPool).
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address underlying_,
        address admin,
        address minter
    )
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        if (underlying_ == address(0)) revert LendingToken__ZeroAddress();
        if (admin       == address(0)) revert LendingToken__ZeroAddress();
        if (minter      == address(0)) revert LendingToken__ZeroAddress();

        underlying = underlying_;
        _decimals  = decimals_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ERC-20 overrides
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns 18 or the decimals of the underlying asset.
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Returns the ACTUAL balance of `account`, accounting for accrued
     *         interest by multiplying the scaled balance by the current index.
     *
     * @dev    This override is intentionally left as returning the raw ERC-20
     *         balance (from `_balances`) for standard ERC-20 compatibility.
     *         Use `scaledBalanceOf` + index multiplication for the real value.
     *
     *         NOTE: For Phase 2 we keep the standard ERC-20 balance unchanged
     *         so existing tooling (Etherscan, wallets) shows meaningful values.
     *         In Phase 3 (LendingPool integration) we can override balanceOf to
     *         return `scaledBalance * liquidityIndex / RAY` once the pool is live.
     */

    // ─────────────────────────────────────────────────────────────────────────
    //  Scaled balance API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the scaled balance of `account`.
     *
     * @dev    scaledBalance = sum of (amountDeposited / indexAtDeposit) for all deposits.
     *         Multiply by the current liquidity index to get the redeemable amount:
     *           redeemable = scaledBalance * currentIndex / RAY
     */
    function scaledBalanceOf(address account) external view returns (uint256) {
        return _scaledBalances[account];
    }

    /**
     * @notice Returns the total scaled supply.
     */
    function totalScaledSupply() external view returns (uint256) {
        return _totalScaledSupply;
    }

    /**
     * @notice Calculates the actual redeemable balance for `account` given the
     *         current liquidity index.
     *
     * @param  account      User address.
     * @param  currentIndex Current liquidity index in RAY.
     * @return              Redeemable amount in the underlying token's decimals.
     */
    function balanceWithIndex(address account, uint256 currentIndex)
        external
        view
        returns (uint256)
    {
        if (currentIndex == 0) return 0;
        return _scaledBalances[account].rayMul(currentIndex);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Mint / Burn (LendingPool only)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Mints `amount` lTokens to `to` at the given liquidity `index`.
     *
     * @dev    The scaled amount stored is: scaledAmount = amount / index
     *         This is what grows in value as the index increases.
     *
     * @param  to     Recipient (the depositor).
     * @param  amount Amount of underlying deposited (in underlying decimals).
     * @param  index  Current liquidity index in RAY.
     */
    function mint(address to, uint256 amount, uint256 index)
        external
        onlyRole(MINTER_ROLE)
    {
        if (to     == address(0)) revert LendingToken__ZeroAddress();
        if (amount == 0)          revert LendingToken__ZeroAmount();
        if (index  == 0)          revert LendingToken__ZeroIndex();

        // scaledAmount = amount * RAY / index  (rayDiv)
        uint256 scaledAmount = amount.rayDiv(index);

        _scaledBalances[to] += scaledAmount;
        _totalScaledSupply  += scaledAmount;

        // Mint 1:1 ERC-20 tokens for wallet / tooling visibility
        _mint(to, amount);

        emit Mint(to, amount, index);
    }

    /**
     * @notice Burns `amount` lTokens from `from` at the given liquidity `index`.
     *
     * @dev    The scaled amount removed is: scaledAmount = amount / index
     *
     * @param  from   The withdrawer.
     * @param  amount Amount of underlying being withdrawn.
     * @param  index  Current liquidity index in RAY.
     */
    function burn(address from, uint256 amount, uint256 index)
        external
        onlyRole(MINTER_ROLE)
    {
        if (from   == address(0)) revert LendingToken__ZeroAddress();
        if (amount == 0)          revert LendingToken__ZeroAmount();
        if (index  == 0)          revert LendingToken__ZeroIndex();

        uint256 scaledAmount = amount.rayDiv(index);

        // Underflow will revert via Solidity 0.8 checked arithmetic
        _scaledBalances[from] -= scaledAmount;
        _totalScaledSupply    -= scaledAmount;

        _burn(from, amount);

        emit Burn(from, amount, index);
    }

    /**
     * @notice Burns the ENTIRE balance of `from` (used during liquidation).
     *
     * @param  from        The liquidated user.
     * @param  index       Current liquidity index in RAY.
     * @return burnedAmount Exact amount of underlying burned.
     */
    function burnAll(address from, uint256 index)
        external
        onlyRole(MINTER_ROLE)
        returns (uint256 burnedAmount)
    {
        if (index == 0) revert LendingToken__ZeroIndex();

        uint256 scaledBalance = _scaledBalances[from];
        if (scaledBalance == 0) return 0;

        // Recover actual amount from scaled balance
        burnedAmount = scaledBalance.rayMul(index);

        _scaledBalances[from] = 0;
        _totalScaledSupply   -= scaledBalance;

        _burn(from, burnedAmount);

        emit Burn(from, burnedAmount, index);
    }
}
