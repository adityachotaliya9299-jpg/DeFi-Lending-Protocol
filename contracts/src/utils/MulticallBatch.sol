// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MulticallBatch
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Batch multiple protocol calls into one transaction
 *
 * Key design:
 * - Execute N calls to any target in one tx
 * - Optional: revert-on-failure or continue-on-failure mode
 * - Aggregate results returned as array
 * - Self-call for gas-efficient view batching
 * - Useful for: approve+deposit, approve+repay, multi-asset health checks
 */
contract MulticallBatch {
    error Multicall__CallFailed(uint256 index, bytes reason);
    error Multicall__ZeroTargets();

    event BatchExecuted(uint256 callCount, uint256 successCount);

    struct Call {
        address target;
        bytes data;
        uint256 value; // ETH value if any
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    /**
     * @notice Execute batch — reverts on first failure
     * @param calls Array of (target, data, value) tuples
     */
    function executeBatch(
        Call[] calldata calls
    ) external payable returns (Result[] memory results) {
        if (calls.length == 0) revert Multicall__ZeroTargets();

        results = new Result[](calls.length);

        for (uint256 i; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].target.call{
                value: calls[i].value
            }(calls[i].data);
            if (!ok) revert Multicall__CallFailed(i, ret);
            results[i] = Result({success: true, returnData: ret});
        }

        emit BatchExecuted(calls.length, calls.length);
    }

    /**
     * @notice Execute batch — continues on failure, returns per-call results
     * @param calls Array of (target, data, value) tuples
     */
    function tryExecuteBatch(
        Call[] calldata calls
    ) external payable returns (Result[] memory results) {
        if (calls.length == 0) revert Multicall__ZeroTargets();

        results = new Result[](calls.length);
        uint256 successCount;

        for (uint256 i; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].target.call{
                value: calls[i].value
            }(calls[i].data);
            results[i] = Result({success: ok, returnData: ret});
            if (ok) successCount++;
        }

        emit BatchExecuted(calls.length, successCount);
    }

    /**
     * @notice Aggregate view calls (staticcall only, no state changes)
     * @param calls Array of (target, data, 0) — value ignored
     */
    function aggregateStatic(
        Call[] calldata calls
    ) external view returns (Result[] memory results) {
        results = new Result[](calls.length);

        for (uint256 i; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].target.staticcall(
                calls[i].data
            );
            results[i] = Result({success: ok, returnData: ret});
        }
    }

    /**
     * @notice Get current block info for off-chain sync
     */
    function getBlockInfo()
        external
        view
        returns (uint256 blockNumber, uint256 blockTimestamp, uint256 chainId)
    {
        blockNumber = block.number;
        blockTimestamp = block.timestamp;
        chainId = block.chainid;
    }

    receive() external payable {}
}
