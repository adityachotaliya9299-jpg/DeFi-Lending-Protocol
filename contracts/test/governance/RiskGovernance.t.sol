// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {RiskGovernance} from "../../src/governance/RiskGovernance.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/**
 * @title RiskGovernanceTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 12 tests for on-chain risk parameter governance
 */
contract RiskGovernanceTest is Test {

    RiskGovernance internal gov;
    MockERC20      internal govToken;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");
    address internal cm    = makeAddr("cm");
    address internal asset = makeAddr("asset");

    uint256 constant VOTING_PERIOD   = 3 days;
    uint256 constant TIMELOCK_PERIOD = 1 days;

    function setUp() public {
        govToken = new MockERC20("LendFi Gov", "LEND", 18);
        gov = new RiskGovernance(admin, cm, address(govToken));

        // Distribute governance tokens
        govToken.mint(alice, 1_000e18);
        govToken.mint(bob,   500e18);
    }

    function _propose() internal returns (uint256 id) {
        return gov.propose(asset, 0, 7_500); // 0 = PARAM_LTV
    }

    function _passAndExecute(uint256 id) internal {
        vm.prank(alice);
        gov.castVote(id, true);

        vm.warp(block.timestamp + VOTING_PERIOD + TIMELOCK_PERIOD + 1);
        gov.execute(id);
    }

    // =========================================================================
    //  Propose
    // =========================================================================

    function test_propose_createsProposal() public {
        uint256 id = _propose();
        RiskGovernance.Proposal memory p = gov.getProposal(id);

        assertTrue(p.exists);
        assertEq(p.asset, asset);
        assertEq(p.paramType, 0); // 0 = PARAM_LTV
        assertEq(p.newValue, 7_500);
    }

    function test_propose_emitsEvent() public {
        vm.expectEmit(false, true, false, true);
        emit RiskGovernance.ProposalCreated(1, address(this), asset, 0, 7_500);
        _propose();
    }

    function test_propose_zeroAssetReverts() public {
        vm.expectRevert(RiskGovernance.RiskGov__ZeroAddress.selector);
        gov.propose(address(0), 0, 7_500);
    }

    function test_propose_invalidParamReverts() public {
        vm.expectRevert(abi.encodeWithSelector(RiskGovernance.RiskGov__InvalidParam.selector, uint8(9)));
        gov.propose(asset, 9, 7_500);
    }

    // =========================================================================
    //  Vote
    // =========================================================================

    function test_castVote_recordsForVote() public {
        uint256 id = _propose();
        vm.prank(alice);
        gov.castVote(id, true);

        RiskGovernance.Proposal memory p = gov.getProposal(id);
        assertEq(p.forVotes, 1_000e18);
    }

    function test_castVote_recordsAgainstVote() public {
        uint256 id = _propose();
        vm.prank(bob);
        gov.castVote(id, false);

        RiskGovernance.Proposal memory p = gov.getProposal(id);
        assertEq(p.againstVotes, 500e18);
    }

    function test_castVote_doubleVoteReverts() public {
        uint256 id = _propose();
        vm.prank(alice);
        gov.castVote(id, true);

        vm.prank(alice);
        vm.expectRevert(RiskGovernance.RiskGov__AlreadyVoted.selector);
        gov.castVote(id, true);
    }

    function test_castVote_afterDeadlineReverts() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + VOTING_PERIOD + 1);

        vm.prank(alice);
        vm.expectRevert(RiskGovernance.RiskGov__VotingEnded.selector);
        gov.castVote(id, true);
    }

    // =========================================================================
    //  Execute
    // =========================================================================

    function test_execute_beforeTimelockReverts() public {
        uint256 id = _propose();
        vm.prank(alice);
        gov.castVote(id, true);

        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        vm.expectRevert(RiskGovernance.RiskGov__TimelockNotExpired.selector);
        gov.execute(id);
    }

    function test_execute_successfulProposal() public {
        uint256 id = _propose();
        _passAndExecute(id);

        RiskGovernance.Proposal memory p = gov.getProposal(id);
        assertTrue(p.executed);
    }

    function test_execute_doubleExecuteReverts() public {
        uint256 id = _propose();
        _passAndExecute(id);

        vm.expectRevert(RiskGovernance.RiskGov__ProposalAlreadyExecuted.selector);
        gov.execute(id);
    }

    function test_hasPassedVote_trueAfterMajority() public {
        uint256 id = _propose();
        vm.prank(alice);
        gov.castVote(id, true);
        vm.prank(bob);
        gov.castVote(id, false);

        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        assertTrue(gov.hasPassedVote(id)); // alice=1000 > bob=500
    }

    function test_isVotingActive_falseAfterDeadline() public {
        uint256 id = _propose();
        assertTrue(gov.isVotingActive(id));

        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        assertFalse(gov.isVotingActive(id));
    }
}
