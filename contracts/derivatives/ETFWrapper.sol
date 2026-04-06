// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ETFWrapper
 * @notice A basket product: one ERC-20 token backed by weighted allocations across
 *         multiple ERC-4626 vaults. Depositors supply the common underlying asset
 *         (NUSD), which is split across vaults per `weightBps`. Withdrawals redeem
 *         pro-rata from each vault.
 *
 *         All vaults must share the same underlying asset (NUSD).
 */
contract ETFWrapper is ERC20, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant REBALANCER_ROLE = keccak256("REBALANCER_ROLE");

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct VaultAllocation {
        IERC4626 vault;         // ERC-4626 vault
        uint256 weightBps;      // allocation weight (must sum to 10000)
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice The common underlying asset across all vaults (NUSD).
    IERC20 public immutable underlying;

    /// @notice Current vault allocations.
    VaultAllocation[] public allocations;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Deposited(address indexed user, uint256 nusdAmount, uint256 etfTokens);
    event Withdrawn(address indexed user, uint256 etfTokens, uint256 nusdAmount);
    event Rebalanced(uint256 timestamp);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error InvalidWeights();
    error NoAllocations();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param underlying_   The common underlying asset (NUSD).
     * @param vaults_       Array of vault addresses.
     * @param weights_      Matching array of weight basis points (must sum to 10000).
     * @param name_         ERC-20 name for the ETF token.
     * @param symbol_       ERC-20 symbol for the ETF token.
     * @param admin         Address that receives admin roles.
     */
    constructor(
        address underlying_,
        address[] memory vaults_,
        uint256[] memory weights_,
        string memory name_,
        string memory symbol_,
        address admin
    ) ERC20(name_, symbol_) {
        underlying = IERC20(underlying_);

        if (vaults_.length == 0) revert NoAllocations();
        if (vaults_.length != weights_.length) revert InvalidWeights();

        uint256 totalWeight;
        for (uint256 i = 0; i < vaults_.length; i++) {
            allocations.push(VaultAllocation({
                vault: IERC4626(vaults_[i]),
                weightBps: weights_[i]
            }));
            totalWeight += weights_[i];
        }
        if (totalWeight != 10000) revert InvalidWeights();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REBALANCER_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Core operations
    // -------------------------------------------------------------------------

    /**
     * @notice Deposit NUSD and receive ETF tokens. NUSD is split across vaults
     *         per allocation weights.
     * @param nusdAmount Amount of NUSD to deposit.
     * @return etfTokens Amount of ETF tokens minted.
     */
    function deposit(uint256 nusdAmount) external nonReentrant returns (uint256 etfTokens) {
        if (nusdAmount == 0) revert ZeroAmount();

        // Transfer NUSD from depositor
        underlying.safeTransferFrom(msg.sender, address(this), nusdAmount);

        // Deposit into each vault per weight
        uint256 len = allocations.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 amount = (nusdAmount * allocations[i].weightBps) / 10000;
            if (amount > 0) {
                underlying.safeIncreaseAllowance(address(allocations[i].vault), amount);
                allocations[i].vault.deposit(amount, address(this));
            }
        }

        // Mint ETF tokens 1:1 with deposited NUSD amount
        // If there's existing supply, price based on current NAV
        if (totalSupply() == 0) {
            etfTokens = nusdAmount;
        } else {
            uint256 nav = totalNAV();
            // nav is the value BEFORE deposit (already in vaults now, but we can
            // compute the pre-deposit nav as nav - nusdAmount approximately).
            // For exact pricing: etfTokens = nusdAmount * totalSupply / navBeforeDeposit
            // But since deposit already happened, navBeforeDeposit = nav - nusdAmount
            uint256 navBefore = nav - nusdAmount;
            if (navBefore == 0) {
                etfTokens = nusdAmount;
            } else {
                etfTokens = (nusdAmount * totalSupply()) / navBefore;
            }
        }

        _mint(msg.sender, etfTokens);

        emit Deposited(msg.sender, nusdAmount, etfTokens);
    }

    /**
     * @notice Burn ETF tokens to withdraw NUSD pro-rata from each vault.
     * @param etfTokens Amount of ETF tokens to redeem.
     * @return nusdAmount Total NUSD received.
     */
    function withdraw(uint256 etfTokens) external nonReentrant returns (uint256 nusdAmount) {
        if (etfTokens == 0) revert ZeroAmount();

        uint256 supply = totalSupply();
        uint256 len = allocations.length;

        // Burn first to prevent reentrancy
        _burn(msg.sender, etfTokens);

        // Redeem proportional shares from each vault
        for (uint256 i = 0; i < len; i++) {
            uint256 vaultShares = IERC20(address(allocations[i].vault)).balanceOf(address(this));
            uint256 sharesToRedeem = (vaultShares * etfTokens) / supply;
            if (sharesToRedeem > 0) {
                uint256 assets = allocations[i].vault.redeem(sharesToRedeem, address(this), address(this));
                nusdAmount += assets;
            }
        }

        // Transfer NUSD to user
        if (nusdAmount > 0) {
            underlying.safeTransfer(msg.sender, nusdAmount);
        }

        emit Withdrawn(msg.sender, etfTokens, nusdAmount);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /**
     * @notice Total NAV across all vaults (in underlying units, 6 decimals).
     */
    function totalNAV() public view returns (uint256 nav) {
        uint256 len = allocations.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 shares = IERC20(address(allocations[i].vault)).balanceOf(address(this));
            if (shares > 0) {
                nav += allocations[i].vault.convertToAssets(shares);
            }
        }
    }

    /**
     * @notice Price per ETF token in underlying units (6 decimals).
     */
    function pricePerToken() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e6; // $1.00 when no supply
        return (totalNAV() * 1e6) / supply;
    }

    /**
     * @notice Number of vault allocations.
     */
    function allocationCount() external view returns (uint256) {
        return allocations.length;
    }

    /**
     * @notice Decimals — match NUSD (6).
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // -------------------------------------------------------------------------
    // Rebalancing (future)
    // -------------------------------------------------------------------------

    /**
     * @notice Placeholder for rebalancing. In production, this would withdraw from
     *         over-weighted vaults and deposit into under-weighted ones.
     */
    function rebalance() external onlyRole(REBALANCER_ROLE) {
        // TODO: implement graduated rebalancing
        emit Rebalanced(block.timestamp);
    }
}
