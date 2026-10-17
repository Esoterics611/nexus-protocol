// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

interface INexusStableCoin {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IPriceFeed {
    function latestAnswer() external view returns (int256);
    function decimals() external view returns (uint8);
}

/**
 * @title ETHSwapGateway
 * @notice Protocol-owned swap desk: ETH ↔ NUSD ↔ ERC-4626 vault shares.
 *
 *         This is NOT an AMM. The gateway mints NUSD against deposited ETH at
 *         the current oracle price and redeems NUSD back to ETH. ETH reserves
 *         must be seeded by the admin for redemptions to succeed.
 *
 *         Required roles on NexusStableCoin:
 *         - MINTER_ROLE  — to mint NUSD for buyers
 *         - BURNER_ROLE  — to burn NUSD from this contract on redemption
 *
 * @dev    Price math (8-decimal Chainlink feed, 18-decimal ETH, 6-decimal NUSD):
 *         nusdOut = ethWei * price / 1e20
 *         ethOut  = nusdAmount * 1e20 / price
 */
contract ETHSwapGateway is AccessControl {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Role that can update price feed and withdraw ETH reserves.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Precision constant: 10^(ETH_DECIMALS + PRICE_DECIMALS - NUSD_DECIMALS) = 10^(18+8-6)
    uint256 private constant PRICE_SCALE = 1e20;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice The NUSD stablecoin contract.
    INexusStableCoin public immutable nusd;

    /// @notice ETH/USD price feed (Chainlink-compatible interface).
    IPriceFeed public priceFeed;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event BoughtNUSD(address indexed buyer, uint256 ethIn, uint256 nusdOut, uint256 price);
    event SoldNUSD(address indexed seller, uint256 nusdIn, uint256 ethOut, uint256 price);
    event BoughtVaultShares(address indexed buyer, address indexed vault, uint256 ethIn, uint256 sharesOut);
    event SoldVaultShares(address indexed seller, address indexed vault, uint256 sharesIn, uint256 ethOut);
    event PriceFeedUpdated(address newFeed);
    event ETHWithdrawn(address indexed to, uint256 amount);
    event ETHSeeded(address indexed from, uint256 amount);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error ZeroAmount();
    error ZeroAddress();
    error InvalidPrice();
    error SlippageExceeded(uint256 got, uint256 minExpected);
    error InsufficientETHReserves(uint256 needed, uint256 available);
    error ETHTransferFailed();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param nusd_      Address of the NexusStableCoin proxy.
     * @param priceFeed_ Address of ETH/USD price feed (MockPriceFeed or Chainlink).
     * @param admin      Address that receives all admin roles.
     */
    constructor(address nusd_, address priceFeed_, address admin) {
        if (nusd_ == address(0) || priceFeed_ == address(0) || admin == address(0)) revert ZeroAddress();
        nusd = INexusStableCoin(nusd_);
        priceFeed = IPriceFeed(priceFeed_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    // ──────────────────────────────────────────────
    //  ETH ↔ NUSD
    // ──────────────────────────────────────────────

    /**
     * @notice Buy NUSD with ETH. Mints NUSD at the current oracle price.
     * @param minNUSDOut Minimum NUSD to receive (slippage protection, 6 decimals).
     */
    function buyNUSD(uint256 minNUSDOut) external payable {
        if (msg.value == 0) revert ZeroAmount();
        uint256 price = _safePrice();
        uint256 nusdOut = (msg.value * price) / PRICE_SCALE;
        if (nusdOut < minNUSDOut) revert SlippageExceeded(nusdOut, minNUSDOut);
        nusd.mint(msg.sender, nusdOut);
        emit BoughtNUSD(msg.sender, msg.value, nusdOut, price);
    }

    /**
     * @notice Sell NUSD for ETH. Burns NUSD and returns ETH at the oracle price.
     * @dev    Caller must approve this contract to spend `nusdAmount` NUSD first.
     * @param nusdAmount Amount of NUSD to sell (6 decimals).
     * @param minETHOut  Minimum ETH to receive in wei (slippage protection).
     */
    function sellNUSD(uint256 nusdAmount, uint256 minETHOut) external {
        if (nusdAmount == 0) revert ZeroAmount();
        uint256 price = _safePrice();
        uint256 ethOut = (nusdAmount * PRICE_SCALE) / price;
        if (ethOut < minETHOut) revert SlippageExceeded(ethOut, minETHOut);
        if (ethOut > address(this).balance) revert InsufficientETHReserves(ethOut, address(this).balance);

        // Pull NUSD from seller into this contract, then burn
        IERC20(address(nusd)).safeTransferFrom(msg.sender, address(this), nusdAmount);
        nusd.burn(address(this), nusdAmount);

        _sendETH(msg.sender, ethOut);
        emit SoldNUSD(msg.sender, nusdAmount, ethOut, price);
    }

    // ──────────────────────────────────────────────
    //  ETH ↔ Vault Shares
    // ──────────────────────────────────────────────

    /**
     * @notice Buy ERC-4626 vault shares with ETH.
     *         ETH → mint NUSD → deposit into vault → shares to caller.
     * @param vault     Address of the ERC-4626 vault (must accept NUSD as asset).
     * @param minShares Minimum vault shares to receive.
     */
    function buyVaultShares(address vault, uint256 minShares) external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (vault == address(0)) revert ZeroAddress();

        uint256 price = _safePrice();
        uint256 nusdAmount = (msg.value * price) / PRICE_SCALE;

        // Mint NUSD to self, approve vault, deposit
        nusd.mint(address(this), nusdAmount);
        IERC20(address(nusd)).forceApprove(vault, nusdAmount);
        uint256 sharesOut = IERC4626(vault).deposit(nusdAmount, msg.sender);

        if (sharesOut < minShares) revert SlippageExceeded(sharesOut, minShares);
        emit BoughtVaultShares(msg.sender, vault, msg.value, sharesOut);
    }

    /**
     * @notice Sell ERC-4626 vault shares for ETH.
     *         Redeem shares → NUSD → burn NUSD → ETH to caller.
     * @dev    Caller must approve this contract to spend `shares` vault tokens first.
     * @param vault     Address of the ERC-4626 vault.
     * @param shares    Number of vault shares to redeem.
     * @param minETHOut Minimum ETH to receive in wei.
     */
    function sellVaultShares(address vault, uint256 shares, uint256 minETHOut) external {
        if (shares == 0) revert ZeroAmount();
        if (vault == address(0)) revert ZeroAddress();

        // Redeem shares owned by msg.sender — caller must have approved this contract
        uint256 nusdReceived = IERC4626(vault).redeem(shares, address(this), msg.sender);

        uint256 price = _safePrice();
        uint256 ethOut = (nusdReceived * PRICE_SCALE) / price;
        if (ethOut < minETHOut) revert SlippageExceeded(ethOut, minETHOut);
        if (ethOut > address(this).balance) revert InsufficientETHReserves(ethOut, address(this).balance);

        nusd.burn(address(this), nusdReceived);
        _sendETH(msg.sender, ethOut);
        emit SoldVaultShares(msg.sender, vault, shares, ethOut);
    }

    // ──────────────────────────────────────────────
    //  View helpers
    // ──────────────────────────────────────────────

    /// @notice Current ETH/USD price from oracle (8 decimals).
    function ethPrice() external view returns (uint256) {
        return _safePrice();
    }

    /// @notice How much NUSD you get for `ethWei` of ETH.
    function quoteBuyNUSD(uint256 ethWei) external view returns (uint256 nusdOut) {
        return (ethWei * _safePrice()) / PRICE_SCALE;
    }

    /// @notice How much ETH you get for `nusdAmount` of NUSD.
    function quoteSellNUSD(uint256 nusdAmount) external view returns (uint256 ethOut) {
        return (nusdAmount * PRICE_SCALE) / _safePrice();
    }

    /// @notice ETH reserve balance of this contract.
    function ethReserves() external view returns (uint256) {
        return address(this).balance;
    }

    // ──────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────

    /// @notice Update the price feed address.
    function setPriceFeed(address newFeed) external onlyRole(OPERATOR_ROLE) {
        if (newFeed == address(0)) revert ZeroAddress();
        priceFeed = IPriceFeed(newFeed);
        emit PriceFeedUpdated(newFeed);
    }

    /// @notice Withdraw ETH reserves (emergency or rebalancing).
    function withdrawETH(uint256 amount, address to) external onlyRole(OPERATOR_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance) revert InsufficientETHReserves(amount, address(this).balance);
        _sendETH(to, amount);
        emit ETHWithdrawn(to, amount);
    }

    /// @notice Seed ETH reserves — anyone can call (admin typically seeds at deploy).
    receive() external payable {
        emit ETHSeeded(msg.sender, msg.value);
    }

    // ──────────────────────────────────────────────
    //  Internal
    // ──────────────────────────────────────────────

    function _safePrice() internal view returns (uint256) {
        int256 raw = priceFeed.latestAnswer();
        if (raw <= 0) revert InvalidPrice();
        return uint256(raw);
    }

    function _sendETH(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert ETHTransferFailed();
    }
}
