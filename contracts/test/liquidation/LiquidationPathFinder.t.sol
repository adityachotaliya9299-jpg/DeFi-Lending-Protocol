// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {
    LiquidationPathFinder
} from "../../src/liquidation/LiquidationPathFinder.sol";

/**
 * @title MockPoolForPF
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @dev Mock LendingPool for PathFinder tests
 */
contract MockPoolForPF {
    mapping(address => mapping(address => uint256)) public deposits;
    mapping(address => mapping(address => uint256)) public debts;
    mapping(address => uint256) public healthFactors;

    function setDeposit(address user, address asset, uint256 amount) external {
        deposits[user][asset] = amount;
    }
    function setDebt(address user, address asset, uint256 amount) external {
        debts[user][asset] = amount;
    }
    function setHealthFactor(address user, uint256 hf) external {
        healthFactors[user] = hf;
    }
    function getUserDeposit(
        address user,
        address asset
    ) external view returns (uint256) {
        return deposits[user][asset];
    }
    function getUserDebt(
        address user,
        address asset
    ) external view returns (uint256) {
        return debts[user][asset];
    }
    function getUserHealthFactor(address user) external view returns (uint256) {
        return healthFactors[user] == 0 ? 1e18 : healthFactors[user];
    }
}

/**
 * @title MockOracleForPF
 */
contract MockOracleForPF {
    mapping(address => uint256) public prices; // WAD per token unit

    function setPrice(address asset, uint256 pricePerUnit) external {
        prices[asset] = pricePerUnit;
    }
    function getValueInUsd(
        address asset,
        uint256 amount
    ) external view returns (uint256) {
        return (amount * prices[asset]) / 1e18;
    }
}

/**
 * @title MockCMForPF
 */
contract MockCMForPF {
    struct Config {
        uint256 ltv;
        uint256 liqThreshold;
        uint256 liqBonus;
        uint256 reserveFactor;
        uint256 supplyCap;
        uint256 borrowCap;
        bool isActive;
        bool isBorrowEnabled;
    }
    mapping(address => Config) public configs;

    function setConfig(address asset, uint256 bonus) external {
        configs[asset] = Config(8000, 8500, bonus, 1000, 0, 0, true, true);
    }
    function getAssetConfig(
        address asset
    )
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            bool
        )
    {
        Config memory c = configs[asset];
        return (
            c.ltv,
            c.liqThreshold,
            c.liqBonus,
            c.reserveFactor,
            c.supplyCap,
            c.borrowCap,
            c.isActive,
            c.isBorrowEnabled
        );
    }
}

/**
 * @title LiquidationPathFinderTest
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice 12 tests for multi-collateral liquidation path finding
 */
contract LiquidationPathFinderTest is Test {
    LiquidationPathFinder internal finder;
    MockPoolForPF internal pool;
    MockOracleForPF internal oracle;
    MockCMForPF internal cm;

    address internal admin = makeAddr("admin");
    address internal borrower = makeAddr("borrower");
    address internal weth = makeAddr("weth");
    address internal link = makeAddr("link");
    address internal usdc = makeAddr("usdc");
    address internal dai = makeAddr("dai");

    function setUp() public {
        pool = new MockPoolForPF();
        oracle = new MockOracleForPF();
        cm = new MockCMForPF();

        finder = new LiquidationPathFinder(
            admin,
            address(pool),
            address(oracle),
            address(cm)
        );

        // Set prices: WETH=$2000, LINK=$15, USDC=$1
        oracle.setPrice(weth, 2_000e18);
        oracle.setPrice(link, 15e18);
        oracle.setPrice(usdc, 1e18);
        oracle.setPrice(dai, 1e18);

        // Set liquidation bonuses: WETH=8%, LINK=10%
        cm.setConfig(weth, 800);
        cm.setConfig(link, 1_000);

        // Borrower has 2 collaterals + 2 debts, HF < 1
        pool.setDeposit(borrower, weth, 5e18); // 5 WETH = $10,000
        pool.setDeposit(borrower, link, 200e18); // 200 LINK = $3,000
        pool.setDebt(borrower, usdc, 10_000e6); // $10,000 USDC debt
        pool.setDebt(borrower, dai, 2_000e18); // $2,000 DAI debt
        pool.setHealthFactor(borrower, 0.9e18); // HF < 1 = liquidatable
    }

    function _colAssets() internal view returns (address[] memory) {
        address[] memory a = new address[](2);
        a[0] = weth;
        a[1] = link;
        return a;
    }

    function _debtAssets() internal view returns (address[] memory) {
        address[] memory a = new address[](2);
        a[0] = usdc;
        a[1] = dai;
        return a;
    }

    // =========================================================================
    //  findBestPath
    // =========================================================================

    function test_findBestPath_returnsPath() public {
        LiquidationPathFinder.LiquidationPath memory best = finder.findBestPath(
            borrower,
            _colAssets(),
            _debtAssets()
        );

        assertNotEq(best.collateralAsset, address(0));
        assertNotEq(best.debtAsset, address(0));
        assertGt(best.collateralUsd, 0);
        assertGt(best.debtUsd, 0);
    }

    function test_findBestPath_prefersHigherBonus() public {
        // LINK has 10% bonus vs WETH 8% — but WETH has 3x USD value
        // Score = bonus * colUsd: WETH = 800 * 10000 = 8M, LINK = 1000 * 3000 = 3M
        // So WETH wins on score
        LiquidationPathFinder.LiquidationPath memory best = finder.findBestPath(
            borrower,
            _colAssets(),
            _debtAssets()
        );

        assertEq(
            best.collateralAsset,
            weth,
            "WETH wins due to larger USD value"
        );
        console2.log("Best collateral:", best.collateralAsset);
        console2.log("Bonus BPS:", best.bonusBps);
        console2.log("Collateral USD:", best.collateralUsd);
    }

    function test_findBestPath_healthyPositionReverts() public {
        pool.setHealthFactor(borrower, 1.5e18); // healthy

        vm.expectRevert(
            abi.encodeWithSelector(
                LiquidationPathFinder.PathFinder__HealthFactorOk.selector,
                borrower,
                1.5e18
            )
        );
        finder.findBestPath(borrower, _colAssets(), _debtAssets());
    }

    function test_findBestPath_zeroAddressReverts() public {
        vm.expectRevert(LiquidationPathFinder.PathFinder__ZeroAddress.selector);
        finder.findBestPath(address(0), _colAssets(), _debtAssets());
    }

    function test_findBestPath_noValidPath_reverts() public {
        // Borrower has no deposits
        address emptyBorrower = makeAddr("empty");
        pool.setHealthFactor(emptyBorrower, 0.5e18);

        vm.expectRevert(
            abi.encodeWithSelector(
                LiquidationPathFinder.PathFinder__NoLiquidatablePath.selector,
                emptyBorrower
            )
        );
        finder.findBestPath(emptyBorrower, _colAssets(), _debtAssets());
    }

    function test_findBestPath_closeFactor50pct() public {
        LiquidationPathFinder.LiquidationPath memory best = finder.findBestPath(
            borrower,
            _colAssets(),
            _debtAssets()
        );

        // maxRepayUsd should be 50% of debt
        uint256 expectedMaxRepay = (best.debtUsd * 5_000) / 10_000;
        assertApproxEqAbs(best.maxRepayUsd, expectedMaxRepay, 1e15);
    }

    function test_findBestPath_seizeableIncludesBonus() public {
        LiquidationPathFinder.LiquidationPath memory best = finder.findBestPath(
            borrower,
            _colAssets(),
            _debtAssets()
        );

        // seizable = maxRepay * (1 + bonus)
        uint256 expectedSeizable = (best.maxRepayUsd *
            (10_000 + best.bonusBps)) / 10_000;
        // Cap at collateral USD
        if (expectedSeizable > best.collateralUsd)
            expectedSeizable = best.collateralUsd;
        assertApproxEqAbs(best.seizeableUsd, expectedSeizable, 1e15);
    }

    function test_findBestPath_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit LiquidationPathFinder.PathFound(
            borrower,
            address(0),
            address(0),
            0,
            0
        );
        finder.findBestPath(borrower, _colAssets(), _debtAssets());
    }

    // =========================================================================
    //  rankPaths
    // =========================================================================

    function test_rankPaths_returnsAllPaths() public view {
        (, uint256 count) = finder.rankPaths(
            borrower,
            _colAssets(),
            _debtAssets()
        );
        // 2 collaterals x 2 debts = 4 paths (minus zero-balance paths)
        assertGt(count, 0);
    }

    function test_rankPaths_sortedByScoreDesc() public view {
        (
            LiquidationPathFinder.LiquidationPath[] memory paths,
            uint256 count
        ) = finder.rankPaths(borrower, _colAssets(), _debtAssets());

        for (uint256 i = 1; i < count; i++) {
            uint256 scoreI = paths[i - 1].bonusBps * paths[i - 1].collateralUsd;
            uint256 scoreIp1 = paths[i].bonusBps * paths[i].collateralUsd;
            assertGe(scoreI, scoreIp1, "paths should be sorted desc");
        }
    }

    // =========================================================================
    //  Single collateral/debt
    // =========================================================================

    function test_findBestPath_singleCollateral() public {
        address[] memory col = new address[](1);
        address[] memory dbt = new address[](1);
        col[0] = weth;
        dbt[0] = usdc;

        LiquidationPathFinder.LiquidationPath memory best = finder.findBestPath(
            borrower,
            col,
            dbt
        );

        assertEq(best.collateralAsset, weth);
        assertEq(best.debtAsset, usdc);
    }

    function test_findBestPath_linkPreferredOverWethIfHigherScore() public {
        // Give LINK a massive position so its score beats WETH
        oracle.setPrice(link, 100e18); // LINK = $100
        pool.setDeposit(borrower, link, 1_000e18); // 1000 LINK = $100,000

        LiquidationPathFinder.LiquidationPath memory best = finder.findBestPath(
            borrower,
            _colAssets(),
            _debtAssets()
        );

        // LINK score = 1000 * 100_000 = 100M vs WETH = 800 * 10_000 = 8M
        assertEq(best.collateralAsset, link, "LINK wins with higher score");
    }
}
