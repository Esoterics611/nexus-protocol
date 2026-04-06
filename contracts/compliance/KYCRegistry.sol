// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title KYCRegistry
 * @author Nexus Protocol
 * @notice On-chain registry mapping addresses to KYC verification status with
 *         time-bounded expiry. Verifiers can grant and revoke KYC on a
 *         per-address basis, including in batch.
 */
contract KYCRegistry is AccessControl {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /**
     * @notice Represents the KYC status of a single address.
     * @param verified   Whether the address has been verified.
     * @param expiry     Unix timestamp after which the verification is no longer valid.
     * @param verifiedAt Unix timestamp when the verification was granted.
     */
    struct KYCStatus {
        bool verified;
        uint256 expiry;
        uint256 verifiedAt;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Role identifier for addresses permitted to verify or revoke KYC.
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Thrown when an expiry timestamp is not in the future.
    error ExpiryInPast(uint256 expiry);

    /// @notice Thrown when the zero address is supplied where it is not allowed.
    error ZeroAddress();

    /// @notice Thrown when an empty array is provided for a batch operation.
    error EmptyArray();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when an address is KYC-verified.
    event KYCVerified(address indexed account, uint256 expiry);

    /// @notice Emitted when an address's KYC is revoked.
    event KYCRevoked(address indexed account);

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice KYC status for each address.
    mapping(address => KYCStatus) private _statuses;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @notice Deploys the KYCRegistry.
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
     * @notice Marks an address as KYC-verified with a given expiry.
     * @param account The address to verify.
     * @param expiry  The Unix timestamp when this verification expires.
     */
    function setVerified(address account, uint256 expiry) external onlyRole(VERIFIER_ROLE) {
        _setVerified(account, expiry);
    }

    /**
     * @notice Revokes the KYC verification for an address.
     * @param account The address to revoke.
     */
    function revokeVerification(address account) external onlyRole(VERIFIER_ROLE) {
        if (account == address(0)) revert ZeroAddress();

        _statuses[account] = KYCStatus({verified: false, expiry: 0, verifiedAt: 0});

        emit KYCRevoked(account);
    }

    /**
     * @notice Batch-verifies multiple addresses with the same expiry.
     * @param accounts The array of addresses to verify.
     * @param expiry   The common expiry timestamp.
     */
    function batchSetVerified(
        address[] calldata accounts,
        uint256 expiry
    ) external onlyRole(VERIFIER_ROLE) {
        if (accounts.length == 0) revert EmptyArray();

        for (uint256 i; i < accounts.length; ) {
            _setVerified(accounts[i], expiry);
            unchecked {
                ++i;
            }
        }
    }

    // -------------------------------------------------------------------------
    // External — View
    // -------------------------------------------------------------------------

    /**
     * @notice Returns whether an address is currently KYC-verified (verified
     *         and not expired).
     * @param account The address to query.
     * @return True if verified and `block.timestamp < expiry`.
     */
    function isVerified(address account) external view returns (bool) {
        KYCStatus storage s = _statuses[account];
        return s.verified && block.timestamp < s.expiry;
    }

    /**
     * @notice Returns the full KYC status struct for an address.
     * @param account The address to query.
     * @return The {KYCStatus} struct.
     */
    function getStatus(address account) external view returns (KYCStatus memory) {
        return _statuses[account];
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /**
     * @dev Shared logic for setting KYC verification.
     */
    function _setVerified(address account, uint256 expiry) internal {
        if (account == address(0)) revert ZeroAddress();
        if (expiry <= block.timestamp) revert ExpiryInPast(expiry);

        _statuses[account] = KYCStatus({
            verified: true,
            expiry: expiry,
            verifiedAt: block.timestamp
        });

        emit KYCVerified(account, expiry);
    }
}
