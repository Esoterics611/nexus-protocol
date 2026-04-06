// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {YieldVault} from "./YieldVault.sol";

/**
 * @title YieldVaultFactory
 * @notice Deterministic deployer and registry for {YieldVault} instances.
 *         Only addresses with DEFAULT_ADMIN_ROLE can create new vaults.
 *         All deployed vaults are tracked in an on-chain registry for
 *         convenient enumeration and membership checks.
 */
contract YieldVaultFactory is AccessControl {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @dev Ordered list of deployed vault addresses.
    address[] private _vaults;

    /// @dev Fast membership lookup.
    mapping(address => bool) private _isVault;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new vault is deployed.
    event VaultCreated(address indexed vault, address indexed depositToken, address indexed oracle);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param admin Address that receives DEFAULT_ADMIN_ROLE.
     */
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Factory
    // -------------------------------------------------------------------------

    /**
     * @notice Deploy a new {YieldVault}.
     * @param depositToken The ERC-20 asset the vault will accept.
     * @param oracle       NAVOracle address (can be address(0)).
     * @param name         ERC-20 name for the vault share token.
     * @param symbol       ERC-20 symbol for the vault share token.
     * @return vault       Address of the newly deployed vault.
     */
    function createVault(
        address depositToken,
        address oracle,
        string calldata name,
        string calldata symbol
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (address vault) {
        YieldVault v = new YieldVault(IERC20(depositToken), oracle, name, symbol);

        vault = address(v);
        _vaults.push(vault);
        _isVault[vault] = true;

        // Transfer admin roles to the caller so they can configure the vault
        v.grantRole(v.DEFAULT_ADMIN_ROLE(), msg.sender);
        v.grantRole(v.ADMIN_ROLE(), msg.sender);
        v.grantRole(v.ORACLE_ROLE(), msg.sender);

        // Factory renounces its own roles
        v.renounceRole(v.ORACLE_ROLE(), address(this));
        v.renounceRole(v.ADMIN_ROLE(), address(this));
        v.renounceRole(v.DEFAULT_ADMIN_ROLE(), address(this));

        emit VaultCreated(vault, depositToken, oracle);
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /**
     * @notice Number of vaults deployed through this factory.
     */
    function getVaultCount() external view returns (uint256) {
        return _vaults.length;
    }

    /**
     * @notice Return the address of the vault at `index`.
     * @param index Zero-based position in the registry.
     */
    function getVault(uint256 index) external view returns (address) {
        require(index < _vaults.length, "YieldVaultFactory: index out of bounds");
        return _vaults[index];
    }

    /**
     * @notice Check whether `addr` is a vault deployed by this factory.
     */
    function isVault(address addr) external view returns (bool) {
        return _isVault[addr];
    }
}
