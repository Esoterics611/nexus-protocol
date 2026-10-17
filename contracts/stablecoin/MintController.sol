// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {NexusStableCoin} from "./NexusStableCoin.sol";

/**
 * @title MintController
 * @notice Two-tier mint-allocation system for {NexusStableCoin}.
 * @dev    ALLOCATOR_ROLE holders assign per-minter ceilings. Any address with
 *         a positive remaining allocation can call `mint()` up to its ceiling.
 *         ADMIN_ROLE holders can reset consumed amounts.
 *
 *         The controller itself must hold MINTER_ROLE on the stablecoin so it
 *         can forward `stablecoin.mint()` calls.
 */
contract MintController is AccessControl {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    /// @notice Role that manages allocations (set ceilings for minters).
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");

    /// @notice Role that can reset minted amounts and manages roles.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @notice The stablecoin contract this controller mints through.
    NexusStableCoin public immutable stablecoin;

    /// @notice Maximum amount a minter is allowed to mint (ceiling).
    mapping(address => uint256) public mintAllocation;

    /// @notice Amount already minted by each minter.
    mapping(address => uint256) public mintedAmount;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when an allocator sets or updates a minter's ceiling.
    event AllocationSet(address indexed minter, uint256 ceiling);

    /// @notice Emitted when a mint is executed through the controller.
    event MintExecuted(address indexed minter, address indexed to, uint256 amount);

    /// @notice Emitted when an admin resets a minter's consumed amount.
    event AllocationReset(address indexed minter);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when a mint would exceed the caller's remaining allocation.
    error AllocationExceeded(uint256 requested, uint256 remaining);

    /// @notice Thrown when the zero address is passed where it is not allowed.
    error ZeroAddress();

    /// @notice Thrown when a zero amount is passed.
    error ZeroAmount();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param stablecoin_ Address of the {NexusStableCoin} proxy.
     * @param admin       Address that receives ADMIN_ROLE, ALLOCATOR_ROLE,
     *                    and DEFAULT_ADMIN_ROLE.
     */
    constructor(address stablecoin_, address admin) {
        if (stablecoin_ == address(0) || admin == address(0)) revert ZeroAddress();

        stablecoin = NexusStableCoin(stablecoin_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ALLOCATOR_ROLE, admin);
    }

    // ──────────────────────────────────────────────
    //  Allocation management
    // ──────────────────────────────────────────────

    /**
     * @notice Set the maximum mint ceiling for a minter.
     * @dev    Setting a ceiling below the already-minted amount effectively
     *         blocks further minting until the minted amount is reset.
     * @param minter  Address whose ceiling is being set.
     * @param ceiling Maximum total amount the minter may mint.
     */
    function setMintAllocation(
        address minter,
        uint256 ceiling
    ) external onlyRole(ALLOCATOR_ROLE) {
        if (minter == address(0)) revert ZeroAddress();

        mintAllocation[minter] = ceiling;
        emit AllocationSet(minter, ceiling);
    }

    /**
     * @notice Reset a minter's consumed amount back to zero, restoring the
     *         full ceiling for future mints.
     * @param minter Address whose consumed amount is being reset.
     */
    function resetMintedAmount(address minter) external onlyRole(ADMIN_ROLE) {
        if (minter == address(0)) revert ZeroAddress();

        mintedAmount[minter] = 0;
        emit AllocationReset(minter);
    }

    // ──────────────────────────────────────────────
    //  Minting
    // ──────────────────────────────────────────────

    /**
     * @notice Mint stablecoins through the controller, deducting from the
     *         caller's allocation ceiling.
     * @param to     Recipient of the minted tokens.
     * @param amount Amount to mint (6-decimal precision).
     */
    function mint(address to, uint256 amount) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 remaining = remainingAllocation(msg.sender);
        if (amount > remaining) {
            revert AllocationExceeded(amount, remaining);
        }

        mintedAmount[msg.sender] += amount;
        stablecoin.mint(to, amount);

        emit MintExecuted(msg.sender, to, amount);
    }

    // ──────────────────────────────────────────────
    //  View helpers
    // ──────────────────────────────────────────────

    /**
     * @notice Returns the remaining allocation for a minter (ceiling − used).
     * @param minter Address to query.
     * @return The number of tokens the minter may still mint.
     */
    function remainingAllocation(address minter) public view returns (uint256) {
        uint256 ceiling = mintAllocation[minter];
        uint256 used = mintedAmount[minter];
        if (used >= ceiling) return 0;
        return ceiling - used;
    }
}
