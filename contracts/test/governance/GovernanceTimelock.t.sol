// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {GovernanceTimelock} from "../../src/governance/GovernanceTimelock.sol";

contract MockTarget {
    uint256 public value;
    event ValueSet(uint256 v);
    function setValue(uint256 v) external { value = v; emit ValueSet(v); }
    function revertAlways() external pure { revert("always fails"); }
}

contract GovernanceTimelockTest is Test {

    GovernanceTimelock internal tl;
    MockTarget         internal target;

    address internal admin     = makeAddr("admin");
    address internal proposer  = makeAddr("proposer");
    address internal executor  = makeAddr("executor");
    address internal canceller = makeAddr("canceller");
    address internal stranger  = makeAddr("stranger");

    uint256 constant DELAY = 48 hours;

    function setUp() public {
        address[] memory proposers  = new address[](1); proposers[0]  = proposer;
        address[] memory executors  = new address[](1); executors[0]  = executor;
        address[] memory cancellers = new address[](1); cancellers[0] = canceller;

        vm.prank(admin);
        tl = new GovernanceTimelock(admin, proposers, executors, cancellers, DELAY);
        target = new MockTarget();
    }

    function _makeCalldata(uint256 v) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MockTarget.setValue.selector, v);
    }

    function _schedule(uint256 v) internal returns (bytes32 id) {
        bytes memory data = _makeCalldata(v);
        id = tl.hashOperation(address(target), 0, data, bytes32(0), bytes32(uint256(v)));
        vm.prank(proposer);
        tl.schedule(address(target), 0, data, bytes32(0), bytes32(uint256(v)), DELAY);
    }

    function _execute(uint256 v) internal {
        bytes memory data = _makeCalldata(v);
        vm.prank(executor);
        tl.execute(address(target), 0, data, bytes32(0), bytes32(uint256(v)));
    }

    // ── Deployment ────────────────────────────────────────────────────────────

    function test_deployment_minDelay() public view {
        assertEq(tl.minDelay(), DELAY);
    }

    function test_deployment_roles() public view {
        assertTrue(tl.hasRole(tl.PROPOSER_ROLE(),  proposer));
        assertTrue(tl.hasRole(tl.EXECUTOR_ROLE(),  executor));
        assertTrue(tl.hasRole(tl.CANCELLER_ROLE(), canceller));
    }

    // ── Schedule ──────────────────────────────────────────────────────────────

    function test_schedule_basic() public {
        bytes32 id = _schedule(42);
        assertTrue(tl.isQueued(id));
        assertFalse(tl.isReady(id));
        assertEq(tl.getTimestamp(id), block.timestamp + DELAY);
    }

    function test_schedule_onlyProposer() public {
        vm.prank(stranger);
        vm.expectRevert();
        tl.schedule(address(target), 0, _makeCalldata(1), bytes32(0), bytes32(0), DELAY);
    }

    function test_schedule_delayTooShort() public {
        vm.prank(proposer);
        vm.expectRevert();
        tl.schedule(address(target), 0, _makeCalldata(1), bytes32(0), bytes32(0), 1 hours);
    }

    function test_schedule_duplicateReverts() public {
        _schedule(99);
        vm.prank(proposer);
        vm.expectRevert();
        tl.schedule(address(target), 0, _makeCalldata(99), bytes32(0), bytes32(uint256(99)), DELAY);
    }

    // ── Execute ───────────────────────────────────────────────────────────────

    function test_execute_afterDelay() public {
        _schedule(777);
        vm.warp(block.timestamp + DELAY);
        _execute(777);
        assertEq(target.value(), 777);
    }

    function test_execute_tooEarly_reverts() public {
        bytes32 id = _schedule(55);
        vm.prank(executor);
        vm.expectRevert();
        tl.execute(address(target), 0, _makeCalldata(55), bytes32(0), bytes32(uint256(55)));
    }

    function test_execute_marksAsDone() public {
        bytes32 id = _schedule(10);
        vm.warp(block.timestamp + DELAY);
        _execute(10);
        assertTrue(tl.isDone(id));
        assertFalse(tl.isQueued(id));
    }

    function test_execute_onlyExecutor() public {
        _schedule(20);
        vm.warp(block.timestamp + DELAY);
        vm.prank(stranger);
        vm.expectRevert();
        tl.execute(address(target), 0, _makeCalldata(20), bytes32(0), bytes32(uint256(20)));
    }

    function test_execute_failedCall_reverts() public {
        bytes memory data = abi.encodeWithSelector(MockTarget.revertAlways.selector);
        bytes32 id = tl.hashOperation(address(target), 0, data, bytes32(0), bytes32(uint256(999)));
        vm.prank(proposer);
        tl.schedule(address(target), 0, data, bytes32(0), bytes32(uint256(999)), DELAY);
        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        vm.expectRevert();
        tl.execute(address(target), 0, data, bytes32(0), bytes32(uint256(999)));
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    function test_cancel_basic() public {
        bytes32 id = _schedule(33);
        vm.prank(canceller);
        tl.cancel(id);
        assertFalse(tl.isQueued(id));
        assertFalse(tl.isDone(id));
    }

    function test_cancel_onlyCanceller() public {
        bytes32 id = _schedule(44);
        vm.prank(stranger);
        vm.expectRevert();
        tl.cancel(id);
    }

    function test_cancel_notQueuedReverts() public {
        vm.prank(canceller);
        vm.expectRevert();
        tl.cancel(bytes32(uint256(9999)));
    }

    // ── Predecessor ───────────────────────────────────────────────────────────

    function test_predecessor_mustCompletFirst() public {
        // Schedule A
        bytes memory dataA = _makeCalldata(1);
        bytes32 saltA = bytes32(uint256(1));
        bytes32 idA   = tl.hashOperation(address(target), 0, dataA, bytes32(0), saltA);
        vm.prank(proposer);
        tl.schedule(address(target), 0, dataA, bytes32(0), saltA, DELAY);

        // Schedule B with A as predecessor
        bytes memory dataB = _makeCalldata(2);
        bytes32 saltB = bytes32(uint256(2));
        vm.prank(proposer);
        tl.schedule(address(target), 0, dataB, idA, saltB, DELAY);

        vm.warp(block.timestamp + DELAY);

        // Try to execute B before A — should revert
        vm.prank(executor);
        vm.expectRevert();
        tl.execute(address(target), 0, dataB, idA, saltB);

        // Execute A first
        vm.prank(executor);
        tl.execute(address(target), 0, dataA, bytes32(0), saltA);

        // Now B can execute
        vm.prank(executor);
        tl.execute(address(target), 0, dataB, idA, saltB);
        assertEq(target.value(), 2);
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_schedule_anyValueAfterDelay(uint256 v) public {
        v = bound(v, 1, 1e30);
        bytes32 id = _schedule(v);
        assertFalse(tl.isReady(id));
        vm.warp(block.timestamp + DELAY);
        assertTrue(tl.isReady(id));
        _execute(v);
        assertEq(target.value(), v);
    }
}
