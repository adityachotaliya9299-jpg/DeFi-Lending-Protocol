// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard}   from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl}     from "@openzeppelin/contracts/access/AccessControl.sol";
import {SafeERC20}         from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20}            from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata}    from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ILendingPool}      from "../interfaces/ILendingPool.sol";
import {ICollateralManager} from "../interfaces/ICollateralManager.sol";
import {IPriceOracle}      from "../interfaces/IPriceOracle.sol";
import {IInterestRateModel} from "../interfaces/IInterestRateModel.sol";
import {LendingToken}      from "../tokens/LendingToken.sol";
import {WadRayMath}          from "../math/WadRayMath.sol";
import {PercentageMath}      from "../math/PercentageMath.sol";
import {FlashLoanProvider}   from "./FlashLoanProvider.sol";
import {IFlashLoanReceiver}  from "../interfaces/IFlashLoanReceiver.sol";

/**
 * @title  LendingPool
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Core protocol contract — handles deposits, borrows, repayments,
 *         withdrawals, and liquidations.
 *
 * ─── Interest Model ────────────────────────────────────────────────────────
 *
 *   Every asset has two indices that start at RAY (1.0) and only increase:
 *
 *     liquidityIndex  — multiplied into scaled deposits → depositor's current value
 *     borrowIndex     — multiplied into scaled debts    → borrower's current debt
 *
 *   On every state-changing call, _accrueInterest() runs first:
 *     newBorrowIndex   = oldBorrowIndex * (1 + borrowRate * dt)
 *     newLiquidityIndex = oldLiquidityIndex * (1 + supplyRate * dt)
 *
 * ─── Scaled Balances ───────────────────────────────────────────────────────
 *
 *   scaledDeposit[user][asset] = deposit / liquidityIndexAtDepositTime
 *   currentDeposit             = scaledDeposit * currentLiquidityIndex
 *
 *   scaledBorrow[user][asset]  = borrow  / borrowIndexAtBorrowTime
 *   currentDebt                = scaledBorrow  * currentBorrowIndex
 *
 * ─── Security ──────────────────────────────────────────────────────────────
 *
 *   • ReentrancyGuard on all state-mutating externals
 *   • Health factor enforced before every borrow and withdrawal
 *   • Oracle staleness checked on every price read (inside PriceOracle)
 *   • Close factor: liquidator can repay at most 50% of debt per call
 *   • Liquidation only when HF < 1.0
 */
contract LendingPool is ILendingPool, ReentrancyGuard, AccessControl, FlashLoanProvider {
    using SafeERC20   for IERC20;
    using WadRayMath  for uint256;
    using PercentageMath for uint256;

    // ─────────────────────────────────────────────────────────────────────────
    //  Roles
    // ─────────────────────────────────────────────────────────────────────────

    bytes32 public constant POOL_ADMIN_ROLE = keccak256("POOL_ADMIN_ROLE");

    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint256 private constant RAY             = WadRayMath.RAY;
    uint256 private constant WAD             = WadRayMath.WAD;
    uint256 private constant HEALTH_FACTOR_OK = 1e18; // 1.0 in WAD
    uint256 public  constant CLOSE_FACTOR_BPS = 5_000; // 50% of debt per liquidation
    uint256 public  constant MAX_ASSETS_PER_USER = 10; // gas bound

    // ─────────────────────────────────────────────────────────────────────────
    //  Immutables
    // ─────────────────────────────────────────────────────────────────────────

    ICollateralManager public immutable collateralManager;
    IPriceOracle       public immutable oracle;
    IInterestRateModel public immutable interestRateModel;
    address            public           treasury;

    // ─────────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Per-asset reserve state.
    mapping(address => ReserveData) private _reserves;

    /// @notice All initialised asset addresses.
    address[] private _assetList;
    mapping(address => bool) private _isAsset;

    /// @notice User scaled deposits: user → asset → scaledAmount.
    mapping(address => mapping(address => uint256)) private _scaledDeposits;

    /// @notice User scaled borrows: user → asset → scaledAmount.
    mapping(address => mapping(address => uint256)) private _scaledBorrows;

    /// @notice Assets a user has deposited (for health factor iteration).
    mapping(address => address[]) private _userCollateral;
    mapping(address => mapping(address => bool)) private _hasCollateral;

    /// @notice Assets a user has borrowed (for health factor iteration).
    mapping(address => address[]) private _userBorrows;
    mapping(address => mapping(address => bool)) private _hasBorrow;

    // ─────────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address admin_,
        address collateralManager_,
        address oracle_,
        address interestRateModel_,
        address treasury_
    ) {
        if (admin_             == address(0)) revert LendingPool__ZeroAddress();
        if (collateralManager_ == address(0)) revert LendingPool__ZeroAddress();
        if (oracle_            == address(0)) revert LendingPool__ZeroAddress();
        if (interestRateModel_ == address(0)) revert LendingPool__ZeroAddress();
        if (treasury_          == address(0)) revert LendingPool__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(POOL_ADMIN_ROLE,    admin_);

        collateralManager = ICollateralManager(collateralManager_);
        oracle            = IPriceOracle(oracle_);
        interestRateModel = IInterestRateModel(interestRateModel_);
        treasury          = treasury_;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Admin — asset initialisation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Initialise a new asset in the pool.
     * @dev    Deploys a fresh LendingToken receipt token for this asset.
     *         Asset must already be configured in CollateralManager.
     */
    function initAsset(address asset) external onlyRole(POOL_ADMIN_ROLE) {
        if (asset == address(0)) revert LendingPool__ZeroAddress();
        if (_isAsset[asset]) return; // idempotent
        if (!collateralManager.isAssetActive(asset))
            revert LendingPool__AssetNotSupported(asset);

        uint8  dec    = IERC20Metadata(asset).decimals();
        string memory sym = IERC20Metadata(asset).symbol();

        // Deploy receipt token: "Lending WETH" → "lWETH"
        LendingToken lToken = new LendingToken(
            string.concat("Lending ", sym),
            string.concat("l", sym),
            dec,
            asset,
            address(this), // admin
            address(this)  // minter
        );

        _reserves[asset] = ReserveData({
            liquidityIndex:      uint128(RAY),
            borrowIndex:         uint128(RAY),
            totalScaledDeposits: 0,
            totalScaledBorrows:  0,
            lastUpdateTimestamp: uint40(block.timestamp),
            lTokenAddress:       address(lToken),
            isActive:            true,
            isBorrowEnabled:     collateralManager.isBorrowEnabled(asset)
        });

        _assetList.push(asset);
        _isAsset[asset] = true;

        emit AssetInitialised(asset, address(lToken));
    }

    function setTreasury(address treasury_) external onlyRole(POOL_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert LendingPool__ZeroAddress();
        treasury = treasury_;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Core — deposit
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deposit `amount` of `asset` into the pool.
     *         Receive lTokens representing the deposit + accrued interest.
     */
    function deposit(address asset, uint256 amount)
        external override nonReentrant
    {
        if (amount == 0) revert LendingPool__ZeroAmount();
        ReserveData storage reserve = _getActiveReserve(asset);

        _accrueInterest(asset, reserve);

        uint256 liquidityIndex = reserve.liquidityIndex;
        uint256 scaledAmount   = amount.rayDiv(liquidityIndex);

        // Transfer underlying from user → pool
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // Update state
        _scaledDeposits[msg.sender][asset] += scaledAmount;
        reserve.totalScaledDeposits        += scaledAmount;

        // Track user's collateral list
        if (!_hasCollateral[msg.sender][asset]) {
            require(_userCollateral[msg.sender].length < MAX_ASSETS_PER_USER, "max assets");
            _userCollateral[msg.sender].push(asset);
            _hasCollateral[msg.sender][asset] = true;
        }

        // Mint lTokens
        LendingToken(reserve.lTokenAddress).mint(msg.sender, amount, liquidityIndex);

        emit Deposit(asset, msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Core — withdraw
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Withdraw up to `amount` of `asset`.
     *         Pass type(uint256).max to withdraw everything.
     * @return withdrawn  Actual amount transferred to the caller.
     */
    function withdraw(address asset, uint256 amount)
        external override nonReentrant returns (uint256 withdrawn)
    {
        ReserveData storage reserve = _getActiveReserve(asset);
        _accrueInterest(asset, reserve);

        uint256 liquidityIndex  = reserve.liquidityIndex;
        uint256 scaledBalance   = _scaledDeposits[msg.sender][asset];
        uint256 currentBalance  = scaledBalance.rayMul(liquidityIndex);

        if (currentBalance == 0) revert LendingPool__InsufficientBalance();

        // Cap at current balance
        withdrawn = amount > currentBalance ? currentBalance : amount;

        uint256 scaledAmount = withdrawn.rayDiv(liquidityIndex);
        // Avoid dust rounding: if remaining scaled < 1, withdraw everything
        if (scaledBalance - scaledAmount < 1) {
            scaledAmount = scaledBalance;
            withdrawn    = currentBalance;
        }

        // Simulate post-withdrawal health factor
        _scaledDeposits[msg.sender][asset] -= scaledAmount;
        _requireHealthy(msg.sender);
        // (state already updated above — no need to revert it on success)

        reserve.totalScaledDeposits -= scaledAmount;

        // Clean up collateral list if fully withdrawn
        if (_scaledDeposits[msg.sender][asset] == 0) {
            _removeCollateral(msg.sender, asset);
        }

        // Burn lTokens
        LendingToken(reserve.lTokenAddress).burn(msg.sender, withdrawn, liquidityIndex);

        // Transfer underlying to user
        IERC20(asset).safeTransfer(msg.sender, withdrawn);

        emit Withdraw(asset, msg.sender, withdrawn);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Core — borrow
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Borrow `amount` of `asset` against deposited collateral.
     *         Health factor must remain >= 1.0 after the borrow.
     */
    function borrow(address asset, uint256 amount)
        external override nonReentrant
    {
        if (amount == 0) revert LendingPool__ZeroAmount();
        ReserveData storage reserve = _getActiveReserve(asset);
        if (!reserve.isBorrowEnabled) revert LendingPool__BorrowNotEnabled(asset);

        _accrueInterest(asset, reserve);

        // Check available liquidity
        uint256 available = _getAvailableLiquidity(asset, reserve);
        if (amount > available) revert LendingPool__InsufficientLiquidity();

        uint256 borrowIndex  = reserve.borrowIndex;
        uint256 scaledAmount = amount.rayDiv(borrowIndex);

        // Update state BEFORE health check (simulate post-borrow state)
        _scaledBorrows[msg.sender][asset] += scaledAmount;
        reserve.totalScaledBorrows        += scaledAmount;

        if (!_hasBorrow[msg.sender][asset]) {
            require(_userBorrows[msg.sender].length < MAX_ASSETS_PER_USER, "max assets");
            _userBorrows[msg.sender].push(asset);
            _hasBorrow[msg.sender][asset] = true;
        }

        // Health check after borrow
        _requireHealthy(msg.sender);

        // Transfer to user
        IERC20(asset).safeTransfer(msg.sender, amount);

        emit Borrow(asset, msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Core — repay
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Repay up to `amount` of debt on `asset`.
     *         Pass type(uint256).max to repay all outstanding debt.
     * @return repaid  Actual amount repaid.
     */
    function repay(address asset, uint256 amount)
        external override nonReentrant returns (uint256 repaid)
    {
        if (amount == 0) revert LendingPool__ZeroAmount();
        ReserveData storage reserve = _getActiveReserve(asset);
        _accrueInterest(asset, reserve);

        uint256 borrowIndex   = reserve.borrowIndex;
        uint256 scaledDebt    = _scaledBorrows[msg.sender][asset];
        uint256 currentDebt   = scaledDebt.rayMul(borrowIndex);

        if (currentDebt == 0) revert LendingPool__InsufficientBalance();

        repaid = amount > currentDebt ? currentDebt : amount;

        uint256 scaledRepay = repaid.rayDiv(borrowIndex);
        if (scaledDebt - scaledRepay < 1) {
            scaledRepay = scaledDebt;
            repaid      = currentDebt;
        }

        _scaledBorrows[msg.sender][asset] -= scaledRepay;
        reserve.totalScaledBorrows        -= scaledRepay;

        if (_scaledBorrows[msg.sender][asset] == 0) {
            _removeBorrow(msg.sender, asset);
        }

        // Collect reserve factor → treasury
        ICollateralManager.AssetConfig memory cfg =
            collateralManager.getAssetConfig(asset);
        uint256 reserveCut = repaid.percentMul(cfg.reserveFactor);
        uint256 toPool     = repaid - reserveCut;

        IERC20(asset).safeTransferFrom(msg.sender, address(this),  toPool);
        if (reserveCut > 0) {
            IERC20(asset).safeTransferFrom(msg.sender, treasury, reserveCut);
            emit ReservesCollected(asset, reserveCut);
        }

        emit Repay(asset, msg.sender, repaid, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Core — liquidate
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Liquidate an undercollateralised position.
     *
     * @param  borrower        Address of the position to liquidate.
     * @param  debtAsset       The asset the borrower owes.
     * @param  collateralAsset The asset the liquidator will receive.
     * @param  debtAmount      Amount of debt to repay (capped at CLOSE_FACTOR).
     *
     * @dev    Flow:
     *           1. Verify HF < 1.0
     *           2. Cap debtAmount at 50% of debt (close factor)
     *           3. Calculate collateral to seize (debtUsd / collateralPrice * (1 + bonus))
     *           4. Reduce borrower's debt + collateral
     *           5. Transfer debtAsset from liquidator → pool
     *           6. Transfer collateralAsset from pool → liquidator
     */
    function liquidate(
        address borrower,
        address debtAsset,
        address collateralAsset,
        uint256 debtAmount
    ) external override nonReentrant {
        if (debtAmount   == 0)             revert LendingPool__ZeroAmount();
        if (debtAsset    == collateralAsset) revert LendingPool__SameAsset();
        if (borrower     == address(0))    revert LendingPool__ZeroAddress();

        // ── 1. Verify position is liquidatable ──────────────────────────────
        uint256 hf = _calculateHealthFactor(borrower);
        if (hf >= HEALTH_FACTOR_OK) revert LendingPool__HealthFactorOk(hf);

        // ── 2. Accrue interest on both assets ───────────────────────────────
        ReserveData storage debtReserve       = _getActiveReserve(debtAsset);
        ReserveData storage collateralReserve = _getActiveReserve(collateralAsset);
        _accrueInterest(debtAsset,       debtReserve);
        _accrueInterest(collateralAsset, collateralReserve);

        // ── 3. Cap at close factor (50% of debt) ────────────────────────────
        uint256 currentDebt = _scaledBorrows[borrower][debtAsset]
            .rayMul(debtReserve.borrowIndex);
        uint256 maxClose    = currentDebt.percentMul(CLOSE_FACTOR_BPS);
        if (debtAmount > maxClose) debtAmount = maxClose;

        // ── 4. Calculate collateral to seize ────────────────────────────────
        uint256 collateralToSeize;
        {
            uint256 debtUsd        = oracle.getValueInUsd(debtAsset, debtAmount);
            uint256 collPrice      = oracle.getPrice(collateralAsset);
            uint8   collDecimals   = IERC20Metadata(collateralAsset).decimals();
            uint256 bonusFactor    = PercentageMath.PERCENTAGE_FACTOR
                + collateralManager.getAssetConfig(collateralAsset).liquidationBonus;

            collateralToSeize = (debtUsd.percentMul(bonusFactor) * (10 ** collDecimals)) / collPrice;

            uint256 collateralBalance = _scaledDeposits[borrower][collateralAsset]
                .rayMul(collateralReserve.liquidityIndex);

            if (collateralToSeize > collateralBalance) {
                collateralToSeize = collateralBalance;
                debtAmount = (collateralToSeize * collPrice)
                    / (10 ** collDecimals)
                    / bonusFactor
                    * PercentageMath.PERCENTAGE_FACTOR;
            }
        }

        // ── 5. Update borrower's debt ────────────────────────────────────────
        uint256 scaledDebtRepay = debtAmount.rayDiv(debtReserve.borrowIndex);
        _scaledBorrows[borrower][debtAsset] -= scaledDebtRepay;
        debtReserve.totalScaledBorrows      -= scaledDebtRepay;
        if (_scaledBorrows[borrower][debtAsset] == 0) {
            _removeBorrow(borrower, debtAsset);
        }

        // ── 6. Update borrower's collateral ─────────────────────────────────
        uint256 scaledCollateral = collateralToSeize.rayDiv(collateralReserve.liquidityIndex);
        _scaledDeposits[borrower][collateralAsset] -= scaledCollateral;
        collateralReserve.totalScaledDeposits      -= scaledCollateral;
        if (_scaledDeposits[borrower][collateralAsset] == 0) {
            _removeCollateral(borrower, collateralAsset);
        }

        // ── 7. Burn borrower's lTokens ───────────────────────────────────────
        LendingToken(collateralReserve.lTokenAddress)
            .burn(borrower, collateralToSeize, collateralReserve.liquidityIndex);

        // ── 8. Transfer debtAsset from liquidator to pool ───────────────────
        IERC20(debtAsset).safeTransferFrom(msg.sender, address(this), debtAmount);

        // ── 9. Transfer collateral to liquidator ────────────────────────────
        IERC20(collateralAsset).safeTransfer(msg.sender, collateralToSeize);

        emit Liquidation(
            borrower, debtAsset, collateralAsset,
            debtAmount, collateralToSeize, msg.sender
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  View functions
    // ─────────────────────────────────────────────────────────────────────────

    function getReserveData(address asset)
        external view override returns (ReserveData memory)
    {
        return _reserves[asset];
    }

    function getUserHealthFactor(address user) external view override returns (uint256) {
        return _calculateHealthFactor(user);
    }

    function getUserAccountData(address user)
        external view override
        returns (
            uint256 totalCollateralUsd,
            uint256 totalDebtUsd,
            uint256 healthFactor,
            uint256 availableBorrowUsd
        )
    {
        (totalCollateralUsd, totalDebtUsd, healthFactor) = _getAccountTotals(user);
        uint256 maxBorrowUsd;
        address[] memory collAssets = _userCollateral[user];
        for (uint256 i; i < collAssets.length; ++i) {
            address a = collAssets[i];
            uint256 colUsd = oracle.getValueInUsd(a,
                _scaledDeposits[user][a].rayMul(_reserves[a].liquidityIndex));
            maxBorrowUsd += collateralManager.getMaxBorrow(a, colUsd);
        }
        availableBorrowUsd = maxBorrowUsd > totalDebtUsd
            ? maxBorrowUsd - totalDebtUsd
            : 0;
    }

    function getUserScaledDeposit(address user, address asset)
        external view override returns (uint256)
    {
        return _scaledDeposits[user][asset];
    }

    function getUserScaledBorrow(address user, address asset)
        external view override returns (uint256)
    {
        return _scaledBorrows[user][asset];
    }

    function getUserDeposit(address user, address asset)
        external view override returns (uint256)
    {
        return _scaledDeposits[user][asset].rayMul(_reserves[asset].liquidityIndex);
    }

    function getUserDebt(address user, address asset)
        external view override returns (uint256)
    {
        return _scaledBorrows[user][asset].rayMul(_reserves[asset].borrowIndex);
    }

    function getAssetList() external view returns (address[] memory) {
        return _assetList;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal — interest accrual
    // ─────────────────────────────────────────────────────────────────────────

    function _accrueInterest(address asset, ReserveData storage reserve) internal {
        uint256 timeDelta = block.timestamp - reserve.lastUpdateTimestamp;
        if (timeDelta == 0) return;

        uint256 totalLiq    = reserve.totalScaledDeposits.rayMul(reserve.liquidityIndex);
        uint256 totalBorrow = reserve.totalScaledBorrows .rayMul(reserve.borrowIndex);

        uint256 borrowRate = interestRateModel.calculateBorrowRate(totalLiq, totalBorrow);

        ICollateralManager.AssetConfig memory cfg =
            collateralManager.getAssetConfig(asset);
        uint256 supplyRate = interestRateModel.calculateSupplyRate(
            totalLiq, totalBorrow, cfg.reserveFactor
        );

        // Linear approximation: index *= (1 + rate * dt)
        // Sufficient for per-block accrual; production would use e^(rate*dt)
        uint256 borrowFactor  = RAY + borrowRate * timeDelta;
        uint256 supplyFactor  = RAY + supplyRate * timeDelta;

        reserve.borrowIndex    = uint128(uint256(reserve.borrowIndex).rayMul(borrowFactor));
        reserve.liquidityIndex = uint128(uint256(reserve.liquidityIndex).rayMul(supplyFactor));
        reserve.lastUpdateTimestamp = uint40(block.timestamp);

        emit InterestAccrued(asset, reserve.liquidityIndex, reserve.borrowIndex);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal — health factor
    // ─────────────────────────────────────────────────────────────────────────

    function _calculateHealthFactor(address user) internal view returns (uint256) {
        (, , uint256 hf) = _getAccountTotals(user);
        return hf;
    }

    function _getAccountTotals(address user)
        internal view
        returns (uint256 totalCollateralUsd, uint256 totalDebtUsd, uint256 healthFactor)
    {
        address[] memory collAssets = _userCollateral[user];
        address[] memory debtAssets = _userBorrows[user];

        uint256[] memory collUsds = new uint256[](collAssets.length);
        uint256[] memory debtUsds = new uint256[](debtAssets.length);

        for (uint256 i; i < collAssets.length; ++i) {
            address a    = collAssets[i];
            uint256 bal  = _scaledDeposits[user][a].rayMul(_reserves[a].liquidityIndex);
            collUsds[i]  = oracle.getValueInUsd(a, bal);
            totalCollateralUsd += collUsds[i];
        }

        for (uint256 i; i < debtAssets.length; ++i) {
            address a    = debtAssets[i];
            uint256 debt = _scaledBorrows[user][a].rayMul(_reserves[a].borrowIndex);
            debtUsds[i]  = oracle.getValueInUsd(a, debt);
            totalDebtUsd += debtUsds[i];
        }

        healthFactor = collateralManager.calculateHealthFactor(
            collAssets, collUsds, debtUsds
        );
    }

    function _requireHealthy(address user) internal view {
        uint256 hf = _calculateHealthFactor(user);
        if (hf < HEALTH_FACTOR_OK) revert LendingPool__HealthFactorTooLow(hf);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal — helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _getActiveReserve(address asset)
        internal view returns (ReserveData storage)
    {
        ReserveData storage r = _reserves[asset];
        if (!r.isActive) revert LendingPool__AssetNotSupported(asset);
        return r;
    }

    function _getAvailableLiquidity(address asset, ReserveData storage reserve)
        internal view returns (uint256)
    {
        uint256 totalDep = reserve.totalScaledDeposits.rayMul(reserve.liquidityIndex);
        uint256 totalBor = reserve.totalScaledBorrows .rayMul(reserve.borrowIndex);
        return totalDep > totalBor ? totalDep - totalBor : 0;
    }

    function _removeCollateral(address user, address asset) internal {
        delete _hasCollateral[user][asset];
        address[] storage list = _userCollateral[user];
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == asset) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }

    function _removeBorrow(address user, address asset) internal {
        delete _hasBorrow[user][asset];
        address[] storage list = _userBorrows[user];
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == asset) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  FlashLoanProvider hooks
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Event emitted by FlashLoanProvider — declared here for test ABI access.
    event FlashLoanExecuted(
        address indexed receiver,
        address indexed asset,
        uint256 amount,
        uint256 fee
    );

    /**
     * @dev Returns how much of `asset` is available to flash-loan
     *      (total deposits minus current borrows, same as regular borrow liquidity).
     */
    function _getFlashLoanAvailable(address asset)
        internal view override returns (uint256)
    {
        ReserveData storage r = _reserves[asset];
        if (!r.isActive) return 0;
        return _getAvailableLiquidity(asset, r);
    }

    /**
     * @dev Called after a flash loan fee is confirmed received.
     *      Distributes fee to depositors by bumping the liquidity index
     *      — every lToken holder's redeemable amount increases pro-rata.
     *
     *      liquidityIndex += fee * RAY / totalDeposits
     *      (simplified linear bump; production would use rayMul compounding)
     */
    function _onFlashLoanFeeCollected(address asset, uint256 fee) internal override {
        if (fee == 0) return;
        ReserveData storage r = _reserves[asset];
        if (r.totalScaledDeposits == 0) return;

        // Increase liquidity index so depositors earn the fee
        uint256 currentLiq   = r.liquidityIndex;
        uint256 totalDeposits = r.totalScaledDeposits.rayMul(currentLiq);
        // feeRay = fee * RAY / totalDeposits  →  newIndex = oldIndex + feeRay
        uint256 feeIndexDelta = (fee * 1e27) / totalDeposits;
        r.liquidityIndex = uint128(currentLiq + feeIndexDelta);
    }

    /**
     * @dev Only POOL_ADMIN_ROLE can update the flash loan fee.
     */
    function _requireFlashLoanAdmin() internal view override {
        _checkRole(POOL_ADMIN_ROLE);
    }
}
