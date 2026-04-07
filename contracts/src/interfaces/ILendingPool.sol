// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  ILendingPool
 * @notice Main protocol interface — deposit, borrow, repay, withdraw, liquidate.
 */
interface ILendingPool {

    // ─── Structs ──────────────────────────────────────────────────────────────

    /**
     * @dev Per-asset reserve state.
     *      All indices start at RAY (1e27) and only increase.
     *      actual_deposit = scaledDeposit * liquidityIndex / RAY
     *      actual_debt    = scaledBorrow  * borrowIndex    / RAY
     */
    struct ReserveData {
        uint128 liquidityIndex;       // RAY — grows as depositors earn interest
        uint128 borrowIndex;          // RAY — grows as borrowers accrue debt
        uint256 totalScaledDeposits;  // sum of all (deposit / liquidityIndex)
        uint256 totalScaledBorrows;   // sum of all (borrow  / borrowIndex)
        uint40  lastUpdateTimestamp;
        address lTokenAddress;        // receipt token
        bool    isActive;
        bool    isBorrowEnabled;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event Deposit(address indexed asset, address indexed user, uint256 amount);
    event Withdraw(address indexed asset, address indexed user, uint256 amount);
    event Borrow(address indexed asset, address indexed user, uint256 amount);
    event Repay(address indexed asset, address indexed user, uint256 amount, address indexed repayer);
    event Liquidation(
        address indexed borrower,
        address indexed debtAsset,
        address indexed collateralAsset,
        uint256 debtRepaid,
        uint256 collateralSeized,
        address liquidator
    );
    event AssetInitialised(address indexed asset, address indexed lToken);
    event InterestAccrued(address indexed asset, uint256 liquidityIndex, uint256 borrowIndex);
    event ReservesCollected(address indexed asset, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error LendingPool__AssetNotSupported(address asset);
    error LendingPool__InsufficientLiquidity();
    error LendingPool__BorrowNotEnabled(address asset);
    error LendingPool__HealthFactorTooLow(uint256 hf);
    error LendingPool__HealthFactorOk(uint256 hf);
    error LendingPool__ZeroAmount();
    error LendingPool__ZeroAddress();
    error LendingPool__SameAsset();
    error LendingPool__InsufficientBalance();
    error LendingPool__Unauthorized();

    // ─── Core functions ───────────────────────────────────────────────────────

    function deposit(address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external returns (uint256 withdrawn);
    function borrow(address asset, uint256 amount) external;
     function CLOSE_FACTOR_BPS() external view returns (uint256);
    function repay(address asset, uint256 amount) external returns (uint256 repaid);
    function liquidate(
        address borrower,
        address debtAsset,
        address collateralAsset,
        uint256 debtAmount
    ) external;

    // ─── View functions ───────────────────────────────────────────────────────

    function getReserveData(address asset) external view returns (ReserveData memory);
    
    function getUserHealthFactor(address user) external view returns (uint256);
    function getUserAccountData(address user) external view returns (
        uint256 totalCollateralUsd,
        uint256 totalDebtUsd,
        uint256 healthFactor,
        uint256 availableBorrowUsd
    );
    function getUserScaledDeposit(address user, address asset) external view returns (uint256);
    function getUserScaledBorrow(address user, address asset) external view returns (uint256);
    function getUserDeposit(address user, address asset) external view returns (uint256);
    function getUserDebt(address user, address asset) external view returns (uint256);
}
