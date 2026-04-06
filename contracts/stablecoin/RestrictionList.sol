// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title RestrictionList
 * @notice Shared address denylist used by stablecoin and vault contracts to
 *         enforce transfer restrictions (e.g. sanctions, compliance holds).
 * @dev    RESTRICTOR_ROLE holders can add or remove addresses from the list.
 *         DEFAULT_ADMIN_ROLE manages role assignments.
 */
contract RestrictionList is AccessControl {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    /// @notice Role that may add or remove restricted addresses.
    bytes32 public constant RESTRICTOR_ROLE = keccak256("RESTRICTOR_ROLE");

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev address => whether the address is restricted.
    mapping(address => bool) private _restricted;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when an address is added to the restriction list.
    event AddressRestricted(address indexed account);

    /// @notice Emitted when an address is removed from the restriction list.
    event AddressUnrestricted(address indexed account);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when the zero address is passed where it is not allowed.
    error ZeroAddress();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param admin Address that receives DEFAULT_ADMIN_ROLE and RESTRICTOR_ROLE.
     */
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESTRICTOR_ROLE, admin);
    }

    // ──────────────────────────────────────────────
    //  External — mutative
    // ──────────────────────────────────────────────

    /**
     * @notice Add a single address to the denylist.
     * @param account The address to restrict.
     */
    function restrict(address account) external onlyRole(RESTRICTOR_ROLE) {
        _restrict(account);
    }

    /**
     * @notice Remove a single address from the denylist.
     * @param account The address to unrestrict.
     */
    function unrestrict(address account) external onlyRole(RESTRICTOR_ROLE) {
        _unrestrict(account);
    }

    /**
     * @notice Add multiple addresses to the denylist in a single transaction.
     * @param accounts Array of addresses to restrict.
     */
    function batchRestrict(address[] calldata accounts) external onlyRole(RESTRICTOR_ROLE) {
        uint256 len = accounts.length;
        for (uint256 i; i < len; ) {
            _restrict(accounts[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Remove multiple addresses from the denylist in a single transaction.
     * @param accounts Array of addresses to unrestrict.
     */
    function batchUnrestrict(address[] calldata accounts) external onlyRole(RESTRICTOR_ROLE) {
        uint256 len = accounts.length;
        for (uint256 i; i < len; ) {
            _unrestrict(accounts[i]);
            unchecked { ++i; }
        }
    }

    // ──────────────────────────────────────────────
    //  External — view
    // ──────────────────────────────────────────────

    /**
     * @notice Check whether an address is on the restriction list.
     * @param account The address to query.
     * @return True if the address is restricted, false otherwise.
     */
    function isRestricted(address account) external view returns (bool) {
        return _restricted[account];
    }

    // ──────────────────────────────────────────────
    //  Internal helpers
    // ──────────────────────────────────────────────

    function _restrict(address account) internal {
        if (account == address(0)) revert ZeroAddress();
        if (!_restricted[account]) {
            _restricted[account] = true;
            emit AddressRestricted(account);
        }
    }

    function _unrestrict(address account) internal {
        if (account == address(0)) revert ZeroAddress();
        if (_restricted[account]) {
            _restricted[account] = false;
            emit AddressUnrestricted(account);
        }
    }
}
