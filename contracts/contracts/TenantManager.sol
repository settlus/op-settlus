// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import './BasicERC20.sol';
import './ERC20NonTransferable.sol';
import './Tenant.sol';

interface ITenant {
  function settle() external returns (uint256);
  function name() external view returns (string memory);
  function needSettlement() external view returns (bool);
}

contract TenantManager is Initializable, OwnableUpgradeable, UUPSUpgradeable {
  mapping(bytes32 => address) public tenants;
  uint256 public maxBatchSize = 30;
  address[] public tenantAddresses;

  event TenantCreated(
    address tenantAddress,
    string tenantName,
    Tenant.CurrencyType ccyType,
    address ccyAddr,
    uint256 payoutPeriod
  );

  event TenantAddressesLength(uint256 length);
  event TenantSettled(address tenantAddress);

  event SettleFailed(address tenantAddress);

  error DuplicateTenantName();
  error NotScheduledTenant();

  modifier onlyTenant() {
    require(tenants[keccak256(abi.encodePacked(ITenant(msg.sender).name()))] == msg.sender, 'Not Registered Tenant');
    _;
  }

  function initialize(address owner) public initializer {
    __Ownable_init(owner);
    __UUPSUpgradeable_init();
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function createTenant(
    string memory name,
    Tenant.CurrencyType ccyType,
    address ccyAddr,
    uint256 payoutPeriod
  ) public returns (address) {
    bytes32 nameHash = keccak256(abi.encodePacked(name));
    if (tenants[nameHash] != address(0)) revert DuplicateTenantName();

    Tenant newTenant = new Tenant(address(this), msg.sender, name, ccyType, ccyAddr, payoutPeriod);
    tenants[nameHash] = address(newTenant);
    tenantAddresses.push(address(newTenant));

    emit TenantCreated(address(newTenant), name, ccyType, ccyAddr, payoutPeriod);
    return address(newTenant);
  }

  function createTenantWithMintableContract(
    string memory name,
    Tenant.CurrencyType ccyType,
    uint256 payoutPeriod,
    string memory tokenName,
    string memory tokenSymbol
  ) public returns (address) {
    bytes32 nameHash = keccak256(abi.encodePacked(name));
    if (tenants[nameHash] != address(0)) revert DuplicateTenantName();
    require(ccyType == Tenant.CurrencyType.MINTABLES, 'ccyType must be MINTABLES');

    Tenant newTenant = new Tenant(address(this), msg.sender, name, ccyType, address(0), payoutPeriod);
    ERC20NonTransferable newMintableContract = new ERC20NonTransferable(address(newTenant), tokenName, tokenSymbol);

    newTenant.setCurrencyAddress(address(newMintableContract));
    tenants[nameHash] = address(newTenant);
    tenantAddresses.push(address(newTenant));

    emit TenantCreated(address(newTenant), name, ccyType, address(0), payoutPeriod);
    return address(newTenant);
  }

  function settleAll() public onlyOwner {
    uint256 count = 0;
    uint256 tenantNumber = tenantAddresses.length;
    for (uint256 i = 0; i < tenantNumber; i++) {
      if (count >= maxBatchSize) break;
      if (!ITenant(tenantAddresses[i]).needSettlement()) continue;

      try ITenant(targetTenants[i]).settle() returns (uint256 settledCount) {
        count += settledCount;
        emit TenantSettled(targetTenants[i]);
      } catch {
        emit SettleFailed(targetTenants[i]);
      }
    }
  }

  function getTenantAddress(string memory name) public view returns (address) {
    bytes32 nameHash = keccak256(abi.encodePacked(name));
    return tenants[nameHash];
  }

  function getTenantAddresses() public view returns (address[] memory) {
    return tenantAddresses;
  }

  function checkNeedSettlement() public view returns (bool memory) {
    uint256 tenantNumber = tenantAddresses.length;
    for (uint256 i = 0; i < tenantNumber; i++) {
       if (ITenant(tenantAddresses[i]).needSettlement()) return true;
    }
    return false;
  }

  function setMaxBatchSize(uint256 _maxBatchSize) public onlyOwner {
    maxBatchSize = _maxBatchSize;
  }

  function getOwner() public view returns (address) {
    return owner();
  }
}
