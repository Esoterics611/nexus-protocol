// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {RestrictionList} from "./RestrictionList.sol";

/**
 * @title NexusStableCoin
 * @notice UUPS-upgradeable ERC-20 stablecoin with ERC-2612 permit support,
 *         role-based access control, pausability, and transfer restrictions.
 * @dev    Uses 6 decimals (USDC convention). Transfer restrictions are enforced
 *         via an external {RestrictionList} contract referenced by address.
 *
 *         Roles:
 *         - DEFAULT_ADMIN_ROLE — manages all other roles and authorises upgrades.
 *         - MINTER_ROLE        — may mint new tokens.
 *         - BURNER_ROLE        — may burn tokens from any address.
 *         - PAUSER_ROLE        — may pause / unpause all transfers.
 *         - RESTRICTOR_ROLE    — may update the RestrictionList reference.
 */
contract NexusStableCoin is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant RESTRICTOR_ROLE = keccak256("RESTRICTOR_ROLE");

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @notice External restriction list contract used to enforce transfer restrictions.
    RestrictionList public restrictionList;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when the restriction list reference is updated.
    event RestrictionListUpdated(address indexed oldList, address indexed newList);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Reverted when a transfer involves a restricted address.
    error AddressRestricted(address account);

    /// @notice Reverted when the zero address is passed where it is not allowed.
    error ZeroAddress();

    // ──────────────────────────────────────────────
    //  Constructor (disable initializers on implementation)
    // ──────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ──────────────────────────────────────────────
    //  Initializer
    // ──────────────────────────────────────────────

    /**
     * @notice Initialise the stablecoin proxy.
     * @param name_  ERC-20 token name.
     * @param symbol_ ERC-20 token symbol.
     * @param admin  Address that receives all admin and operational roles.
     */
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address admin
    ) external initializer {
        if (admin == address(0)) revert ZeroAddress();

        __ERC20_init(name_, symbol_);
        __ERC20Permit_init(name_);
        __AccessControl_init();
        __Pausable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(RESTRICTOR_ROLE, admin);
    }

    // ──────────────────────────────────────────────
    //  ERC-20 overrides
    // ──────────────────────────────────────────────

    /**
     * @notice Returns 6 decimals (USDC convention).
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ──────────────────────────────────────────────
    //  Admin / role-gated functions
    // ──────────────────────────────────────────────

    /**
     * @notice Mint new tokens.
     * @param to     Recipient address.
     * @param amount Amount of tokens to mint (6-decimal precision).
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens from a specified address.
     * @param from   Address whose tokens are burned.
     * @param amount Amount of tokens to burn.
     */
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    /**
     * @notice Pause all token transfers.
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause all token transfers.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Update the address of the external restriction list contract.
     * @param newList Address of the new {RestrictionList} contract.
     */
    function setRestrictionList(address newList) external onlyRole(RESTRICTOR_ROLE) {
        address oldList = address(restrictionList);
        restrictionList = RestrictionList(newList);
        emit RestrictionListUpdated(oldList, newList);
    }

    // ──────────────────────────────────────────────
    //  Internal overrides
    // ──────────────────────────────────────────────

    /**
     * @dev Transfer hook — enforces pause and restriction-list checks.
     *      Minting (from == address(0)) still checks `to`; burning
     *      (to == address(0)) still checks `from`.
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override {
        // Pause check
        _requireNotPaused();

        // Restriction-list check (skip if list is not set)
        RestrictionList list = restrictionList;
        if (address(list) != address(0)) {
            if (from != address(0) && list.isRestricted(from)) {
                revert AddressRestricted(from);
            }
            if (to != address(0) && list.isRestricted(to)) {
                revert AddressRestricted(to);
            }
        }

        super._update(from, to, amount);
    }

    /**
     * @dev Only DEFAULT_ADMIN_ROLE may authorise UUPS upgrades.
     */
    function _authorizeUpgrade(address /* newImplementation */) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
