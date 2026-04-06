// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title YieldToken
 * @notice ERC-20 representing the variable yield stream from a vault position
 *         until maturity. The YieldSplitter distributes accrued yield (in NUSD)
 *         to YT holders pro-rata. After maturity, YT has no further value.
 */
contract YieldToken is ERC20, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice UNIX timestamp at which yield accrual stops.
    uint256 public immutable maturity;

    /// @notice The YieldSplitter contract that distributes yield.
    address public immutable splitter;

    /// @notice The underlying asset (NUSD) used for yield payouts.
    IERC20 public immutable underlying;

    /// @notice Accrued yield owed to each holder (in underlying units).
    mapping(address => uint256) public yieldOwed;

    error OnlySplitter();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maturity_,
        address splitter_,
        address underlying_,
        address admin
    ) ERC20(name_, symbol_) {
        maturity = maturity_;
        splitter = splitter_;
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

    /**
     * @notice Called by the YieldSplitter to credit accrued yield to a holder.
     * @param holder The YT holder receiving yield.
     * @param amount The yield amount in underlying units.
     */
    function addYield(address holder, uint256 amount) external {
        if (msg.sender != splitter) revert OnlySplitter();
        yieldOwed[holder] += amount;
    }

    /**
     * @notice Claim all accrued yield. The splitter must have transferred
     *         the underlying tokens to this contract before calling.
     * @return amount The yield claimed.
     */
    function claimYield() external returns (uint256 amount) {
        amount = yieldOwed[msg.sender];
        if (amount == 0) return 0;
        yieldOwed[msg.sender] = 0;
        underlying.safeTransfer(msg.sender, amount);
    }
}
