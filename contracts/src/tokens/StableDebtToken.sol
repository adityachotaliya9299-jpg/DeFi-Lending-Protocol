// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IStableDebtToken} from "../interfaces/IStableDebtToken.sol";
import {WadRayMath} from "../math/WadRayMath.sol";

/**
 * @title StableDebtToken
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Stable-rate debt token — accrues interest at locked-in rate
 *
 * Key design:
 * - balance(user) = actual debt owed (principal + accrued interest)
 * - stableRate locked at borrow time
 * - interest accrues linearly: debt += principal * stableRate * dt
 * - non-transferable (revert on transfer/transferFrom)
 * - supply-side accrual: supplyRate = stableRate * totalBorrow / totalDeposit
 */
contract StableDebtToken is ERC20, IStableDebtToken {
    using WadRayMath for uint256;

    address public immutable pool;
    address public immutable underlying;

    uint256 private constant RAY = 1e27;

    // user → stableRate (per-second, in ray)
    mapping(address => uint256) private _stableRates;

    // user → principal (amount borrowed, before interest)
    mapping(address => uint256) private _principals;

    // user → lastAccrualTimestamp
    mapping(address => uint256) private _lastAccrualTime;

    // Own supply tracking (NOT using ERC20's private _totalSupply)
    uint256 private _ownTotalSupply;

    constructor(
        address _pool,
        address _underlying,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        require(_pool != address(0), "StableDebtToken__ZeroPool");
        require(_underlying != address(0), "StableDebtToken__ZeroUnderlying");

        pool = _pool;
        underlying = _underlying;
    }

    modifier onlyPool() {
        require(msg.sender == pool, "StableDebtToken__OnlyPool");
        _;
    }

    // =========================================================================
    //  Debt Management
    // =========================================================================

    /**
     * @notice Mint stable debt token when user borrows at fixed rate
     * @param user Borrower
     * @param amount Principal amount borrowed
     * @param stableRate Stable rate (per-second, in ray)
     */
    function mint(
        address user,
        uint256 amount,
        uint256 stableRate
    ) external onlyPool returns (bool) {
        require(user != address(0), "StableDebtToken__ZeroAddress");
        require(amount > 0, "StableDebtToken__ZeroAmount");
        require(stableRate > 0, "StableDebtToken__ZeroRate");

        // Accrue interest on user's existing debt first
        if (_principals[user] > 0) {
            _accrueInterest(user);
        }

        // Add new borrow
        _principals[user] += amount;
        _stableRates[user] = stableRate;
        _lastAccrualTime[user] = block.timestamp;
        _ownTotalSupply += amount;

        emit Mint(user, amount, stableRate);
        return true;
    }

    /**
     * @notice Burn stable debt token on repayment
     * @param user Borrower
     * @param amount Amount to repay
     */
    function burn(address user, uint256 amount) external onlyPool {
        require(user != address(0), "StableDebtToken__ZeroAddress");
        require(amount > 0, "StableDebtToken__ZeroAmount");

        // Accrue interest first
        _accrueInterest(user);
        uint256 currentDebt = balanceOf(user);

        require(amount <= currentDebt, "StableDebtToken__RepayTooMuch");

        // Reduce principal proportionally to repay amount
        uint256 principalReduction = (amount * _principals[user]) / currentDebt;
        _principals[user] -= principalReduction;
        _ownTotalSupply -= principalReduction;

        if (_principals[user] == 0) {
            delete _stableRates[user];
            delete _lastAccrualTime[user];
        }

        emit Burn(user, amount);
    }

    // =========================================================================
    //  Interest Accrual
    // =========================================================================

    /**
     * @notice Accrue interest on user's stable debt since last update
     * @dev Updates _lastAccrualTime[user] to block.timestamp
     * @param user Borrower
     */
    function _accrueInterest(address user) internal {
        uint256 principal = _principals[user];
        if (principal == 0) return;

        uint256 timeDelta = block.timestamp - _lastAccrualTime[user];

        if (timeDelta > 0) {
            _lastAccrualTime[user] = block.timestamp;
        }
    }

    /**
     * @notice Get supply-side interest rate
     * @dev supplyRate = average(stableRate) * utilization
     */
    function getSupplyRate() external view returns (uint256) {
        if (_ownTotalSupply == 0) return 0;
        // Placeholder — implement weighted average if needed
        return 0;
    }

    /**
     * @notice Get stable rate for a user
     */
    function getStableBorrowRate(address user) external view returns (uint256) {
        return _stableRates[user];
    }

    /**
     * @notice Get principal (before interest) for a user
     */
    function principalBalanceOf(address user) external view returns (uint256) {
        return _principals[user];
    }

    /**
     * @notice Get actual debt (principal + accrued interest)
     * @dev Calculates on-the-fly: debt = principal * (1 + rate * dt)
     */
    function balanceOf(address account)
        public
        view
        override(ERC20)
        returns (uint256)
    {
        uint256 principal = _principals[account];
        if (principal == 0) return 0;

        uint256 rate = _stableRates[account];
        uint256 timeDelta = block.timestamp - _lastAccrualTime[account];

        // Linear interest: debt = principal * (1 + rate * dt)
        uint256 interestFactor = RAY + (rate * timeDelta);
        uint256 debt = principal.rayMul(interestFactor);

        return debt;
    }

    /**
     * @notice Get total supply (sum of all principals)
     */
    function totalSupply() public view override(ERC20) returns (uint256) {
        return _ownTotalSupply;
    }

    // =========================================================================
    //  Transfers Disabled
    // =========================================================================

    function transfer(address, uint256)
        public
        pure
        override(ERC20)
        returns (bool)
    {
        revert("StableDebtToken__TransferDisabled");
    }

    function transferFrom(address, address, uint256)
        public
        pure
        override(ERC20)
        returns (bool)
    {
        revert("StableDebtToken__TransferDisabled");
    }

    function approve(address, uint256)
        public
        pure
        override(ERC20)
        returns (bool)
    {
        revert("StableDebtToken__ApprovalDisabled");
    }

    function increaseAllowance(address, uint256)
        public
        pure
        override(ERC20)
        returns (bool)
    {
        revert("StableDebtToken__ApprovalDisabled");
    }

    function decreaseAllowance(address, uint256)
        public
        pure
        override(ERC20)
        returns (bool)
    {
        revert("StableDebtToken__ApprovalDisabled");
    }
}
