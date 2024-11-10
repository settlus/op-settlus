// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import './BasicERC20.sol';
import './ERC20NonTransferable.sol';
import './Tenant.sol';

contract TenantFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
  mapping(bytes32 => address) public tenants;
  address[] public tenantAddresses;

  event TenantCreated(
    address tenantAddress,
    string tenantName,
    Tenant.CurrencyType ccyType,
    address ccyAddr,
    uint256 payoutPeriod
  );

  event SettleAll();
  event SettleFailed(address tenantAddress);

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(address initialOwner) public initializer {
    __Ownable_init(initialOwner);
    __UUPSUpgradeable_init();
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  // Your existing functions remain the same...
  function createTenant(
    string memory name,
    Tenant.CurrencyType ccyType,
    address ccyAddr,
    uint256 payoutPeriod
  ) public returns (address) {
    bytes32 nameHash = keccak256(abi.encodePacked(name));
    require(tenants[nameHash] == address(0), 'Tenant name already exists');

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
    require(tenants[nameHash] == address(0), 'Tenant name already exists');
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
    uint256 tenantNumber = tenantAddresses.length;
    for (uint256 i = 0; i < tenantNumber; i++) {
      Tenant tenant = Tenant(payable(tenantAddresses[i]));
      try tenant.settle() {} catch {
        emit SettleFailed(tenantAddresses[i]);
      }
    }
    emit SettleAll();
  }

  function getTenantAddress(string memory name) public view returns (address) {
    bytes32 nameHash = keccak256(abi.encodePacked(name));
    return tenants[nameHash];
  }

  function getTenantAddresses() public view returns (address[] memory) {
    return tenantAddresses;
  }
}
