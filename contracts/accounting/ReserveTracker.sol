// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ReserveTracker
 * @author Nexus Protocol
 * @notice On-chain reserve composition tracking. Reporters post reserve entries
 *         that form an auditable history of backing assets. The contract tracks
 *         both the full history and the latest entry per asset type.
 */
contract ReserveTracker is AccessControl {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /**
     * @notice A single reserve entry.
     * @param assetType Human-readable asset type identifier (e.g. "USDC", "T-Bill").
     * @param amount    The reserve amount in the asset's base unit.
     * @param timestamp The block timestamp when the entry was posted.
     * @param reporter  The address that posted the entry.
     */
    struct ReserveEntry {
        string assetType;
        uint256 amount;
        uint256 timestamp;
        address reporter;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Role identifier for addresses permitted to post reserve updates.
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Thrown when the zero address is supplied where it is not allowed.
    error ZeroAddress();

    /// @notice Thrown when an empty asset type string is provided.
    error EmptyAssetType();

    /// @notice Thrown when there are no reserve entries yet.
    error NoReserveEntries();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new reserve entry is posted.
    event ReserveUpdated(
        string assetType,
        uint256 amount,
        uint256 timestamp,
        address indexed reporter
    );

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Ordered history of all reserve entries.
    ReserveEntry[] private _history;

    /// @notice Latest reserve amount per asset type.
    mapping(bytes32 => uint256) private _latestByAsset;

    /// @notice Set of known asset type hashes for total calculation.
    bytes32[] private _assetKeys;

    /// @notice Tracks whether an asset type key has already been registered.
    mapping(bytes32 => bool) private _assetKeyExists;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @notice Deploys the ReserveTracker.
     * @param admin The address granted DEFAULT_ADMIN_ROLE.
     */
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // External — Reporter operations
    // -------------------------------------------------------------------------

    /**
     * @notice Posts a new reserve entry for the given asset type.
     * @param assetType Human-readable asset identifier (e.g. "USDC").
     * @param amount    The reserve amount.
     */
    function postReserve(
        string calldata assetType,
        uint256 amount
    ) external onlyRole(REPORTER_ROLE) {
        if (bytes(assetType).length == 0) revert EmptyAssetType();

        ReserveEntry memory entry = ReserveEntry({
            assetType: assetType,
            amount: amount,
            timestamp: block.timestamp,
            reporter: msg.sender
        });

        _history.push(entry);

        // Update latest-by-asset tracking
        bytes32 key = keccak256(bytes(assetType));
        _latestByAsset[key] = amount;

        if (!_assetKeyExists[key]) {
            _assetKeys.push(key);
            _assetKeyExists[key] = true;
        }

        emit ReserveUpdated(assetType, amount, block.timestamp, msg.sender);
    }

    // -------------------------------------------------------------------------
    // External — View
    // -------------------------------------------------------------------------

    /**
     * @notice Returns the full ordered history of reserve entries.
     * @return An array of {ReserveEntry} structs.
     */
    function getReserveHistory() external view returns (ReserveEntry[] memory) {
        return _history;
    }

    /**
     * @notice Returns the most recently posted reserve entry.
     * @return The latest {ReserveEntry}.
     */
    function getLatestReserve() external view returns (ReserveEntry memory) {
        if (_history.length == 0) revert NoReserveEntries();
        return _history[_history.length - 1];
    }

    /**
     * @notice Returns the sum of the latest posted amount for each distinct
     *         asset type, representing the current total reserves.
     * @return total The aggregate reserve amount.
     */
    function getTotalReserves() external view returns (uint256 total) {
        for (uint256 i; i < _assetKeys.length; ) {
            total += _latestByAsset[_assetKeys[i]];
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Returns the number of entries in the reserve history.
     * @return The history length.
     */
    function getReserveCount() external view returns (uint256) {
        return _history.length;
    }
}
