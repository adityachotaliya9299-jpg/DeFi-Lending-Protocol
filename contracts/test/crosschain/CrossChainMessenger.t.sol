// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {
    CrossChainMessenger
} from "../../src/crosschain/CrossChainMessenger.sol";

/**
 * @title CrossChainMessengerTest
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice 15 tests for LayerZero-compatible cross-chain messenger
 */
contract CrossChainMessengerTest is Test {
    CrossChainMessenger internal local; // chain 1 (this chain)
    CrossChainMessenger internal remote; // chain 2 (simulated)

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal asset = makeAddr("asset");

    uint16 constant LOCAL_CHAIN = 101; // Ethereum LZ ID
    uint16 constant REMOTE_CHAIN = 109; // Polygon LZ ID

    function setUp() public {
        local = new CrossChainMessenger(admin, LOCAL_CHAIN);
        remote = new CrossChainMessenger(admin, REMOTE_CHAIN);

        // Wire trust both ways
        vm.startPrank(admin);
        local.setTrustedRemote(REMOTE_CHAIN, address(remote));
        remote.setTrustedRemote(LOCAL_CHAIN, address(local));
        vm.stopPrank();
    }

    // =========================================================================
    //  Admin — trusted remotes
    // =========================================================================

    function test_setTrustedRemote_storesCorrectly() public view {
        assertTrue(local.isTrustedRemote(REMOTE_CHAIN, address(remote)));
    }

    function test_setTrustedRemote_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        local.setTrustedRemote(REMOTE_CHAIN, address(remote));
    }

    function test_setTrustedRemote_sameChainReverts() public {
        vm.prank(admin);
        vm.expectRevert(CrossChainMessenger.CCM__SameChain.selector);
        local.setTrustedRemote(LOCAL_CHAIN, address(remote));
    }

    function test_removeTrustedRemote() public {
        vm.prank(admin);
        local.removeTrustedRemote(REMOTE_CHAIN);
        assertFalse(local.isTrustedRemote(REMOTE_CHAIN, address(remote)));
    }

    // =========================================================================
    //  sendMessage
    // =========================================================================

    function test_sendMessage_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit CrossChainMessenger.MessageSent(
            REMOTE_CHAIN,
            alice,
            1,
            asset,
            1_000e6,
            0
        );
        local.sendMessage(REMOTE_CHAIN, alice, 1, asset, 1_000e6);
    }

    function test_sendMessage_incrementsNonce() public {
        local.sendMessage(REMOTE_CHAIN, alice, 1, asset, 1_000e6);
        local.sendMessage(REMOTE_CHAIN, alice, 1, asset, 2_000e6);
        assertEq(local.nonces(REMOTE_CHAIN, alice), 2);
    }

    function test_sendMessage_zeroAmountReverts() public {
        vm.expectRevert(CrossChainMessenger.CCM__ZeroAmount.selector);
        local.sendMessage(REMOTE_CHAIN, alice, 1, asset, 0);
    }

    function test_sendMessage_invalidMsgTypeReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainMessenger.CCM__InvalidMsgType.selector,
                9
            )
        );
        local.sendMessage(REMOTE_CHAIN, alice, 9, asset, 1_000e6);
    }

    function test_sendMessage_sameChainReverts() public {
        vm.expectRevert(CrossChainMessenger.CCM__SameChain.selector);
        local.sendMessage(LOCAL_CHAIN, alice, 1, asset, 1_000e6);
    }

    // =========================================================================
    //  lzReceive — full round-trip
    // =========================================================================

    function test_lzReceive_depositCreditsBalance() public {
        bytes memory payload = local.encodePayload(1, alice, asset, 1_000e6, 0);

        // Simulate LayerZero calling lzReceive on local chain from remote
        remote.lzReceive(LOCAL_CHAIN, address(local), payload);

        (uint256 deposited, ) = remote.getUserCrossChainPosition(alice, asset);
        assertEq(deposited, 1_000e6);
    }

    function test_lzReceive_withdrawReducesBalance() public {
        // First deposit
        bytes memory depositPayload = local.encodePayload(
            1,
            alice,
            asset,
            1_000e6,
            0
        );
        remote.lzReceive(LOCAL_CHAIN, address(local), depositPayload);

        // Then withdraw
        bytes memory withdrawPayload = local.encodePayload(
            4,
            alice,
            asset,
            400e6,
            1
        );
        remote.lzReceive(LOCAL_CHAIN, address(local), withdrawPayload);

        (uint256 deposited, ) = remote.getUserCrossChainPosition(alice, asset);
        assertEq(deposited, 600e6);
    }

    function test_lzReceive_borrowTracked() public {
        bytes memory payload = local.encodePayload(2, alice, asset, 500e6, 0);
        remote.lzReceive(LOCAL_CHAIN, address(local), payload);

        (, uint256 borrowed) = remote.getUserCrossChainPosition(alice, asset);
        assertEq(borrowed, 500e6);
    }

    function test_lzReceive_replayAttackPrevented() public {
        bytes memory payload = local.encodePayload(1, alice, asset, 1_000e6, 0);
        remote.lzReceive(LOCAL_CHAIN, address(local), payload);

        // Replay same nonce — must revert
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainMessenger.CCM__InvalidNonce.selector,
                1,
                0
            )
        );
        remote.lzReceive(LOCAL_CHAIN, address(local), payload);
    }

    function test_lzReceive_untrustedRemoteReverts() public {
        bytes memory payload = local.encodePayload(1, alice, asset, 1_000e6, 0);
        address untrusted = makeAddr("untrusted");

        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainMessenger.CCM__UntrustedRemote.selector,
                LOCAL_CHAIN,
                untrusted
            )
        );
        remote.lzReceive(LOCAL_CHAIN, untrusted, payload);
    }

    function test_lzReceive_incrementsTotalProcessed() public {
        bytes memory payload = local.encodePayload(1, alice, asset, 1_000e6, 0);
        remote.lzReceive(LOCAL_CHAIN, address(local), payload);
        assertEq(remote.totalMessagesProcessed(), 1);
    }
}
