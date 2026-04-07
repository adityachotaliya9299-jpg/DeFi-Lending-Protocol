// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

/**
 * @title  MockChainlinkFeed
 * @notice Test double for a Chainlink AggregatorV3Interface.
 *         Allows test contracts to set price, roundId, and updatedAt
 *         to exercise every code path in PriceOracle.
 */
contract MockChainlinkFeed is AggregatorV3Interface {
    uint8   public override decimals = 8;
    string  public override description = "MOCK / USD";

    uint80  public mockRoundId        = 1;
    int256  public mockAnswer         = 2_000e8;    // $2,000 in 8-dec
    uint256 public mockStartedAt      = block.timestamp;
    uint256 public mockUpdatedAt      = block.timestamp;
    uint80  public mockAnsweredInRound = 1;

    // ─── Setters ─────────────────────────────────────────────────────────────

    function setPrice(int256 price) external {
        mockAnswer = price;
    }

    function setUpdatedAt(uint256 ts) external {
        mockUpdatedAt = ts;
    }

    function setRoundId(uint80 roundId_) external {
        mockRoundId = roundId_;
    }

    function setAnsweredInRound(uint80 answeredInRound_) external {
        mockAnsweredInRound = answeredInRound_;
    }

    /// @dev Simulate a stale feed: push updatedAt into the past.
    function makeStale(uint256 staleness) external {
        mockUpdatedAt = block.timestamp - staleness;
    }

    /// @dev Simulate a circuit-breaker / invalid price.
    function makeNegative() external {
        mockAnswer = -1;
    }

    /// @dev Simulate an incomplete round.
    function makeIncompleteRound() external {
        mockAnsweredInRound = mockRoundId - 1;
    }

    // ─── AggregatorV3Interface ────────────────────────────────────────────────

    function latestRoundData()
        external
        view
        override
        returns (
            uint80  roundId,
            int256  answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80  answeredInRound
        )
    {
        return (
            mockRoundId,
            mockAnswer,
            mockStartedAt,
            mockUpdatedAt,
            mockAnsweredInRound
        );
    }
}
