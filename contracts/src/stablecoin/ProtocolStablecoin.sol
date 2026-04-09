// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20}         from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  ProtocolStablecoin (pUSD)
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice USD-pegged stablecoin minted by StablecoinVault against collateral.
 *         Inspired by MakerDAO's DAI — overcollateralised and liquidatable.
 *         The token itself is simple — CDP logic lives in StablecoinVault.
 */
contract ProtocolStablecoin is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address admin) ERC20("Protocol USD", "pUSD") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }
}
