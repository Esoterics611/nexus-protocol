// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1967Proxy as OZProxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @notice Thin wrapper so Hardhat v3 generates a deployable artifact.
 *         Hardhat v3 only creates artifacts for contracts defined in the file,
 *         not for contracts that are merely imported.
 */
contract ERC1967Proxy is OZProxy {
    constructor(address implementation, bytes memory _data) OZProxy(implementation, _data) {}
}
