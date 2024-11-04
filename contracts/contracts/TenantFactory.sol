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
    Tenant.CurrencyType ccy_type,
    address ccy_addr,
    uint256 payoutPeriod
  );
  event SettleFailed(address tenantAddress);

  constructor() Ownable(msg.sender) {}

  function createTenant(
    string memory name,
    Tenant.CurrencyType ccy_type,
    address ccy_addr,
    uint256 payoutPeriod
  ) public returns (address) {
    require(tenants[name] == address(0), 'Tenant name already exists');

    Tenant newTenant = new Tenant(address(this), msg.sender, name, ccy_type, ccy_addr, payoutPeriod);

    if (ccy_type == Tenant.CurrencyType.ETH && ccy_addr == address(0)) {
      ccy_addr = address(0);
    } else if (ccy_type == Tenant.CurrencyType.ERC20 && ccy_addr == address(0)) {
      BasicERC20 newERC20 = new BasicERC20(address(newTenant), 'ERC20', 'Token');
      ccy_addr = address(newERC20);
    } else if (ccy_type == Tenant.CurrencyType.SBT && ccy_addr == address(0)) {
      ERC20NonTransferable newSBT = new ERC20NonTransferable(address(newTenant), 'Soul Bound Token', 'SBT');
      ccy_addr = address(newSBT);
    }

    newTenant.setCurrencyAddress(ccy_addr);

    tenants[name] = address(newTenant);
    tenantAddresses.push(address(newTenant));

    emit TenantCreated(address(newTenant), name, ccy_type, ccy_addr, payoutPeriod);
    return address(newTenant);
  }

  function settleAll() public {
    for (uint256 i = 0; i < tenantAddresses.length; i++) {
      Tenant tenant = Tenant(payable(tenantAddresses[i]));
      if (tenant.hasPendingSettlements()) {
        try tenant.settle() {} catch {
          // Settle failed for tenant[i], emit event
          emit SettleFailed(tenantAddresses[i]);
        }
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
