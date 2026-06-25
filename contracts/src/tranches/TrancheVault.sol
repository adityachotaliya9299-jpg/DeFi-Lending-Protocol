// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TrancheVault
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Senior/Junior tranche structure on pool yield
 *
 * Key design:
 * - Senior tranche: lower yield, first to be repaid, protected principal
 * - Junior tranche: higher yield, first-loss, absorbs bad debt
 * - Total yield split: senior gets targetSeniorYieldBps first, junior gets rest
 * - Junior acts as buffer: bad debt reduces junior principal before senior
 * - Each tranche issues ERC-20 tokens representing share of that tranche
 * - Epoch-based: yield distributed each epoch from pool interest
 */
contract TrancheVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant BPS_TOTAL = 10_000;
    uint256 public constant MAX_SENIOR_RATIO_BPS = 8_000; // max 80% of pool in senior

    error TrancheVault__ZeroAddress();
    error TrancheVault__ZeroAmount();
    error TrancheVault__ExceedsSeniorCap();
    error TrancheVault__InsufficientJuniorBuffer();
    error TrancheVault__InvalidSplit();

    event SeniorDeposit(address indexed user, uint256 amount, uint256 shares);
    event JuniorDeposit(address indexed user, uint256 amount, uint256 shares);
    event SeniorWithdraw(address indexed user, uint256 amount, uint256 shares);
    event JuniorWithdraw(address indexed user, uint256 amount, uint256 shares);
    event YieldDistributed(uint256 totalYield, uint256 seniorYield, uint256 juniorYield);
    event BadDebtAbsorbed(uint256 amount, uint256 juniorLoss, uint256 seniorLoss);

    IERC20 public immutable underlying;

    // Tranche tokens (ERC-20 shares)
    ERC20Token public immutable seniorToken;
    ERC20Token public immutable juniorToken;

    // TVL per tranche
    uint256 public seniorTVL;
    uint256 public juniorTVL;

    // Yield parameters
    uint256 public targetSeniorYieldBps; // senior gets this rate first
    uint256 public accruedYield;          // pending yield to distribute

    constructor(
        address admin,
        address _underlying,
        uint256 _targetSeniorYieldBps
    ) {
        if (admin == address(0) || _underlying == address(0))
            revert TrancheVault__ZeroAddress();
        require(_targetSeniorYieldBps <= BPS_TOTAL, "invalid rate");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        underlying            = IERC20(_underlying);
        targetSeniorYieldBps  = _targetSeniorYieldBps;

        seniorToken = new ERC20Token("LendFi Senior", "lfSENIOR");
        juniorToken = new ERC20Token("LendFi Junior", "lfJUNIOR");
    }

    // =========================================================================
    //  Deposit
    // =========================================================================

    function depositSenior(uint256 amount) external nonReentrant returns (uint256 shares) {
        if (amount == 0) revert TrancheVault__ZeroAmount();

        uint256 totalTVL = seniorTVL + juniorTVL;

        // Senior cap: senior can't exceed MAX_SENIOR_RATIO_BPS of total TVL
        if (totalTVL > 0) {
            uint256 newSeniorTVL = seniorTVL + amount;
            uint256 newTotal     = totalTVL + amount;
            if ((newSeniorTVL * BPS_TOTAL) / newTotal > MAX_SENIOR_RATIO_BPS)
                revert TrancheVault__ExceedsSeniorCap();
        }

        // Junior must be >= 20% of total (buffer requirement)
        // Only enforced when there is existing TVL
        if (totalTVL > 0 && juniorTVL == 0)
            revert TrancheVault__InsufficientJuniorBuffer();

        underlying.safeTransferFrom(msg.sender, address(this), amount);

        shares = _sharesForAmount(amount, seniorTVL, seniorToken.totalSupply());
        seniorTVL += amount;
        seniorToken.mint(msg.sender, shares);

        emit SeniorDeposit(msg.sender, amount, shares);
    }

    function depositJunior(uint256 amount) external nonReentrant returns (uint256 shares) {
        if (amount == 0) revert TrancheVault__ZeroAmount();

        underlying.safeTransferFrom(msg.sender, address(this), amount);

        shares = _sharesForAmount(amount, juniorTVL, juniorToken.totalSupply());
        juniorTVL += amount;
        juniorToken.mint(msg.sender, shares);

        emit JuniorDeposit(msg.sender, amount, shares);
    }

    // =========================================================================
    //  Withdraw
    // =========================================================================

    function withdrawSenior(uint256 shares) external nonReentrant returns (uint256 amount) {
        if (shares == 0) revert TrancheVault__ZeroAmount();
        require(seniorToken.balanceOf(msg.sender) >= shares, "insufficient shares");

        amount = _amountForShares(shares, seniorTVL, seniorToken.totalSupply());
        seniorTVL -= amount;
        seniorToken.burn(msg.sender, shares);

        underlying.safeTransfer(msg.sender, amount);
        emit SeniorWithdraw(msg.sender, amount, shares);
    }

    function withdrawJunior(uint256 shares) external nonReentrant returns (uint256 amount) {
        if (shares == 0) revert TrancheVault__ZeroAmount();
        require(juniorToken.balanceOf(msg.sender) >= shares, "insufficient shares");

        amount = _amountForShares(shares, juniorTVL, juniorToken.totalSupply());
        juniorTVL -= amount;
        juniorToken.burn(msg.sender, shares);

        underlying.safeTransfer(msg.sender, amount);
        emit JuniorWithdraw(msg.sender, amount, shares);
    }

    // =========================================================================
    //  Yield Distribution
    // =========================================================================

    /**
     * @notice Distribute yield: senior gets targetSeniorYieldBps first, junior gets rest
     * @param yieldAmount Total yield to distribute (transferred in before calling)
     */
    function distributeYield(uint256 yieldAmount) external onlyRole(ADMIN_ROLE) {
        if (yieldAmount == 0) revert TrancheVault__ZeroAmount();

        uint256 totalTVL = seniorTVL + juniorTVL;
        if (totalTVL == 0) return;

        // Senior allocation = min(totalYield, seniorTVL * targetRate)
        uint256 seniorAlloc = (seniorTVL * targetSeniorYieldBps) / BPS_TOTAL;
        if (seniorAlloc > yieldAmount) seniorAlloc = yieldAmount;
        uint256 juniorAlloc = yieldAmount - seniorAlloc;

        seniorTVL += seniorAlloc;
        juniorTVL += juniorAlloc;

        emit YieldDistributed(yieldAmount, seniorAlloc, juniorAlloc);
    }

    /**
     * @notice Absorb bad debt: junior absorbs first, then senior
     * @param badDebtAmount Amount of bad debt to socialise
     */
    function absorbBadDebt(uint256 badDebtAmount) external onlyRole(ADMIN_ROLE) {
        if (badDebtAmount == 0) revert TrancheVault__ZeroAmount();

        uint256 juniorLoss = 0;
        uint256 seniorLoss = 0;

        if (badDebtAmount <= juniorTVL) {
            juniorLoss  = badDebtAmount;
            juniorTVL  -= badDebtAmount;
        } else {
            juniorLoss  = juniorTVL;
            uint256 rem = badDebtAmount - juniorTVL;
            juniorTVL   = 0;
            seniorLoss  = rem <= seniorTVL ? rem : seniorTVL;
            seniorTVL  -= seniorLoss;
        }

        emit BadDebtAbsorbed(badDebtAmount, juniorLoss, seniorLoss);
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    function setTargetSeniorYield(uint256 bps) external onlyRole(ADMIN_ROLE) {
        require(bps <= BPS_TOTAL, "invalid rate");
        targetSeniorYieldBps = bps;
    }

    // =========================================================================
    //  View
    // =========================================================================

    function totalTVL() external view returns (uint256) {
        return seniorTVL + juniorTVL;
    }

    function seniorRatioBps() external view returns (uint256) {
        uint256 total = seniorTVL + juniorTVL;
        if (total == 0) return 0;
        return (seniorTVL * BPS_TOTAL) / total;
    }

    function getSeniorNAV() external view returns (uint256) {
        return seniorTVL;
    }

    function getJuniorNAV() external view returns (uint256) {
        return juniorTVL;
    }

    // =========================================================================
    //  Internal
    // =========================================================================

    function _sharesForAmount(uint256 amount, uint256 tvl, uint256 supply)
        internal pure returns (uint256)
    {
        if (supply == 0) return amount;
        return (amount * supply) / tvl;
    }

    function _amountForShares(uint256 shares, uint256 tvl, uint256 supply)
        internal pure returns (uint256)
    {
        if (supply == 0) return 0;
        return (shares * tvl) / supply;
    }
}

/**
 * @title ERC20Token
 * @dev Minimal mintable/burnable ERC-20 for tranche shares
 */
contract ERC20Token is ERC20 {
    address public immutable vault;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        vault = msg.sender;
    }

    modifier onlyVault() {
        require(msg.sender == vault, "only vault");
        _;
    }

    function mint(address to, uint256 amount) external onlyVault { _mint(to, amount); }
    function burn(address from, uint256 amount) external onlyVault { _burn(from, amount); }
}
