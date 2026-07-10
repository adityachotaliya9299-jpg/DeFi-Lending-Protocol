// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CrossChainMessenger
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice LayerZero-compatible cross-chain deposit/borrow state messenger
 *
 * Key design:
 * - User deposits on chain A, can borrow on chain B
 * - Messages encoded as (msgType, user, asset, amount, nonce)
 * - Nonce per (srcChain, user) prevents replay attacks
 * - Trusted remote tracking: only registered chain messengers accepted
 * - lzReceive() matches LayerZero ILayerZeroReceiver interface
 */
contract CrossChainMessenger is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ENDPOINT_ROLE = keccak256("ENDPOINT_ROLE");

    uint8 public constant MSG_DEPOSIT = 1;
    uint8 public constant MSG_BORROW = 2;
    uint8 public constant MSG_REPAY = 3;
    uint8 public constant MSG_WITHDRAW = 4;

    error CCM__ZeroAddress();
    error CCM__UntrustedRemote(uint16 srcChainId, address remote);
    error CCM__InvalidNonce(uint256 expected, uint256 got);
    error CCM__InvalidMsgType(uint8 msgType);
    error CCM__ZeroAmount();
    error CCM__SameChain();

    event MessageSent(
        uint16 indexed dstChainId,
        address indexed user,
        uint8 msgType,
        address asset,
        uint256 amount,
        uint256 nonce
    );
    event MessageReceived(
        uint16 indexed srcChainId,
        address indexed user,
        uint8 msgType,
        address asset,
        uint256 amount,
        uint256 nonce
    );
    event TrustedRemoteSet(uint16 indexed chainId, address remote);
    event TrustedRemoteRemoved(uint16 indexed chainId);

    uint16 public immutable localChainId;

    mapping(uint16 => address) public trustedRemotes;
    mapping(uint16 => mapping(address => uint256)) public nonces;
    mapping(address => mapping(address => uint256)) public crossChainDeposits;
    mapping(address => mapping(address => uint256)) public crossChainBorrows;
    uint256 public totalMessagesProcessed;

    constructor(address admin, uint16 _localChainId) {
        if (admin == address(0)) revert CCM__ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        localChainId = _localChainId;
    }

    function setTrustedRemote(
        uint16 chainId,
        address remote
    ) external onlyRole(ADMIN_ROLE) {
        if (remote == address(0)) revert CCM__ZeroAddress();
        if (chainId == localChainId) revert CCM__SameChain();
        trustedRemotes[chainId] = remote;
        emit TrustedRemoteSet(chainId, remote);
    }

    function removeTrustedRemote(uint16 chainId) external onlyRole(ADMIN_ROLE) {
        delete trustedRemotes[chainId];
        emit TrustedRemoteRemoved(chainId);
    }

    function grantEndpointRole(address endpoint) external onlyRole(ADMIN_ROLE) {
        _grantRole(ENDPOINT_ROLE, endpoint);
    }

    function sendMessage(
        uint16 dstChainId,
        address user,
        uint8 msgType,
        address asset,
        uint256 amount
    ) external nonReentrant {
        if (user == address(0)) revert CCM__ZeroAddress();
        if (asset == address(0)) revert CCM__ZeroAddress();
        if (amount == 0) revert CCM__ZeroAmount();
        if (dstChainId == localChainId) revert CCM__SameChain();
        if (msgType < MSG_DEPOSIT || msgType > MSG_WITHDRAW)
            revert CCM__InvalidMsgType(msgType);

        uint256 nonce = nonces[dstChainId][user]++;
        emit MessageSent(dstChainId, user, msgType, asset, amount, nonce);
    }

    function lzReceive(
        uint16 srcChainId,
        address srcAddress,
        bytes calldata payload
    ) external nonReentrant {
        if (trustedRemotes[srcChainId] != srcAddress)
            revert CCM__UntrustedRemote(srcChainId, srcAddress);

        (
            uint8 msgType,
            address user,
            address asset,
            uint256 amount,
            uint256 nonce
        ) = abi.decode(payload, (uint8, address, address, uint256, uint256));

        uint256 expected = nonces[srcChainId][user];
        if (nonce != expected) revert CCM__InvalidNonce(expected, nonce);
        nonces[srcChainId][user]++;

        _processMessage(user, msgType, asset, amount);
        totalMessagesProcessed++;
        emit MessageReceived(srcChainId, user, msgType, asset, amount, nonce);
    }

    function _processMessage(
        address user,
        uint8 msgType,
        address asset,
        uint256 amount
    ) internal {
        if (msgType == MSG_DEPOSIT) {
            crossChainDeposits[user][asset] += amount;
        } else if (msgType == MSG_WITHDRAW) {
            uint256 cur = crossChainDeposits[user][asset];
            crossChainDeposits[user][asset] = amount >= cur ? 0 : cur - amount;
        } else if (msgType == MSG_BORROW) {
            crossChainBorrows[user][asset] += amount;
        } else if (msgType == MSG_REPAY) {
            uint256 cur = crossChainBorrows[user][asset];
            crossChainBorrows[user][asset] = amount >= cur ? 0 : cur - amount;
        } else {
            revert CCM__InvalidMsgType(msgType);
        }
    }

    function encodePayload(
        uint8 msgType,
        address user,
        address asset,
        uint256 amount,
        uint256 nonce
    ) external pure returns (bytes memory) {
        return abi.encode(msgType, user, asset, amount, nonce);
    }

    function isTrustedRemote(
        uint16 chainId,
        address remote
    ) external view returns (bool) {
        return trustedRemotes[chainId] == remote;
    }

    function getUserCrossChainPosition(
        address user,
        address asset
    ) external view returns (uint256 deposited, uint256 borrowed) {
        return (
            crossChainDeposits[user][asset],
            crossChainBorrows[user][asset]
        );
    }
}
