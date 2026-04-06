// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {NAVOracle} from "./NAVOracle.sol";
import {ITransferRestrictions} from "./ITransferRestrictions.sol";

/**
 * @title YieldVault
 * @notice ERC-4626 tokenised vault that accepts an ERC-20 deposit token (e.g. USDC).
 *         Share pricing is driven by a {NAVOracle}: when the oracle has entries the
 *         vault's `totalAssets()` returns the oracle-reported value; otherwise it
 *         falls back to the actual deposit-token balance held by the vault.
 *
 *         An optional {ITransferRestrictions} module can be attached to enforce
 *         compliance rules on every share transfer (including mint and redeem).
 */
contract YieldVault is ERC4626, AccessControl {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    /// @notice Role that can update the oracle address.
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @notice General admin role for vault configuration.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice NAV oracle used to determine total assets for share pricing.
    NAVOracle public oracle;

    /// @notice Optional transfer-restrictions contract (address(0) = no restrictions).
    ITransferRestrictions public transferRestrictions;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when the oracle address is changed.
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    /// @notice Emitted when the transfer-restrictions address is changed.
    event TransferRestrictionsUpdated(address indexed oldRestrictions, address indexed newRestrictions);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error TransferRestricted(address from, address to, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param depositToken_ The underlying ERC-20 asset accepted by the vault.
     * @param oracle_       Initial NAVOracle address (can be address(0) to skip oracle).
     * @param name_         ERC-20 name for the vault share token.
     * @param symbol_       ERC-20 symbol for the vault share token.
     */
    constructor(
        IERC20 depositToken_,
        address oracle_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC4626(depositToken_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);

        if (oracle_ != address(0)) {
            oracle = NAVOracle(oracle_);
        }
    }

    // -------------------------------------------------------------------------
    // Admin functions
    // -------------------------------------------------------------------------

    /**
     * @notice Set or replace the NAV oracle.
     * @param newOracle Address of the new {NAVOracle} (or address(0) to disable).
     */
    function setOracle(address newOracle) external onlyRole(ADMIN_ROLE) {
        address old = address(oracle);
        oracle = NAVOracle(newOracle);
        emit OracleUpdated(old, newOracle);
    }

    /**
     * @notice Set or replace the transfer-restrictions module.
     * @param newRestrictions Address of the new {ITransferRestrictions} (or address(0) to disable).
     */
    function setTransferRestrictions(address newRestrictions) external onlyRole(ADMIN_ROLE) {
        address old = address(transferRestrictions);
        transferRestrictions = ITransferRestrictions(newRestrictions);
        emit TransferRestrictionsUpdated(old, newRestrictions);
    }

    // -------------------------------------------------------------------------
    // ERC-4626 overrides
    // -------------------------------------------------------------------------

    /**
     * @notice Total assets under management. If the oracle has entries the latest
     *         oracle value is used; otherwise falls back to actual token balance.
     */
    function totalAssets() public view override returns (uint256) {
        if (address(oracle) != address(0) && oracle.getHistoryLength() > 0) {
            (uint256 assets,) = oracle.getLatestNAV();
            return assets;
        }
        return super.totalAssets();
    }

    // -------------------------------------------------------------------------
    // ERC-20 transfer hook
    // -------------------------------------------------------------------------

    /**
     * @dev Overrides {ERC20._update} to enforce transfer restrictions on every
     *      share token movement (transfers, mints, and burns).
     */
    function _update(address from, address to, uint256 value) internal override {
        if (address(transferRestrictions) != address(0)) {
            if (!transferRestrictions.isTransferAllowed(from, to, value)) {
                revert TransferRestricted(from, to, value);
            }
        }
        super._update(from, to, value);
    }

    // -------------------------------------------------------------------------
    // AccessControl / ERC-165 resolution
    // -------------------------------------------------------------------------

    /**
     * @dev ERC-165 support — merge AccessControl and ERC4626 interface declarations.
     */
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
