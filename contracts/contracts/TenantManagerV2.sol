// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import './BasicERC20.sol';
import './ERC20NonTransferable.sol';
import './Tenant.sol';

interface ITenant {
  function settle(uint256 maxPerTenant) external;
  function name() external view returns (string memory);
  function needSettlement() external view returns (bool);
}

contract TenantManagerV2 is Initializable, OwnableUpgradeable, UUPSUpgradeable {
  uint256 public MAX_PER_TENANT;
  mapping(bytes32 => address) public tenants;
  address[] public tenantAddresses;
  uint256 public tenantCreationFee;
  address public newVar;

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

  function initialize(address owner) public initializer {
    __Ownable_init(owner);
    __UUPSUpgradeable_init();
    // initialize with 10
    setMaxPerTenant(10);
    // initialize with 0.1 ether
    setTenantCreationFee(0.01 ether);
  }

  modifier onlyTenant() {
    require(tenants[keccak256(abi.encodePacked(ITenant(msg.sender).name()))] == msg.sender, 'Not Registered Tenant');
    _;
  }

  modifier requiresFee() {
    // require equal to prevent excess payment
    require(msg.value == tenantCreationFee, 'Need exact tenant creation fee');
    _;
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function createTenant(
    string memory name,
    Tenant.CurrencyType ccyType,
    address ccyAddr,
    uint256 payoutPeriod
  ) public payable requiresFee returns (address) {
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
  ) public payable requiresFee returns (address) {
    bytes32 nameHash = keccak256(abi.encodePacked(name));
    require(tenants[nameHash] == address(0), 'Tenant name already exists');
    require(ccyType == Tenant.CurrencyType.MINTABLES, 'ccyType must be MINTABLES');

    Tenant newTenant = new Tenant(address(this), msg.sender, name, ccyType, address(0), payoutPeriod);
    address newCurrencyAddress;

    ERC20NonTransferable newMintableContract = new ERC20NonTransferable(address(newTenant), tokenName, tokenSymbol);
    newTenant.setCurrencyAddress(address(newMintableContract));
    newCurrencyAddress = address(newMintableContract);

    tenants[nameHash] = address(newTenant);
    tenantAddresses.push(address(newTenant));

    emit TenantCreated(address(newTenant), name, ccyType, address(0), payoutPeriod);
    return address(newTenant);
  }

  function settleAll() public onlyOwner {
    uint256 tenantNumber = tenantAddresses.length;
    for (uint256 i = 0; i < tenantNumber; i++) {
      try ITenant(tenantAddresses[i]).settle(MAX_PER_TENANT) {
        emit TenantSettled(tenantAddresses[i]);
      } catch {
        emit SettleFailed(tenantAddresses[i]);
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

  function setMaxPerTenant(uint256 _maxPerTenant) public onlyOwner {
    MAX_PER_TENANT = _maxPerTenant;
  }

  function withdrawFees() public onlyOwner {
    payable(owner()).transfer(address(this).balance);
  }

  function setTenantCreationFee(uint256 _fee) public onlyOwner {
    tenantCreationFee = _fee;
  }

  function newFunction(address newAddress) public onlyOwner {
    newVar = newAddress;
  }
}
