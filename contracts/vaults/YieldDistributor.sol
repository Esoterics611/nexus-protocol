// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title YieldDistributor
 * @notice Streaming yield distribution using a rewardPerShare accumulator pattern.
 *         A DISTRIBUTOR_ROLE deposits yield tokens which are then claimable by
 *         registered recipients proportional to their share weight.
 */
contract YieldDistributor is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

    uint256 private constant PRECISION = 1e18;

    IERC20 public immutable yieldToken;

    uint256 public accRewardPerShare;
    uint256 public totalShares;

    struct RecipientInfo {
        uint256 shares;
        uint256 rewardDebt;
    }

    mapping(address => RecipientInfo) public recipients;

    event RecipientRegistered(address indexed recipient, uint256 shares);
    event RecipientRemoved(address indexed recipient);
    event YieldAdded(uint256 amount);
    event YieldClaimed(address indexed recipient, uint256 amount);

    /**
     * @param _yieldToken ERC-20 token distributed as yield (e.g. a stablecoin).
     * @param admin      Address granted DEFAULT_ADMIN_ROLE.
     */
    constructor(address _yieldToken, address admin) {
        require(_yieldToken != address(0), "YieldDistributor: zero yield token");
        require(admin != address(0), "YieldDistributor: zero admin");

        yieldToken = IERC20(_yieldToken);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @notice Register a new recipient or update the share weight of an existing one.
     * @param recipient Address that will receive yield.
     * @param shares    Share weight assigned to the recipient.
     */
    function registerRecipient(address recipient, uint256 shares) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "YieldDistributor: zero recipient");
        require(shares > 0, "YieldDistributor: zero shares");

        RecipientInfo storage info = recipients[recipient];

        if (info.shares > 0) {
            // Settle any pending yield before changing shares.
            uint256 pending = (info.shares * accRewardPerShare / PRECISION) - info.rewardDebt;
            if (pending > 0) {
                yieldToken.safeTransfer(recipient, pending);
                emit YieldClaimed(recipient, pending);
            }
            totalShares -= info.shares;
        }

        info.shares = shares;
        totalShares += shares;
        info.rewardDebt = shares * accRewardPerShare / PRECISION;

        emit RecipientRegistered(recipient, shares);
    }

    /**
     * @notice Remove a recipient, settling any pending yield first.
     * @param recipient Address to remove.
     */
    function removeRecipient(address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        RecipientInfo storage info = recipients[recipient];
        require(info.shares > 0, "YieldDistributor: not registered");

        uint256 pending = (info.shares * accRewardPerShare / PRECISION) - info.rewardDebt;
        if (pending > 0) {
            yieldToken.safeTransfer(recipient, pending);
            emit YieldClaimed(recipient, pending);
        }

        totalShares -= info.shares;
        delete recipients[recipient];

        emit RecipientRemoved(recipient);
    }

    /**
     * @notice Deposit yield tokens for distribution to all recipients.
     * @param amount Amount of yieldToken to distribute.
     */
    function addYield(uint256 amount) external onlyRole(DISTRIBUTOR_ROLE) {
        require(amount > 0, "YieldDistributor: zero amount");
        require(totalShares > 0, "YieldDistributor: no recipients");

        yieldToken.safeTransferFrom(msg.sender, address(this), amount);

        accRewardPerShare += (amount * PRECISION) / totalShares;

        emit YieldAdded(amount);
    }

    /**
     * @notice Claim pending yield on behalf of a recipient.
     * @param recipient Address whose yield is claimed.
     */
    function claimYield(address recipient) external {
        RecipientInfo storage info = recipients[recipient];
        require(info.shares > 0, "YieldDistributor: not registered");

        uint256 pending = (info.shares * accRewardPerShare / PRECISION) - info.rewardDebt;
        require(pending > 0, "YieldDistributor: nothing to claim");

        info.rewardDebt = info.shares * accRewardPerShare / PRECISION;

        yieldToken.safeTransfer(recipient, pending);

        emit YieldClaimed(recipient, pending);
    }

    /**
     * @notice View unclaimed yield for a recipient.
     * @param recipient Address to query.
     * @return Unclaimed yield amount.
     */
    function pendingYield(address recipient) external view returns (uint256) {
        RecipientInfo storage info = recipients[recipient];
        if (info.shares == 0) return 0;
        return (info.shares * accRewardPerShare / PRECISION) - info.rewardDebt;
    }
}
