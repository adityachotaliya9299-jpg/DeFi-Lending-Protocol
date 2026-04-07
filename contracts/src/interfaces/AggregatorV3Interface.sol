// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  AggregatorV3Interface
 * @notice Minimal Chainlink price feed interface.
 * @dev    Full interface: https://github.com/smartcontractkit/chainlink/blob/develop/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol
 *         We only declare the functions we actually call to keep the
 *         dependency surface minimal and avoid importing the full Chainlink package.
 */
interface AggregatorV3Interface {
    /// @notice Returns the number of decimals the feed uses.
    /// @dev    Most USD feeds return 8 decimals.
    function decimals() external view returns (uint8);

    /// @notice Human-readable description of the feed (e.g. "ETH / USD").
    function description() external view returns (string memory);

    /**
     * @notice Returns the latest round data from the feed.
     * @return roundId       The round ID — monotonically increasing per feed.
     * @return answer        The price with `decimals()` decimal places.
     * @return startedAt     Timestamp when this round started.
     * @return updatedAt     Timestamp when this round was last updated.
     *                       Used for staleness checks.
     * @return answeredInRound The round in which the answer was computed.
     *                        If answeredInRound < roundId the answer is stale.
     */
    function latestRoundData()
        external
        view
        returns (
            uint80  roundId,
            int256  answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80  answeredInRound
        );
}
