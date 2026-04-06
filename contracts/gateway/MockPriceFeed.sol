// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MockPriceFeed
 * @notice Chainlink AggregatorV3 compatible mock for development/testnet.
 *         Returns ETH/USD price with 8 decimals (e.g. 280000000000 = $2800).
 */
contract MockPriceFeed is AccessControl {
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    int256 private _price;
    uint8 private constant _DECIMALS = 8;
    string public description = "ETH / USD";
    uint256 public version = 1;

    event PriceUpdated(int256 newPrice);

    error ZeroPrice();

    constructor(int256 initialPrice, address admin) {
        if (initialPrice <= 0) revert ZeroPrice();
        _price = initialPrice;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPDATER_ROLE, admin);
    }

    function setPrice(int256 newPrice) external onlyRole(UPDATER_ROLE) {
        if (newPrice <= 0) revert ZeroPrice();
        _price = newPrice;
        emit PriceUpdated(newPrice);
    }

    function decimals() external pure returns (uint8) {
        return _DECIMALS;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, _price, block.timestamp, block.timestamp, 1);
    }

    function latestAnswer() external view returns (int256) {
        return _price;
    }
}
