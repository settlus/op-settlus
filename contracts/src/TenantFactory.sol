// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Tenant.sol";

contract TenantFactory is Ownable {
    event TenantCreated(
        address indexed tenantAddress,
        address indexed manager,
        address indexed creator
    );

    constructor() Ownable(msg.sender) {}
    
    function createTenant(
        address manager,
        address creator,
        string memory name,
        Tenant.CurrencyType ccyType,
        address ccyAddr,
        uint256 payoutPeriod
    ) external returns (address) {
        require(msg.sender == manager || msg.sender == owner(), "Not authorized");
        
        Tenant newTenant = new Tenant(
            manager,
            creator,
            name,
            ccyType,
            ccyAddr,
            payoutPeriod
        );
        
        emit TenantCreated(address(newTenant), manager, creator);
        return address(newTenant);
    }
} 