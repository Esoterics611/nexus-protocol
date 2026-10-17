// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITransferRestrictions} from "../vaults/ITransferRestrictions.sol";

/**
 * @title IRestrictionList
 * @notice Minimal interface for a denylist contract (matches RestrictionList.sol).
 */
interface IRestrictionList {
    function isRestricted(address account) external view returns (bool);
}

/**
 * @title IKYCRegistry
 * @notice Minimal interface for a KYC registry contract (matches KYCRegistry.sol).
 */
interface IKYCRegistry {
    function isVerified(address account) external view returns (bool);
}

/**
 * @title TransferRestrictions
 * @author Nexus Protocol
 * @notice Modular transfer restriction module that checks multiple conditions
 *         before allowing a token transfer. Conditions include denylist screening
 *         and optional KYC verification.
 * @dev    Implements {ITransferRestrictions} so it can be plugged into YieldVault
 *         and any other token that calls `isTransferAllowed()`.
 */
contract TransferRestrictions is ITransferRestrictions, AccessControl {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event RestrictionListUpdated(address indexed oldList, address indexed newList);
    event KYCRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event KYCRequirementUpdated(bool required);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAddress();

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice The denylist contract used for restriction checks.
    IRestrictionList public restrictionList;

    /// @notice The KYC registry contract used for verification checks.
    IKYCRegistry public kycRegistry;

    /// @notice Whether KYC verification is required for transfers.
    bool public kycRequired;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param admin            The address granted DEFAULT_ADMIN_ROLE.
     * @param _restrictionList The initial denylist contract address.
     * @param _kycRegistry     The initial KYC registry contract address.
     * @param _kycRequired     Whether KYC is required at deployment.
     */
    constructor(
        address admin,
        address _restrictionList,
        address _kycRegistry,
        bool _kycRequired
    ) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        restrictionList = IRestrictionList(_restrictionList);
        kycRegistry = IKYCRegistry(_kycRegistry);
        kycRequired = _kycRequired;
    }

    // -------------------------------------------------------------------------
    // ITransferRestrictions implementation
    // -------------------------------------------------------------------------

    /**
     * @notice Returns true if the transfer is allowed (neither party is denied,
     *         and both have valid KYC if required). Mints (from=0) and burns (to=0)
     *         skip checks on the zero-address side.
     */
    function isTransferAllowed(
        address from,
        address to,
        uint256 /* amount */
    ) external view override returns (bool) {
        // Denylist checks
        if (address(restrictionList) != address(0)) {
            if (from != address(0) && restrictionList.isRestricted(from)) return false;
            if (to != address(0) && restrictionList.isRestricted(to)) return false;
        }

        // KYC checks
        if (kycRequired && address(kycRegistry) != address(0)) {
            if (from != address(0) && !kycRegistry.isVerified(from)) return false;
            if (to != address(0) && !kycRegistry.isVerified(to)) return false;
        }

        return true;
    }

    // -------------------------------------------------------------------------
    // Admin configuration
    // -------------------------------------------------------------------------

    function setRestrictionList(address _restrictionList) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = address(restrictionList);
        restrictionList = IRestrictionList(_restrictionList);
        emit RestrictionListUpdated(old, _restrictionList);
    }

    function setKYCRegistry(address _kycRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = address(kycRegistry);
        kycRegistry = IKYCRegistry(_kycRegistry);
        emit KYCRegistryUpdated(old, _kycRegistry);
    }

    function setKYCRequired(bool _required) external onlyRole(DEFAULT_ADMIN_ROLE) {
        kycRequired = _required;
        emit KYCRequirementUpdated(_required);
    }
}
