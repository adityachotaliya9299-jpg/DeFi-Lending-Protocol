// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IRSwap
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Interest Rate Swap — exchange variable rate debt for fixed rate
 *
 * Key design:
 * - Payer leg: user pays fixed rate to protocol
 * - Receiver leg: protocol pays variable rate to user
 * - Net settlement: only difference changes hands (cash settled)
 * - Notional: the underlying debt amount being hedged
 * - Maturity: swap expires, net payment made
 * - Fixed rate locked at swap open, variable rate read at maturity
 * - Collateral posted to cover worst-case settlement
 */
contract IRSwap is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant BPS_TOTAL        = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant MAX_DURATION     = 365 days;
    uint256 public constant MIN_DURATION     = 7 days;
    uint256 public constant COLLATERAL_BPS   = 500; // 5% collateral buffer

    error IRSwap__ZeroAddress();
    error IRSwap__ZeroAmount();
    error IRSwap__InvalidDuration(uint256 min, uint256 max);
    error IRSwap__SwapNotFound(uint256 id);
    error IRSwap__SwapNotMatured(uint256 maturity, uint256 current);
    error IRSwap__SwapAlreadySettled(uint256 id);
    error IRSwap__InsufficientCollateral();
    error IRSwap__NotSwapOwner(address caller, address owner);

    event SwapOpened(
        uint256 indexed id,
        address indexed user,
        address asset,
        uint256 notional,
        uint256 fixedRateBps,
        uint256 maturity
    );
    event SwapSettled(
        uint256 indexed id,
        address indexed user,
        uint256 fixedPayment,
        uint256 variablePayment,
        int256  netPayment,
        bool    userReceives
    );
    event SwapCancelled(uint256 indexed id);

    struct Swap {
        address user;
        address asset;
        uint256 notional;
        uint256 fixedRateBps;    // annual fixed rate in BPS
        uint256 variableRateAtOpen; // variable rate at open (BPS)
        uint256 openTime;
        uint256 maturity;
        uint256 collateralPosted;
        bool    settled;
        bool    exists;
    }

    uint256 public swapCount;
    mapping(uint256 => Swap) public swaps;

    // asset → current variable rate BPS (updated by oracle/admin)
    mapping(address => uint256) public variableRates;

    address public immutable settlementToken;

    constructor(address admin, address _settlementToken) {
        if (admin == address(0) || _settlementToken == address(0))
            revert IRSwap__ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        settlementToken = _settlementToken;
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    function setVariableRate(address asset, uint256 rateBps)
        external onlyRole(ADMIN_ROLE)
    {
        variableRates[asset] = rateBps;
    }

    // =========================================================================
    //  Open Swap
    // =========================================================================

    /**
     * @notice Open an interest rate swap
     * @param asset        The asset whose rate is being swapped
     * @param notional     Debt amount being hedged
     * @param fixedRateBps Annual fixed rate user agrees to pay (BPS)
     * @param duration     Swap duration in seconds
     */
    function openSwap(
        address asset,
        uint256 notional,
        uint256 fixedRateBps,
        uint256 duration
    ) external nonReentrant returns (uint256 swapId) {
        if (asset == address(0))       revert IRSwap__ZeroAddress();
        if (notional == 0)             revert IRSwap__ZeroAmount();
        if (duration < MIN_DURATION || duration > MAX_DURATION)
            revert IRSwap__InvalidDuration(MIN_DURATION, MAX_DURATION);

        // Collateral = notional * COLLATERAL_BPS / BPS_TOTAL
        uint256 collateral = (notional * COLLATERAL_BPS) / BPS_TOTAL;
        IERC20(settlementToken).safeTransferFrom(msg.sender, address(this), collateral);

        swapId = ++swapCount;
        swaps[swapId] = Swap({
            user:               msg.sender,
            asset:              asset,
            notional:           notional,
            fixedRateBps:       fixedRateBps,
            variableRateAtOpen: variableRates[asset],
            openTime:           block.timestamp,
            maturity:           block.timestamp + duration,
            collateralPosted:   collateral,
            settled:            false,
            exists:             true
        });

        emit SwapOpened(swapId, msg.sender, asset, notional, fixedRateBps, block.timestamp + duration);
    }

    // =========================================================================
    //  Settle Swap
    // =========================================================================

    /**
     * @notice Settle a matured swap — net cash payment made
     * @dev fixedPayment = notional * fixedRate * duration / year
     *      variablePayment = notional * variableRate * duration / year
     *      if variable > fixed: user receives (variable - fixed)
     *      if fixed > variable: user pays (fixed - variable)
     */
    function settleSwap(uint256 swapId) external nonReentrant {
        Swap storage s = swaps[swapId];
        if (!s.exists)           revert IRSwap__SwapNotFound(swapId);
        if (s.settled)            revert IRSwap__SwapAlreadySettled(swapId);
        if (block.timestamp < s.maturity)
            revert IRSwap__SwapNotMatured(s.maturity, block.timestamp);

        s.settled = true;

        uint256 duration = s.maturity - s.openTime;

        // Annual payments prorated to duration
        uint256 fixedPayment    = (s.notional * s.fixedRateBps * duration) /
                                   (BPS_TOTAL * SECONDS_PER_YEAR);
        uint256 variablePayment = (s.notional * variableRates[s.asset] * duration) /
                                   (BPS_TOTAL * SECONDS_PER_YEAR);

        // Return collateral
        uint256 col = s.collateralPosted;

        if (variablePayment > fixedPayment) {
            // Protocol pays user: net = variable - fixed
            uint256 netToUser = variablePayment - fixedPayment;
            // Return collateral + net payment to user
            uint256 totalReturn = col + netToUser;
            IERC20(settlementToken).safeTransfer(s.user, totalReturn);
            emit SwapSettled(swapId, s.user, fixedPayment, variablePayment,
                int256(netToUser), true);
        } else {
            // User pays protocol: net = fixed - variable (taken from collateral)
            uint256 netFromUser = fixedPayment - variablePayment;
            uint256 returnToUser = col > netFromUser ? col - netFromUser : 0;
            if (returnToUser > 0) {
                IERC20(settlementToken).safeTransfer(s.user, returnToUser);
            }
            emit SwapSettled(swapId, s.user, fixedPayment, variablePayment,
                -int256(netFromUser), false);
        }
    }

    // =========================================================================
    //  View
    // =========================================================================

    function getSwap(uint256 id) external view returns (Swap memory) {
        return swaps[id];
    }

    function previewSettlement(uint256 swapId)
        external view
        returns (uint256 fixedPayment, uint256 variablePayment, int256 netPayment)
    {
        Swap storage s = swaps[swapId];
        if (!s.exists) revert IRSwap__SwapNotFound(swapId);

        uint256 duration = s.maturity - s.openTime;
        fixedPayment    = (s.notional * s.fixedRateBps * duration) /
                           (BPS_TOTAL * SECONDS_PER_YEAR);
        variablePayment = (s.notional * variableRates[s.asset] * duration) /
                           (BPS_TOTAL * SECONDS_PER_YEAR);
        netPayment = int256(variablePayment) - int256(fixedPayment);
    }

    function isMatured(uint256 swapId) external view returns (bool) {
        return swaps[swapId].exists && block.timestamp >= swaps[swapId].maturity;
    }
}
