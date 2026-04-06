// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PrincipalToken
 * @notice ERC-20 representing a fixed claim on the underlying asset at maturity.
 *         Each PT is redeemable for exactly 1 underlying asset unit (NUSD, 6 decimals)
 *         after the maturity timestamp. Only the YieldSplitter (MINTER_ROLE) can
 *         mint and burn PTs.
 */
contract PrincipalToken is ERC20, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice UNIX timestamp after which PT holders can redeem 1:1 for underlying.
    uint256 public immutable maturity;

    /// @notice The underlying asset (NUSD stablecoin).
    IERC20 public immutable underlying;

    error NotMatured();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maturity_,
        address underlying_,
        address admin
    ) ERC20(name_, symbol_) {
        maturity = maturity_;
        underlying = IERC20(underlying_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }
}
