// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CreditVault
 * @notice Collateralised lending: deposit ERC-4626 vault shares as collateral,
 *         borrow NUSD against them.  Liquidation triggers when a position's LTV
 *         exceeds the liquidation threshold.
 *
 *         NUSD liquidity is supplied by an admin calling `fundLiquidity()`.
 *         The CreditVault must hold sufficient NUSD to fulfil borrows.
 *
 *         NOTE: CreditVault needs MINTER_ROLE on MintController if minting new
 *         NUSD is desired. Alternatively, admin can pre-fund the contract with
 *         NUSD liquidity via `fundLiquidity()`.
 */
contract CreditVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice The ERC-4626 vault whose shares are accepted as collateral.
    IERC4626 public immutable collateralVault;

    /// @notice The underlying asset (NUSD) — what borrowers receive.
    IERC20 public immutable nusd;

    /// @notice Required collateral ratio in basis points (e.g. 15000 = 150%).
    uint256 public collateralRatioBps;

    /// @notice LTV threshold at which a position can be liquidated (e.g. 12000 = 120%).
    uint256 public liquidationRatioBps;

    /// @notice Annual borrow rate in basis points (e.g. 500 = 5%).
    uint256 public borrowRateBps;

    /// @notice Liquidation discount in basis points (e.g. 500 = 5%).
    uint256 public liquidationDiscountBps;

    struct Position {
        uint256 collateralShares;   // vault shares deposited
        uint256 debtNUSD;           // NUSD borrowed (6 decimals)
        uint256 lastAccrualTime;    // UNIX timestamp for interest calc
    }

    mapping(address => Position) public positions;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event CollateralDeposited(address indexed user, uint256 shares);
    event Borrowed(address indexed user, uint256 nusdAmount);
    event Repaid(address indexed user, uint256 nusdAmount);
    event CollateralWithdrawn(address indexed user, uint256 shares);
    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        uint256 collateralSeized,
        uint256 debtRepaid
    );
    event LiquidityFunded(address indexed funder, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error Undercollateralized();
    error NotLiquidatable();
    error InsufficientLiquidity();
    error NoDebt();
    error RepayExceedsDebt();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param collateralVault_ The ERC-4626 vault whose shares are collateral.
     * @param nusd_            The NUSD stablecoin address.
     * @param collateralRatioBps_ Required collateral ratio (e.g. 15000 = 150%).
     * @param liquidationRatioBps_ Liquidation threshold (e.g. 12000 = 120%).
     * @param borrowRateBps_   Annual borrow rate (e.g. 500 = 5%).
     * @param liquidationDiscountBps_ Liquidation discount (e.g. 500 = 5%).
     * @param admin            Address that receives admin roles.
     */
    constructor(
        address collateralVault_,
        address nusd_,
        uint256 collateralRatioBps_,
        uint256 liquidationRatioBps_,
        uint256 borrowRateBps_,
        uint256 liquidationDiscountBps_,
        address admin
    ) {
        collateralVault = IERC4626(collateralVault_);
        nusd = IERC20(nusd_);
        collateralRatioBps = collateralRatioBps_;
        liquidationRatioBps = liquidationRatioBps_;
        borrowRateBps = borrowRateBps_;
        liquidationDiscountBps = liquidationDiscountBps_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /**
     * @notice Fund the vault with NUSD liquidity for lending.
     * @param amount NUSD amount to deposit.
     */
    function fundLiquidity(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        nusd.safeTransferFrom(msg.sender, address(this), amount);
        emit LiquidityFunded(msg.sender, amount);
    }

    /**
     * @notice Update risk parameters.
     */
    function setRiskParams(
        uint256 collateralRatioBps_,
        uint256 liquidationRatioBps_,
        uint256 borrowRateBps_,
        uint256 liquidationDiscountBps_
    ) external onlyRole(ADMIN_ROLE) {
        collateralRatioBps = collateralRatioBps_;
        liquidationRatioBps = liquidationRatioBps_;
        borrowRateBps = borrowRateBps_;
        liquidationDiscountBps = liquidationDiscountBps_;
    }

    // -------------------------------------------------------------------------
    // Borrower operations
    // -------------------------------------------------------------------------

    /**
     * @notice Deposit vault shares as collateral.
     * @param shares Number of vault shares to deposit.
     */
    function depositCollateral(uint256 shares) external nonReentrant {
        if (shares == 0) revert ZeroAmount();

        Position storage pos = positions[msg.sender];
        _accrueInterest(pos);

        IERC20(address(collateralVault)).safeTransferFrom(msg.sender, address(this), shares);
        pos.collateralShares += shares;

        emit CollateralDeposited(msg.sender, shares);
    }

    /**
     * @notice Borrow NUSD against deposited collateral.
     *         Reverts if the resulting position is undercollateralized.
     * @param nusdAmount Amount of NUSD to borrow.
     */
    function borrow(uint256 nusdAmount) external nonReentrant {
        if (nusdAmount == 0) revert ZeroAmount();

        Position storage pos = positions[msg.sender];
        _accrueInterest(pos);

        pos.debtNUSD += nusdAmount;

        // Check collateral ratio
        if (!_isCollateralized(pos, collateralRatioBps)) revert Undercollateralized();

        // Check liquidity
        if (nusd.balanceOf(address(this)) < nusdAmount) revert InsufficientLiquidity();

        nusd.safeTransfer(msg.sender, nusdAmount);

        emit Borrowed(msg.sender, nusdAmount);
    }

    /**
     * @notice Repay NUSD debt.
     * @param nusdAmount Amount to repay.
     */
    function repay(uint256 nusdAmount) external nonReentrant {
        if (nusdAmount == 0) revert ZeroAmount();

        Position storage pos = positions[msg.sender];
        _accrueInterest(pos);

        if (nusdAmount > pos.debtNUSD) revert RepayExceedsDebt();

        nusd.safeTransferFrom(msg.sender, address(this), nusdAmount);
        pos.debtNUSD -= nusdAmount;

        emit Repaid(msg.sender, nusdAmount);
    }

    /**
     * @notice Withdraw collateral. Reverts if the position would become
     *         undercollateralized after withdrawal.
     * @param shares Number of vault shares to withdraw.
     */
    function withdrawCollateral(uint256 shares) external nonReentrant {
        if (shares == 0) revert ZeroAmount();

        Position storage pos = positions[msg.sender];
        _accrueInterest(pos);

        pos.collateralShares -= shares; // reverts on underflow

        // If there's remaining debt, check collateral ratio
        if (pos.debtNUSD > 0 && !_isCollateralized(pos, collateralRatioBps)) {
            revert Undercollateralized();
        }

        IERC20(address(collateralVault)).safeTransfer(msg.sender, shares);

        emit CollateralWithdrawn(msg.sender, shares);
    }

    // -------------------------------------------------------------------------
    // Liquidation
    // -------------------------------------------------------------------------

    /**
     * @notice Liquidate an undercollateralized position. The liquidator repays
     *         the borrower's full debt and receives all collateral at a discount.
     * @param borrower Address of the undercollateralized position.
     */
    function liquidate(address borrower) external nonReentrant {
        Position storage pos = positions[borrower];
        _accrueInterest(pos);

        if (pos.debtNUSD == 0) revert NoDebt();

        // Position must be below the liquidation threshold to be liquidatable
        if (_isCollateralized(pos, liquidationRatioBps)) revert NotLiquidatable();

        uint256 debtToRepay = pos.debtNUSD;
        uint256 collateralToSeize = pos.collateralShares;

        // Liquidator pays debt
        nusd.safeTransferFrom(msg.sender, address(this), debtToRepay);

        // Clear position
        pos.debtNUSD = 0;
        pos.collateralShares = 0;

        // Transfer collateral to liquidator
        IERC20(address(collateralVault)).safeTransfer(msg.sender, collateralToSeize);

        emit Liquidated(borrower, msg.sender, collateralToSeize, debtToRepay);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /**
     * @notice Current LTV ratio for a position in basis points.
     *         LTV = (debt / collateralValue) * 10000
     * @param borrower Address to query.
     * @return bps LTV in basis points (e.g. 7500 = 75%).
     */
    function ltvRatio(address borrower) external view returns (uint256 bps) {
        Position memory pos = positions[borrower];
        pos.debtNUSD = _projectedDebt(pos);
        return _ltvBps(pos);
    }

    /**
     * @notice Asset value of a position's collateral.
     */
    function collateralValue(address borrower) external view returns (uint256) {
        return collateralVault.convertToAssets(positions[borrower].collateralShares);
    }

    /**
     * @notice Current debt including accrued interest.
     */
    function currentDebt(address borrower) external view returns (uint256) {
        return _projectedDebt(positions[borrower]);
    }

    /**
     * @notice Available NUSD liquidity for borrowing.
     */
    function availableLiquidity() external view returns (uint256) {
        return nusd.balanceOf(address(this));
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /**
     * @dev Accrue simple interest on a position. Interest is calculated as:
     *      interest = debt * borrowRateBps * elapsed / (10000 * 365 days)
     */
    function _accrueInterest(Position storage pos) internal {
        if (pos.debtNUSD == 0 || pos.lastAccrualTime == 0) {
            pos.lastAccrualTime = block.timestamp;
            return;
        }
        pos.debtNUSD = _projectedDebt(pos);
        pos.lastAccrualTime = block.timestamp;
    }

    /**
     * @dev Project debt with accrued interest without modifying state.
     */
    function _projectedDebt(Position memory pos) internal view returns (uint256) {
        if (pos.debtNUSD == 0 || pos.lastAccrualTime == 0) return pos.debtNUSD;
        uint256 elapsed = block.timestamp - pos.lastAccrualTime;
        if (elapsed == 0) return pos.debtNUSD;
        uint256 interest = (pos.debtNUSD * borrowRateBps * elapsed) / (10000 * 365 days);
        return pos.debtNUSD + interest;
    }

    /**
     * @dev Check if a position meets a given collateral ratio threshold.
     *      collateralValue * 10000 >= debt * thresholdBps
     */
    function _isCollateralized(Position memory pos, uint256 thresholdBps) internal view returns (bool) {
        if (pos.debtNUSD == 0) return true;
        uint256 colValue = collateralVault.convertToAssets(pos.collateralShares);
        return colValue * 10000 >= pos.debtNUSD * thresholdBps;
    }

    /**
     * @dev Calculate LTV in basis points.
     */
    function _ltvBps(Position memory pos) internal view returns (uint256) {
        if (pos.collateralShares == 0) return pos.debtNUSD > 0 ? type(uint256).max : 0;
        uint256 colValue = collateralVault.convertToAssets(pos.collateralShares);
        if (colValue == 0) return type(uint256).max;
        return (pos.debtNUSD * 10000) / colValue;
    }
}
