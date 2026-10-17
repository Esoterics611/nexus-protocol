// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AccreditedInvestor
 * @author Nexus Protocol
 * @notice Maintains an on-chain registry of accredited investor status for
 *         addresses. Verifiers can set or revoke accreditation individually
 *         or in batch.
 */
contract AccreditedInvestor is AccessControl {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Role identifier for addresses permitted to update accreditation.
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Thrown when the zero address is supplied where it is not allowed.
    error ZeroAddress();

    /// @notice Thrown when an empty array is provided for a batch operation.
    error EmptyArray();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when an address's accreditation status changes.
    event AccreditationUpdated(address indexed account, bool status);

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Mapping of address to accredited investor status.
    mapping(address => bool) private _accredited;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @notice Deploys the AccreditedInvestor registry.
     * @param admin The address granted DEFAULT_ADMIN_ROLE.
     */
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // External — Verifier operations
    // -------------------------------------------------------------------------

    /**
     * @notice Sets the accredited investor status for a single address.
     * @param account The address to update.
     * @param status  True to mark as accredited, false to revoke.
     */
    function setAccredited(address account, bool status) external onlyRole(VERIFIER_ROLE) {
        _setAccredited(account, status);
    }

    /**
     * @notice Batch-updates the accredited investor status for multiple addresses.
     * @param accounts The array of addresses to update.
     * @param status   The accreditation status to apply to all addresses.
     */
    function batchSetAccredited(
        address[] calldata accounts,
        bool status
    ) external onlyRole(VERIFIER_ROLE) {
        if (accounts.length == 0) revert EmptyArray();

        for (uint256 i; i < accounts.length; ) {
            _setAccredited(accounts[i], status);
            unchecked {
                ++i;
            }
        }
    }

    // -------------------------------------------------------------------------
    // External — View
    // -------------------------------------------------------------------------

    /**
     * @notice Returns whether an address is currently accredited.
     * @param account The address to query.
     * @return True if the address is accredited.
     */
    function isAccredited(address account) external view returns (bool) {
        return _accredited[account];
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /**
     * @dev Shared logic for setting accreditation status.
     */
    function _setAccredited(address account, bool status) internal {
        if (account == address(0)) revert ZeroAddress();

        _accredited[account] = status;

        emit AccreditationUpdated(account, status);
    }
}
