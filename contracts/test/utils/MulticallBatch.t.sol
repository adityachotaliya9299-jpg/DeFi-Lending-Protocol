// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {MulticallBatch} from "../../src/utils/MulticallBatch.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/**
 * @title MulticallBatchTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 10 tests for multicall batch utility
 */
contract MulticallBatchTest is Test {

    MulticallBatch internal mc;
    MockERC20      internal tokenA;
    MockERC20      internal tokenB;

    address internal alice = makeAddr("alice");

    function setUp() public {
        mc     = new MulticallBatch();
        tokenA = new MockERC20("Token A", "TKA", 18);
        tokenB = new MockERC20("Token B", "TKB", 18);

        tokenA.mint(alice, 1_000e18);
        tokenB.mint(alice, 1_000e18);
    }

    function _call(address target, bytes memory data) internal pure
        returns (MulticallBatch.Call memory)
    {
        return MulticallBatch.Call({target: target, data: data, value: 0});
    }

    // =========================================================================
    //  executeBatch
    // =========================================================================

    function test_executeBatch_singleCall() public {
        MulticallBatch.Call[] memory calls = new MulticallBatch.Call[](1);
        calls[0] = _call(
            address(tokenA),
            abi.encodeWithSignature("totalSupply()")
        );

        MulticallBatch.Result[] memory results = mc.executeBatch(calls);
        assertEq(results.length, 1);
        assertTrue(results[0].success);
    }

    function test_executeBatch_multipleCalls() public {
        MulticallBatch.Call[] memory calls = new MulticallBatch.Call[](2);
        calls[0] = _call(address(tokenA), abi.encodeWithSignature("totalSupply()"));
        calls[1] = _call(address(tokenB), abi.encodeWithSignature("totalSupply()"));

        MulticallBatch.Result[] memory results = mc.executeBatch(calls);
        assertEq(results.length, 2);
        assertTrue(results[0].success);
        assertTrue(results[1].success);
    }

    function test_executeBatch_failureReverts() public {
        MulticallBatch.Call[] memory calls = new MulticallBatch.Call[](2);
        calls[0] = _call(address(tokenA), abi.encodeWithSignature("totalSupply()"));
        // Second call will fail (bad selector)
        calls[1] = _call(address(tokenA), abi.encodeWithSignature("nonExistentFunction()"));

        vm.expectRevert(abi.encodeWithSelector(MulticallBatch.Multicall__CallFailed.selector, 1, bytes("")));
        mc.executeBatch(calls);
    }

    function test_executeBatch_zeroCallsReverts() public {
        MulticallBatch.Call[] memory calls = new MulticallBatch.Call[](0);
        vm.expectRevert(MulticallBatch.Multicall__ZeroTargets.selector);
        mc.executeBatch(calls);
    }

    function test_executeBatch_decodesReturnData() public {
        MulticallBatch.Call[] memory calls = new MulticallBatch.Call[](1);
        calls[0] = _call(
            address(tokenA),
            abi.encodeWithSignature("balanceOf(address)", alice)
        );

        MulticallBatch.Result[] memory results = mc.executeBatch(calls);
        uint256 balance = abi.decode(results[0].returnData, (uint256));
        assertEq(balance, 1_000e18);
    }

    // =========================================================================
    //  tryExecuteBatch
    // =========================================================================

    function test_tryExecuteBatch_continuesOnFailure() public {
        MulticallBatch.Call[] memory calls = new MulticallBatch.Call[](2);
        calls[0] = _call(address(tokenA), abi.encodeWithSignature("nonExistent()"));
        calls[1] = _call(address(tokenA), abi.encodeWithSignature("totalSupply()"));

        MulticallBatch.Result[] memory results = mc.tryExecuteBatch(calls);
        assertFalse(results[0].success);
        assertTrue(results[1].success);
    }

    function test_tryExecuteBatch_returnsAllResults() public {
        MulticallBatch.Call[] memory calls = new MulticallBatch.Call[](3);
        calls[0] = _call(address(tokenA), abi.encodeWithSignature("totalSupply()"));
        calls[1] = _call(address(tokenB), abi.encodeWithSignature("totalSupply()"));
        calls[2] = _call(address(tokenA), abi.encodeWithSignature("totalSupply()"));

        MulticallBatch.Result[] memory results = mc.tryExecuteBatch(calls);
        assertEq(results.length, 3);
        for (uint256 i; i < 3; i++) {
            assertTrue(results[i].success);
        }
    }

    // =========================================================================
    //  aggregateStatic
    // =========================================================================

    function test_aggregateStatic_viewCalls() public view {
        MulticallBatch.Call[] memory calls = new MulticallBatch.Call[](2);
        calls[0] = _call(address(tokenA), abi.encodeWithSignature("totalSupply()"));
        calls[1] = _call(address(tokenB), abi.encodeWithSignature("totalSupply()"));

        MulticallBatch.Result[] memory results = mc.aggregateStatic(calls);
        assertEq(results.length, 2);
        assertTrue(results[0].success);
        assertTrue(results[1].success);
    }

    // =========================================================================
    //  getBlockInfo
    // =========================================================================

    function test_getBlockInfo_returnsCorrectValues() public view {
        (uint256 bn, uint256 bt, uint256 cid) = mc.getBlockInfo();
        assertEq(bn,  block.number);
        assertEq(bt,  block.timestamp);
        assertEq(cid, block.chainid);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_executeBatch_singleBalanceCall(address user) public {
        vm.assume(user != address(0));
        MulticallBatch.Call[] memory calls = new MulticallBatch.Call[](1);
        calls[0] = _call(
            address(tokenA),
            abi.encodeWithSignature("balanceOf(address)", user)
        );

        MulticallBatch.Result[] memory results = mc.executeBatch(calls);
        assertTrue(results[0].success);
    }
}
