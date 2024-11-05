// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import './BasicERC20.sol';
import './ERC20NonTransferable.sol';
import './Tenant.sol';

contract TenantFactory is Ownable {
  mapping(string => address) public tenants;
  address[] public tenantAddresses;

  event TenantCreated(
    address tenantAddress,
    string tenantName,
    Tenant.CurrencyType ccyType,
    address ccyAddr,
    uint256 payoutPeriod
  );
  event SettleFailed(address tenantAddress);

  constructor() Ownable(msg.sender) {}

  function createTenant(
    string memory name,
    Tenant.CurrencyType ccyType,
    address ccyAddr,
    uint256 payoutPeriod
  ) public returns (address) {
    require(tenants[name] == address(0), 'Tenant name already exists');

    Tenant newTenant = new Tenant(address(this), msg.sender, name, ccyType, ccyAddr, payoutPeriod);
    if (ccyType == Tenant.CurrencyType.ERC20) {
      BasicERC20 newERC20 = new BasicERC20(address(newTenant), 'ERC20', 'Token');
      newTenant.setCurrencyAddress(address(newERC20));

    } else if (ccyType == Tenant.CurrencyType.SBT) {
      ERC20NonTransferable newSBT = new ERC20NonTransferable(address(newTenant), 'Soul Bound Token', 'SBT');
      newTenant.setCurrencyAddress(address(newSBT));
    }

    tenants[name] = address(newTenant);
    tenantAddresses.push(address(newTenant));

    emit TenantCreated(address(newTenant), name, ccyType, ccyAddr, payoutPeriod);
    return address(newTenant);
  }

  function settleAll() public {
    uint256 tenantNumber = tenantAddresses.length;
    for (uint256 i = 0; i < tenantNumber; i++) {
      Tenant tenant = Tenant(payable(tenantAddresses[i]));
      try tenant.settle() {} catch {
        // Settle failed for tenant[i], emit event
        emit SettleFailed(tenantAddresses[i]);
      }
    }
  }

  function getTenantAddress(string memory name) public view returns (address) {
    return tenants[name];
  }

  function getTenantAddresses() public view returns (address[] memory) {
    return tenantAddresses;
  }
}
