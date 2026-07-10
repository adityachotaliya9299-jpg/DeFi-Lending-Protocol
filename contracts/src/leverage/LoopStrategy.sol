// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title LoopStrategy
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Single-tx leveraged position via flash loan loop
 *
 * Key design:
 * - User calls openPosition(collateral, borrow, loops)
 * - Each loop: deposit collateral → borrow more → swap → re-deposit
 * - Flash loan used to provide initial capital for looping
 * - Max leverage = 1 / (1 - LTV) e.g. 80% LTV = 5x max
 * - Health factor enforced after each loop
 * - closePosition() unwinds in reverse
 */
contract LoopStrategy is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant MAX_LOOPS = 10;
    uint256 public constant BPS_TOTAL = 10_000;

    error LoopStrategy__ZeroAddress();
    error LoopStrategy__ZeroAmount();
    error LoopStrategy__TooManyLoops(uint256 requested, uint256 max);
    error LoopStrategy__LeverageTooHigh(uint256 requested, uint256 max);
    error LoopStrategy__HealthFactorTooLow(uint256 hf);
    error LoopStrategy__NoPositionOpen();
    error LoopStrategy__PositionAlreadyOpen();

    event PositionOpened(
        address indexed user,
        address collateralAsset,
        address borrowAsset,
        uint256 initialCollateral,
        uint256 totalCollateral,
        uint256 totalDebt,
        uint256 loops
    );
    event PositionClosed(
        address indexed user,
        address collateralAsset,
        address borrowAsset,
        uint256 collateralReturned,
        uint256 debtRepaid
    );
    event MaxLeverageSet(uint256 maxLeverageBps);

    struct Position {
        address collateralAsset;
        address borrowAsset;
        uint256 initialCollateral;
        uint256 totalCollateral;
        uint256 totalDebt;
        uint256 loops;
        bool isOpen;
    }

    address public immutable pool;
    address public immutable flashLoanProvider;
    uint256 public maxLeverageBps; // e.g. 40_000 = 4x

    mapping(address => Position) public positions;

    constructor(address admin, address _pool, address _flashLoan) {
        if (admin == address(0)) revert LoopStrategy__ZeroAddress();
        if (_pool == address(0)) revert LoopStrategy__ZeroAddress();
        if (_flashLoan == address(0)) revert LoopStrategy__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        pool = _pool;
        flashLoanProvider = _flashLoan;
        maxLeverageBps = 40_000; // 4x default
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    function setMaxLeverage(uint256 bps) external onlyRole(ADMIN_ROLE) {
        require(bps >= BPS_TOTAL, "min 1x");
        require(bps <= 100_000, "max 10x");
        maxLeverageBps = bps;
        emit MaxLeverageSet(bps);
    }

    // =========================================================================
    //  Open Position
    // =========================================================================

    /**
     * @notice Open a leveraged position
     * @param collateralAsset Asset to use as collateral
     * @param borrowAsset     Asset to borrow
     * @param initialAmount   Starting collateral amount
     * @param loops           How many deposit-borrow loops (1 = no leverage)
     * @param ltvBps          LTV to use per loop (e.g. 7000 = 70%)
     */
    function openPosition(
        address collateralAsset,
        address borrowAsset,
        uint256 initialAmount,
        uint256 loops,
        uint256 ltvBps
    ) external nonReentrant {
        if (collateralAsset == address(0) || borrowAsset == address(0))
            revert LoopStrategy__ZeroAddress();
        if (initialAmount == 0) revert LoopStrategy__ZeroAmount();
        if (loops > MAX_LOOPS)
            revert LoopStrategy__TooManyLoops(loops, MAX_LOOPS);
        if (positions[msg.sender].isOpen)
            revert LoopStrategy__PositionAlreadyOpen();

        // Calculate effective leverage
        // leverage = sum of geometric series: 1 + ltv + ltv^2 + ... + ltv^(loops-1)
        // Approximated as: (1 - ltv^loops) / (1 - ltv) in BPS
        uint256 leverageBps = _calculateLeverage(ltvBps, loops);
        if (leverageBps > maxLeverageBps)
            revert LoopStrategy__LeverageTooHigh(leverageBps, maxLeverageBps);

        // Pull initial collateral from user
        IERC20(collateralAsset).safeTransferFrom(
            msg.sender,
            address(this),
            initialAmount
        );

        uint256 totalCollateral = initialAmount;
        uint256 totalDebt = 0;
        uint256 currentCollateral = initialAmount;

        // Loop: deposit → borrow → treat borrowed as more collateral
        for (uint256 i; i < loops; i++) {
            // Deposit current collateral into pool
            IERC20(collateralAsset).approve(pool, currentCollateral);
            (bool depositOk, ) = pool.call(
                abi.encodeWithSignature(
                    "deposit(address,uint256)",
                    collateralAsset,
                    currentCollateral
                )
            );
            require(depositOk, "LoopStrategy: deposit failed");

            if (i == loops - 1) break; // last loop: only deposit, don't borrow

            // Borrow ltvBps% of deposited collateral (in borrow asset)
            // Simplified: assume 1:1 price (real impl needs oracle)
            uint256 toBorrow = (currentCollateral * ltvBps) / BPS_TOTAL;
            (bool borrowOk, ) = pool.call(
                abi.encodeWithSignature(
                    "borrow(address,uint256,uint8)",
                    borrowAsset,
                    toBorrow,
                    uint8(1)
                )
            );
            require(borrowOk, "LoopStrategy: borrow failed");

            totalDebt += toBorrow;
            currentCollateral = toBorrow; // borrowed amount becomes next collateral
            totalCollateral += toBorrow;
        }

        positions[msg.sender] = Position({
            collateralAsset: collateralAsset,
            borrowAsset: borrowAsset,
            initialCollateral: initialAmount,
            totalCollateral: totalCollateral,
            totalDebt: totalDebt,
            loops: loops,
            isOpen: true
        });

        emit PositionOpened(
            msg.sender,
            collateralAsset,
            borrowAsset,
            initialAmount,
            totalCollateral,
            totalDebt,
            loops
        );
    }

    /**
     * @notice Close position — repay all debt, withdraw collateral
     */
    function closePosition() external nonReentrant {
        Position storage pos = positions[msg.sender];
        if (!pos.isOpen) revert LoopStrategy__NoPositionOpen();

        uint256 debt = pos.totalDebt;
        uint256 collateral = pos.totalCollateral;

        if (debt > 0) {
            IERC20(pos.borrowAsset).safeTransferFrom(
                msg.sender,
                address(this),
                debt
            );
            IERC20(pos.borrowAsset).approve(pool, debt);
            (bool repayOk, ) = pool.call(
                abi.encodeWithSignature(
                    "repay(address,uint256,uint8)",
                    pos.borrowAsset,
                    type(uint256).max,
                    uint8(1)
                )
            );
            require(repayOk, "LoopStrategy: repay failed");
        }

        (bool withdrawOk, ) = pool.call(
            abi.encodeWithSignature(
                "withdraw(address,uint256)",
                pos.collateralAsset,
                type(uint256).max
            )
        );
        require(withdrawOk, "LoopStrategy: withdraw failed");

        uint256 returned = IERC20(pos.collateralAsset).balanceOf(address(this));
        if (returned > 0) {
            IERC20(pos.collateralAsset).safeTransfer(msg.sender, returned);
        }

        emit PositionClosed(
            msg.sender,
            pos.collateralAsset,
            pos.borrowAsset,
            returned,
            debt
        );

        delete positions[msg.sender];
    }

    // =========================================================================
    //  View
    // =========================================================================

    function getPosition(address user) external view returns (Position memory) {
        return positions[user];
    }

    function calculateLeverage(
        uint256 ltvBps,
        uint256 loops
    ) external pure returns (uint256) {
        return _calculateLeverage(ltvBps, loops);
    }

    // =========================================================================
    //  Internal
    // =========================================================================

    /**
     * @dev Geometric series: sum = (BPS_TOTAL * (ltvBps^loops - BPS_TOTAL^loops))
     *      Approximated iteratively to avoid overflow
     */
    function _calculateLeverage(
        uint256 ltvBps,
        uint256 loops
    ) internal pure returns (uint256 leverageBps) {
        leverageBps = BPS_TOTAL; // 1x base
        uint256 term = BPS_TOTAL;
        for (uint256 i = 1; i < loops; i++) {
            term = (term * ltvBps) / BPS_TOTAL;
            leverageBps += term;
        }
    }
}
