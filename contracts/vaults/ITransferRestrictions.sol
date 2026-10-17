// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title ITransferRestrictions
 * @notice Interface that a transfer-restrictions module must implement.
 *         The YieldVault calls `isTransferAllowed` on every share transfer.
 */
interface ITransferRestrictions {
    /**
     * @notice Return whether a transfer of `amount` shares from `from` to `to` is allowed.
     * @param from   Sender address (address(0) on mint).
     * @param to     Recipient address (address(0) on burn).
     * @param amount Number of share tokens being transferred.
     * @return allowed True if the transfer is permitted.
     */
    function isTransferAllowed(address from, address to, uint256 amount) external view returns (bool allowed);
}
