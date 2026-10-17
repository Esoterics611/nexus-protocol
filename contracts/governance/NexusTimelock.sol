// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title NexusTimelock
 * @notice Thin wrapper around OpenZeppelin {TimelockController} for Nexus Protocol governance.
 *         Recommended minimum delay: 1 day (86 400 seconds).
 */
contract NexusTimelock is TimelockController {
    /**
     * @param minDelay   Minimum delay (in seconds) before a queued operation can be executed.
     * @param proposers  Addresses allowed to schedule operations.
     * @param executors  Addresses allowed to execute ready operations.
     * @param admin      Optional admin address; pass address(0) for self-administered.
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
