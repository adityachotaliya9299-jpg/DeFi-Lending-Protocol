// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RevenueDistributor
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Epoch-based protocol revenue distribution to stakers/LPs/DAO
 *
 * Key design:
 * - Each epoch = EPOCH_DURATION seconds (default 1 week)
 * - Treasury pushes revenue into distributor each epoch
 * - Revenue split: stakers / LPs / DAO in configurable BPS
 * - Users claim proportional to their snapshot balance at epoch start
 * - Snapshots taken at epoch boundaries
 */
contract RevenueDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    uint256 public constant EPOCH_DURATION = 7 days;
    uint256 public constant BPS_TOTAL      = 10_000;

    error RevDist__ZeroAddress();
    error RevDist__ZeroAmount();
    error RevDist__SplitMustSum10000(uint256 got);
    error RevDist__EpochNotEnded();
    error RevDist__AlreadyClaimed(address user, uint256 epoch);
    error RevDist__NothingToClaim();

    event EpochFunded(uint256 indexed epoch, address token, uint256 amount);
    event RevenueClaimedStaker(address indexed user, uint256 indexed epoch, uint256 amount);
    event RevenueClaimedLP(address indexed user, uint256 indexed epoch, uint256 amount);
    event SplitUpdated(uint256 stakerBps, uint256 lpBps, uint256 daoBps);

    struct EpochData {
        uint256 startTime;
        uint256 totalRevenue;     // gross revenue for epoch
        uint256 stakerRevenue;    // portion for stakers
        uint256 lpRevenue;        // portion for LPs
        uint256 daoRevenue;       // portion for DAO
        uint256 totalStakerShares;
        uint256 totalLpShares;
        bool    finalized;
    }

    IERC20  public immutable revenueToken;
    address public           dao;
    uint256 public           stakerBps;
    uint256 public           lpBps;
    uint256 public           daoBps;

    uint256 public currentEpoch;
    uint256 public epochStartTime;

    mapping(uint256 => EpochData) public epochs;
    mapping(uint256 => mapping(address => uint256)) public stakerShares;
    mapping(uint256 => mapping(address => uint256)) public lpShares;
    mapping(uint256 => mapping(address => bool)) public stakerClaimed;
    mapping(uint256 => mapping(address => bool)) public lpClaimed;

    constructor(
        address admin,
        address _dao,
        address _revenueToken,
        uint256 _stakerBps,
        uint256 _lpBps,
        uint256 _daoBps
    ) {
        if (admin         == address(0)) revert RevDist__ZeroAddress();
        if (_dao          == address(0)) revert RevDist__ZeroAddress();
        if (_revenueToken == address(0)) revert RevDist__ZeroAddress();
        if (_stakerBps + _lpBps + _daoBps != BPS_TOTAL)
            revert RevDist__SplitMustSum10000(_stakerBps + _lpBps + _daoBps);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);

        dao          = _dao;
        revenueToken = IERC20(_revenueToken);
        stakerBps    = _stakerBps;
        lpBps        = _lpBps;
        daoBps       = _daoBps;

        epochStartTime = block.timestamp;
        currentEpoch   = 1;
        epochs[1].startTime = block.timestamp;
    }

    // =========================================================================
    //  Funding
    // =========================================================================

    function fundEpoch(uint256 amount) external onlyRole(TREASURY_ROLE) {
        if (amount == 0) revert RevDist__ZeroAmount();

        revenueToken.safeTransferFrom(msg.sender, address(this), amount);

        EpochData storage ep = epochs[currentEpoch];
        ep.totalRevenue  += amount;
        ep.stakerRevenue  = (ep.totalRevenue * stakerBps) / BPS_TOTAL;
        ep.lpRevenue      = (ep.totalRevenue * lpBps)     / BPS_TOTAL;
        ep.daoRevenue     = (ep.totalRevenue * daoBps)    / BPS_TOTAL;

        emit EpochFunded(currentEpoch, address(revenueToken), amount);
    }

    // =========================================================================
    //  Snapshot — record user shares at epoch boundary
    // =========================================================================

    function snapshotStaker(uint256 epoch, address user, uint256 shares)
        external onlyRole(ADMIN_ROLE)
    {
        stakerShares[epoch][user]       = shares;
        epochs[epoch].totalStakerShares += shares;
    }

    function snapshotLP(uint256 epoch, address user, uint256 shares)
        external onlyRole(ADMIN_ROLE)
    {
        lpShares[epoch][user]       = shares;
        epochs[epoch].totalLpShares += shares;
    }

    // =========================================================================
    //  Advance Epoch
    // =========================================================================

    function advanceEpoch() external {
        require(block.timestamp >= epochStartTime + EPOCH_DURATION, "epoch not ended");

        // Send DAO portion
        uint256 daoAmount = epochs[currentEpoch].daoRevenue;
        if (daoAmount > 0) {
            revenueToken.safeTransfer(dao, daoAmount);
        }

        epochs[currentEpoch].finalized = true;
        currentEpoch++;
        epochStartTime = block.timestamp;
        epochs[currentEpoch].startTime = block.timestamp;
    }

    // =========================================================================
    //  Claim
    // =========================================================================

    function claimStaker(uint256 epoch) external nonReentrant {
        if (!epochs[epoch].finalized) revert RevDist__EpochNotEnded();
        if (stakerClaimed[epoch][msg.sender]) revert RevDist__AlreadyClaimed(msg.sender, epoch);

        uint256 userShares = stakerShares[epoch][msg.sender];
        uint256 total      = epochs[epoch].totalStakerShares;
        if (userShares == 0 || total == 0) revert RevDist__NothingToClaim();

        uint256 claimable = (epochs[epoch].stakerRevenue * userShares) / total;
        stakerClaimed[epoch][msg.sender] = true;

        revenueToken.safeTransfer(msg.sender, claimable);
        emit RevenueClaimedStaker(msg.sender, epoch, claimable);
    }

    function claimLP(uint256 epoch) external nonReentrant {
        if (!epochs[epoch].finalized) revert RevDist__EpochNotEnded();
        if (lpClaimed[epoch][msg.sender]) revert RevDist__AlreadyClaimed(msg.sender, epoch);

        uint256 userShares = lpShares[epoch][msg.sender];
        uint256 total      = epochs[epoch].totalLpShares;
        if (userShares == 0 || total == 0) revert RevDist__NothingToClaim();

        uint256 claimable = (epochs[epoch].lpRevenue * userShares) / total;
        lpClaimed[epoch][msg.sender] = true;

        revenueToken.safeTransfer(msg.sender, claimable);
        emit RevenueClaimedLP(msg.sender, epoch, claimable);
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    function updateSplit(uint256 _stakerBps, uint256 _lpBps, uint256 _daoBps)
        external onlyRole(ADMIN_ROLE)
    {
        if (_stakerBps + _lpBps + _daoBps != BPS_TOTAL)
            revert RevDist__SplitMustSum10000(_stakerBps + _lpBps + _daoBps);
        stakerBps = _stakerBps;
        lpBps     = _lpBps;
        daoBps    = _daoBps;
        emit SplitUpdated(_stakerBps, _lpBps, _daoBps);
    }

    function getEpochData(uint256 epoch) external view returns (EpochData memory) {
        return epochs[epoch];
    }
}
