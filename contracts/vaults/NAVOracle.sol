// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title NAVOracle
 * @notice On-chain oracle for Net Asset Value (NAV) reporting. Authorized reporters
 *         post periodic NAV snapshots that are stored as an append-only history.
 *         Consumers (e.g. ERC-4626 vaults) read the latest value to price shares.
 */
contract NAVOracle is AccessControl {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    /// @notice Role that authorises an address to post NAV updates.
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice A single NAV snapshot.
    struct NAVEntry {
        uint256 totalAssets;
        uint256 timestamp;
        address reporter;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @dev Append-only history of NAV snapshots.
    NAVEntry[] private _history;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new NAV snapshot is recorded.
    event NAVUpdated(uint256 totalAssets, uint256 timestamp, address indexed reporter);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error TotalAssetsMustBePositive();
    error TimestampTooOld(uint256 provided, uint256 lastTimestamp);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param admin Address that receives DEFAULT_ADMIN_ROLE (can grant/revoke REPORTER_ROLE).
     */
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Reporter functions
    // -------------------------------------------------------------------------

    /**
     * @notice Record a new NAV snapshot.
     * @param totalAssets Total value of underlying assets (must be > 0).
     * @param timestamp   Point-in-time the NAV was observed. Must be >= the
     *                    timestamp of the last entry (monotonically non-decreasing).
     */
    function postNAV(uint256 totalAssets, uint256 timestamp) external onlyRole(REPORTER_ROLE) {
        if (totalAssets == 0) revert TotalAssetsMustBePositive();

        if (_history.length > 0) {
            uint256 lastTimestamp = _history[_history.length - 1].timestamp;
            if (timestamp < lastTimestamp) {
                revert TimestampTooOld(timestamp, lastTimestamp);
            }
        }

        _history.push(NAVEntry({totalAssets: totalAssets, timestamp: timestamp, reporter: msg.sender}));

        emit NAVUpdated(totalAssets, timestamp, msg.sender);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /**
     * @notice Return the most recent NAV snapshot.
     * @return totalAssets Latest reported total asset value.
     * @return timestamp   Timestamp associated with the latest report.
     */
    function getLatestNAV() external view returns (uint256 totalAssets, uint256 timestamp) {
        require(_history.length > 0, "NAVOracle: no entries");
        NAVEntry storage entry = _history[_history.length - 1];
        return (entry.totalAssets, entry.timestamp);
    }

    /**
     * @notice Return a historical NAV entry by index.
     * @param index Zero-based position in the history array.
     * @return entry The NAV snapshot at the given index.
     */
    function getNAVAt(uint256 index) external view returns (NAVEntry memory entry) {
        require(index < _history.length, "NAVOracle: index out of bounds");
        return _history[index];
    }

    /**
     * @notice Return the total number of NAV entries recorded.
     */
    function getHistoryLength() external view returns (uint256) {
        return _history.length;
    }
}
