// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AuditLog
 * @author Nexus Protocol
 * @notice Immutable on-chain audit trail. Log entries are emitted as events and
 *         are not stored in contract state, keeping gas costs minimal while
 *         preserving a permanent, tamper-proof record on the blockchain.
 *         Only addresses with the LOGGER_ROLE may write entries; anyone can
 *         read the event history via standard log queries.
 */
contract AuditLog is AccessControl {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Role identifier for addresses permitted to write audit entries.
    bytes32 public constant LOGGER_ROLE = keccak256("LOGGER_ROLE");

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Thrown when the zero address is supplied where it is not allowed.
    error ZeroAddress();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /**
     * @notice Emitted for every audit log entry.
     * @param entryId   Auto-incrementing unique identifier for this entry.
     * @param category  A human-readable category tag (e.g. "MINT", "TRANSFER").
     * @param message   A descriptive message for the entry.
     * @param data      Arbitrary encoded data associated with the entry.
     * @param logger    The address that created the entry.
     * @param timestamp The block timestamp when the entry was created.
     */
    event AuditEntry(
        uint256 indexed entryId,
        string category,
        string message,
        bytes data,
        address indexed logger,
        uint256 timestamp
    );

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Counter for the next entry ID (also represents total entries logged).
    uint256 public nextEntryId;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @notice Deploys the AuditLog.
     * @param admin The address granted DEFAULT_ADMIN_ROLE.
     */
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // External — Logger operations
    // -------------------------------------------------------------------------

    /**
     * @notice Writes an audit log entry. The entry is emitted as an event and
     *         is not stored in contract state.
     * @param category A human-readable category tag.
     * @param message  A descriptive message.
     * @param data     Arbitrary encoded payload.
     */
    function log(
        string calldata category,
        string calldata message,
        bytes calldata data
    ) external onlyRole(LOGGER_ROLE) {
        uint256 entryId = nextEntryId;

        unchecked {
            ++nextEntryId;
        }

        emit AuditEntry(entryId, category, message, data, msg.sender, block.timestamp);
    }
}
