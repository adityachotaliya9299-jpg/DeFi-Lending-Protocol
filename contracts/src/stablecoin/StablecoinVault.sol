// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard}  from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable}          from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20}        from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20}           from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ProtocolStablecoin} from "./ProtocolStablecoin.sol";
import {IPriceOracle}     from "../interfaces/IPriceOracle.sol";
import {PercentageMath}   from "../math/PercentageMath.sol";
import {WadRayMath}       from "../math/WadRayMath.sol";

/**
 * @title  StablecoinVault
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice MakerDAO-inspired CDP (Collateralised Debt Position) vault.
 *
 * ─── Architecture ─────────────────────────────────────────────────────────
 *
 *   Users deposit collateral (e.g. WETH) and mint pUSD stablecoin against it.
 *   To recover their collateral they must burn the pUSD they minted.
 *
 *   If the collateral value drops below the liquidation ratio, anyone can
 *   liquidate the vault by repaying the pUSD debt and claiming the collateral
 *   at a discount.
 *
 * ─── Key parameters (per collateral type) ─────────────────────────────────
 *
 *   collateralizationRatio: min collateral value / debt (e.g. 150%)
 *   liquidationRatio:       triggers liquidation (e.g. 130%)
 *   liquidationBonus:       liquidator's reward (e.g. 10%)
 *   debtCeiling:            max pUSD mintable against this collateral
 *   stabilityFee:           annual interest rate on minted pUSD (e.g. 2%)
 *
 * ─── Comparison to MakerDAO ────────────────────────────────────────────────
 *
 *   MakerDAO feature          This implementation
 *   ─────────────────────     ─────────────────────────────────────────────
 *   Ilk (collateral type)   → CollateralConfig struct per asset
 *   Urn (CDP position)      → Vault struct per user per collateral
 *   Jug (stability fee)     → stabilityFee + accruedFee per vault
 *   Cat (liquidation)       → liquidate() with bonus + penalty
 *   Vow (system surplus)    → fees sent to ProtocolTreasury
 *   DSR (savings rate)      → future work
 */
contract StablecoinVault is ReentrancyGuard, Ownable {
    using SafeERC20    for IERC20;
    using PercentageMath for uint256;
    using WadRayMath   for uint256;

    uint256 constant WAD              = 1e18;
    uint256 constant PRECISION        = 10_000;  // bps denominator
    uint256 constant SECONDS_PER_YEAR = 365 days;

    // ── Structs ───────────────────────────────────────────────────────────────

    struct CollateralConfig {
        uint256 collateralizationRatio; // bps — min coll/debt (e.g. 15000 = 150%)
        uint256 liquidationRatio;       // bps — liq threshold (e.g. 13000 = 130%)
        uint256 liquidationBonus;       // bps — bonus for liquidators (e.g. 1000 = 10%)
        uint256 debtCeiling;            // max pUSD mintable (WAD)
        uint256 stabilityFeeBps;        // annual stability fee in bps (e.g. 200 = 2%)
        uint256 totalDebt;              // total pUSD minted against this collateral
        bool    isActive;
    }

    struct Vault {
        uint256 collateralAmount;  // WAD tokens deposited
        uint256 debtAmount;        // pUSD minted (WAD)
        uint256 lastFeeTimestamp;  // for stability fee accrual
    }

    // ── State ─────────────────────────────────────────────────────────────────

    ProtocolStablecoin public immutable pUSD;
    IPriceOracle       public immutable oracle;
    address            public           treasury;

    /// @notice Supported collateral → config
    mapping(address => CollateralConfig) public collateralConfigs;
    address[] public supportedCollaterals;

    /// @notice user → collateral → vault
    mapping(address => mapping(address => Vault)) public vaults;

    // ── Events ────────────────────────────────────────────────────────────────

    event CollateralDeposited(address indexed user, address indexed collateral, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed collateral, uint256 amount);
    event PUSDMinted(address indexed user, address indexed collateral, uint256 amount);
    event PUSDBurned(address indexed user, address indexed collateral, uint256 amount);
    event VaultLiquidated(address indexed borrower, address indexed liquidator, address indexed collateral, uint256 debtRepaid, uint256 collateralSeized);
    event CollateralConfigured(address indexed collateral, CollateralConfig config);
    event StabilityFeePaid(address indexed user, address indexed collateral, uint256 feeAmount);

    // ── Errors ────────────────────────────────────────────────────────────────

    error Vault__CollateralNotSupported(address collateral);
    error Vault__BelowCollateralizationRatio(uint256 ratio, uint256 required);
    error Vault__DebtCeilingExceeded(address collateral, uint256 current, uint256 ceiling);
    error Vault__VaultIsSafe(address user, address collateral, uint256 ratio);
    error Vault__ZeroAmount();
    error Vault__ZeroAddress();
    error Vault__InsufficientCollateral();
    error Vault__InvalidConfig(string reason);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address owner_, address pUSD_, address oracle_, address treasury_) Ownable(owner_) {
        if (pUSD_     == address(0)) revert Vault__ZeroAddress();
        if (oracle_   == address(0)) revert Vault__ZeroAddress();
        if (treasury_ == address(0)) revert Vault__ZeroAddress();

        pUSD     = ProtocolStablecoin(pUSD_);
        oracle   = IPriceOracle(oracle_);
        treasury = treasury_;
    }

    // ── Admin — configure collateral ──────────────────────────────────────────

    function setCollateralConfig(address collateral, CollateralConfig calldata cfg)
        external onlyOwner
    {
        if (collateral == address(0)) revert Vault__ZeroAddress();
        if (cfg.collateralizationRatio <= cfg.liquidationRatio)
            revert Vault__InvalidConfig("collateralRatio must be > liquidationRatio");
        if (cfg.liquidationRatio < 10_000)
            revert Vault__InvalidConfig("liquidationRatio must be >= 100%");
        if (cfg.stabilityFeeBps > 5_000)
            revert Vault__InvalidConfig("stabilityFee > 50%");

        if (!collateralConfigs[collateral].isActive && cfg.isActive) {
            supportedCollaterals.push(collateral);
        }

        uint256 existingDebt = collateralConfigs[collateral].totalDebt;
        collateralConfigs[collateral] = cfg;
        collateralConfigs[collateral].totalDebt = existingDebt;

        emit CollateralConfigured(collateral, cfg);
    }

    // ── Core — deposit collateral ─────────────────────────────────────────────

    /**
     * @notice Deposit collateral to your vault without minting pUSD.
     *         Useful to top up an undercollateralised position.
     */
    function depositCollateral(address collateral, uint256 amount) external nonReentrant {
        if (amount == 0) revert Vault__ZeroAmount();
        _requireActive(collateral);

        // Accrue stability fee on every vault interaction
        _accrueStabilityFee(msg.sender, collateral);

        IERC20(collateral).safeTransferFrom(msg.sender, address(this), amount);
        vaults[msg.sender][collateral].collateralAmount += amount;

        emit CollateralDeposited(msg.sender, collateral, amount);
    }

    // ── Core — mint pUSD ──────────────────────────────────────────────────────

    /**
     * @notice Mint pUSD against deposited collateral.
     *         Collateralisation ratio must remain above minimum after minting.
     *
     * Example: 1 ETH @ $2,000, 150% ratio → max pUSD = $2,000 / 1.5 = 1,333 pUSD
     */
    function mintPUSD(address collateral, uint256 pUSDAmount) external nonReentrant {
        if (pUSDAmount == 0) revert Vault__ZeroAmount();
        _requireActive(collateral);

        // Accrue stability fee first
        _accrueStabilityFee(msg.sender, collateral);

        Vault storage v = vaults[msg.sender][collateral];
        CollateralConfig storage cfg = collateralConfigs[collateral];

        uint256 newDebt = v.debtAmount + pUSDAmount;

        // Check debt ceiling
        if (cfg.totalDebt + pUSDAmount > cfg.debtCeiling)
            revert Vault__DebtCeilingExceeded(collateral, cfg.totalDebt, cfg.debtCeiling);

        v.debtAmount     = newDebt;
        cfg.totalDebt   += pUSDAmount;

        // Check collateralisation ratio after minting
        uint256 ratio = _getCollateralisationRatio(msg.sender, collateral);
        if (ratio < cfg.collateralizationRatio)
            revert Vault__BelowCollateralizationRatio(ratio, cfg.collateralizationRatio);

        pUSD.mint(msg.sender, pUSDAmount);
        emit PUSDMinted(msg.sender, collateral, pUSDAmount);
    }

    /**
     * @notice Deposit collateral and mint pUSD in one transaction.
     */
    function depositAndMint(address collateral, uint256 collateralAmount, uint256 pUSDAmount)
        external nonReentrant
    {
        if (collateralAmount == 0 || pUSDAmount == 0) revert Vault__ZeroAmount();
        _requireActive(collateral);
        _accrueStabilityFee(msg.sender, collateral);

        IERC20(collateral).safeTransferFrom(msg.sender, address(this), collateralAmount);
        vaults[msg.sender][collateral].collateralAmount += collateralAmount;
        if (vaults[msg.sender][collateral].lastFeeTimestamp == 0)
            vaults[msg.sender][collateral].lastFeeTimestamp = block.timestamp;

        Vault storage v = vaults[msg.sender][collateral];
        CollateralConfig storage cfg = collateralConfigs[collateral];

        if (cfg.totalDebt + pUSDAmount > cfg.debtCeiling)
            revert Vault__DebtCeilingExceeded(collateral, cfg.totalDebt, cfg.debtCeiling);

        v.debtAmount   += pUSDAmount;
        cfg.totalDebt  += pUSDAmount;

        uint256 ratio = _getCollateralisationRatio(msg.sender, collateral);
        if (ratio < cfg.collateralizationRatio)
            revert Vault__BelowCollateralizationRatio(ratio, cfg.collateralizationRatio);

        pUSD.mint(msg.sender, pUSDAmount);

        emit CollateralDeposited(msg.sender, collateral, collateralAmount);
        emit PUSDMinted(msg.sender, collateral, pUSDAmount);
    }

    // ── Core — burn pUSD ──────────────────────────────────────────────────────

    /**
     * @notice Burn pUSD to reduce your debt.
     *         Pass type(uint256).max to repay all outstanding debt.
     */
    function burnPUSD(address collateral, uint256 pUSDAmount) external nonReentrant {
        if (pUSDAmount == 0) revert Vault__ZeroAmount();
        _accrueStabilityFee(msg.sender, collateral);

        Vault storage v = vaults[msg.sender][collateral];
        uint256 burnAmt = pUSDAmount > v.debtAmount ? v.debtAmount : pUSDAmount;

        v.debtAmount                           -= burnAmt;
        collateralConfigs[collateral].totalDebt -= burnAmt;

        pUSD.burn(msg.sender, burnAmt);
        emit PUSDBurned(msg.sender, collateral, burnAmt);
    }

    // ── Core — withdraw collateral ────────────────────────────────────────────

    /**
     * @notice Withdraw collateral. Must remain above collateralisation ratio.
     */
    function withdrawCollateral(address collateral, uint256 amount) external nonReentrant {
        if (amount == 0) revert Vault__ZeroAmount();
        _accrueStabilityFee(msg.sender, collateral);

        Vault storage v = vaults[msg.sender][collateral];
        if (amount > v.collateralAmount) revert Vault__InsufficientCollateral();

        v.collateralAmount -= amount;

        // Check ratio still healthy (only if there's outstanding debt)
        if (v.debtAmount > 0) {
            uint256 ratio = _getCollateralisationRatio(msg.sender, collateral);
            CollateralConfig storage cfg = collateralConfigs[collateral];
            if (ratio < cfg.collateralizationRatio)
                revert Vault__BelowCollateralizationRatio(ratio, cfg.collateralizationRatio);
        }

        IERC20(collateral).safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, collateral, amount);
    }

    // ── Core — liquidate ──────────────────────────────────────────────────────

    /**
     * @notice Liquidate an undercollateralised vault.
     *
     *   Liquidator repays `debtToCover` pUSD and receives collateral worth
     *   (debtToCover * price / collateralPrice) * (1 + liquidationBonus).
     *
     * @param borrower    Vault owner to liquidate.
     * @param collateral  Collateral asset in the vault.
     * @param debtToCover Amount of pUSD to repay (capped at 50% of debt).
     */
    function liquidate(address borrower, address collateral, uint256 debtToCover)
        external nonReentrant
    {
        if (debtToCover == 0) revert Vault__ZeroAmount();

        _accrueStabilityFee(borrower, collateral);

        uint256 ratio = _getCollateralisationRatio(borrower, collateral);
        CollateralConfig storage cfg = collateralConfigs[collateral];

        if (ratio >= cfg.liquidationRatio)
            revert Vault__VaultIsSafe(borrower, collateral, ratio);

        Vault storage v = vaults[borrower][collateral];

        // Cap at 50% close factor
        uint256 maxRepay = v.debtAmount / 2;
        if (debtToCover > maxRepay) debtToCover = maxRepay;

        // Calculate collateral to seize (debtInUsd * (1 + bonus) / collateralPrice)
        uint256 debtUsd       = debtToCover; // pUSD is 1:1 with USD (WAD)
        uint256 collateralPrice = oracle.getPrice(collateral); // WAD
        uint8   collDecimals  = 18; // assume 18; should read from ERC20 in prod

        uint256 bonusFactor   = PRECISION + cfg.liquidationBonus;
        uint256 seizeUsd      = debtUsd.percentMul(bonusFactor);
        // collateralToSeize in token decimals
        uint256 collToSeize   = (seizeUsd * (10 ** collDecimals)) / collateralPrice;

        if (collToSeize > v.collateralAmount) collToSeize = v.collateralAmount;

        v.debtAmount                    -= debtToCover;
        v.collateralAmount              -= collToSeize;
        cfg.totalDebt                   -= debtToCover;

        // Liquidator repays pUSD
        pUSD.burn(msg.sender, debtToCover);

        // Liquidator receives collateral + bonus
        IERC20(collateral).safeTransfer(msg.sender, collToSeize);

        emit VaultLiquidated(borrower, msg.sender, collateral, debtToCover, collToSeize);
    }

    // ── View ──────────────────────────────────────────────────────────────────

    function getCollateralisationRatio(address user, address collateral)
        external view returns (uint256 ratioBps)
    {
        return _getCollateralisationRatio(user, collateral);
    }

    function getVault(address user, address collateral)
        external view returns (Vault memory)
    {
        return vaults[user][collateral];
    }

    function isLiquidatable(address user, address collateral) external view returns (bool) {
        uint256 ratio = _getCollateralisationRatio(user, collateral);
        return ratio < collateralConfigs[collateral].liquidationRatio;
    }

    function getPendingStabilityFee(address user, address collateral)
        external view returns (uint256 feeAmount)
    {
        Vault memory v = vaults[user][collateral];
        if (v.debtAmount == 0 || v.lastFeeTimestamp == 0) return 0;

        CollateralConfig memory cfg = collateralConfigs[collateral];
        uint256 elapsed = block.timestamp - v.lastFeeTimestamp;
        // fee = debt * (stabilityFeeBps / 10000) * (elapsed / SECONDS_PER_YEAR)
        return v.debtAmount * cfg.stabilityFeeBps * elapsed / PRECISION / SECONDS_PER_YEAR;
    }

    function getSupportedCollaterals() external view returns (address[] memory) {
        return supportedCollaterals;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _getCollateralisationRatio(address user, address collateral)
        internal view returns (uint256 ratioBps)
    {
        Vault memory v = vaults[user][collateral];
        if (v.debtAmount == 0)     return type(uint256).max;
        if (v.collateralAmount == 0) return 0;

        uint256 collateralPrice = oracle.getPrice(collateral); // WAD = price in USD
        // collateralUsd = collateralAmount * price / WAD (both in same decimal space)
        uint256 collateralUsd = (v.collateralAmount * collateralPrice) / WAD;
        // ratio in bps: (collUsd / debt) * 10000
        // pUSD has 18 decimals, collateralUsd has 18 decimals
        return (collateralUsd * PRECISION) / v.debtAmount;
    }

    function _accrueStabilityFee(address user, address collateral) internal {
        Vault storage v = vaults[user][collateral];
        if (v.debtAmount == 0 || v.lastFeeTimestamp == 0) {
            v.lastFeeTimestamp = block.timestamp;
            return;
        }

        CollateralConfig storage cfg = collateralConfigs[collateral];
        uint256 elapsed  = block.timestamp - v.lastFeeTimestamp;
        if (elapsed == 0) return;

        uint256 feeAmount = v.debtAmount * cfg.stabilityFeeBps * elapsed
            / PRECISION / SECONDS_PER_YEAR;

        v.lastFeeTimestamp = block.timestamp;

        if (feeAmount > 0) {
            // Add fee to vault's debt and mint to treasury
            v.debtAmount += feeAmount;
            cfg.totalDebt += feeAmount;
            pUSD.mint(treasury, feeAmount);
            emit StabilityFeePaid(user, collateral, feeAmount);
        }
    }

    function _requireActive(address collateral) internal view {
        if (!collateralConfigs[collateral].isActive)
            revert Vault__CollateralNotSupported(collateral);
    }
}
