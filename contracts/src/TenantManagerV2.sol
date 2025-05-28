// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./BasicERC20.sol";
import "./ERC20Transferable.sol";
import "./Tenant.sol";
import "./TenantFactory.sol";

interface ITenant {
    function settle(uint256 maxPerTenant) external;
    function name() external view returns (string memory);
    function needSettlement() external view returns (bool);
    function creator() external view returns (address);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function setCurrencyAddress(address _currencyAddress) external;
    function record(
        string memory reqID,
        uint256 amount,
        uint256 chainID,
        address contractAddr,
        uint256 tokenID,
        address recipient
    ) external;
}

interface IOwnershipManager {
    function ownerOf(uint256 chainId, address contractAddr, uint256 tokenId) external view returns (address);
}

contract TenantManagerV2 is Initializable, OwnableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    uint256 public MAX_PER_TENANT;
    mapping(bytes32 => address) public tenants;
    address[] public tenantAddresses;
    uint256 public tenantCreationFee;
    address public ownershipManager;
    address public tenantFactoryAddress;
    uint256 public tenantVersion;

    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    event TenantCreated(
        address tenantAddress, string tenantName, Tenant.CurrencyType ccyType, address ccyAddr, uint256 payoutPeriod
    );

    event TenantRemoved(address tenantAddress, string tenantName);

    event TenantAddressesLength(uint256 length);
    event TenantSettled(address tenantAddress);

    event SettleFailed(address tenantAddress);

    event TenantFactorySet(address indexed factory, uint256 version);

    error DuplicateTenantName();
    error NoRegisteredTenant();
    error UnauthorizedAction();

    function initialize(address owner) public initializer {
        __Ownable_init(owner);
        __AccessControl_init();
        __UUPSUpgradeable_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, owner);
        _grantRole(SETTLER_ROLE, owner);
        
        setMaxPerTenant(10);
        setTenantCreationFee(0.01 ether);
        
        tenantVersion = 1;
    }

    function initializeV2() public reinitializer(2) {
        tenantVersion = 2;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner { }

    function setTenantFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "Factory cannot be zero address");
        tenantFactoryAddress = _factory;
        tenantVersion += 1;
        emit TenantFactorySet(_factory, tenantVersion);
    }

    function createTenant(
        string memory name,
        Tenant.CurrencyType ccyType,
        address ccyAddr,
        uint256 payoutPeriod
    )
        public
        payable
        returns (address)
    {
        bytes32 nameHash = keccak256(abi.encodePacked(name));
        if (tenants[nameHash] != address(0)) revert DuplicateTenantName();

        address newTenantAddress;
        if (tenantFactoryAddress != address(0)) {
            newTenantAddress = TenantFactory(tenantFactoryAddress).createTenant(
                address(this), 
                msg.sender, 
                name, 
                ccyType, 
                ccyAddr, 
                payoutPeriod
            );
        } else {
            Tenant newTenant = new Tenant(address(this), msg.sender, name, ccyType, ccyAddr, payoutPeriod);
            newTenantAddress = address(newTenant);
        }
        
        tenants[nameHash] = newTenantAddress;
        tenantAddresses.push(newTenantAddress);

        emit TenantCreated(newTenantAddress, name, ccyType, ccyAddr, payoutPeriod);
        return newTenantAddress;
    }

    function createTenantWithMintableContract(
        string memory name,
        Tenant.CurrencyType ccyType,
        uint256 payoutPeriod,
        string memory tokenName,
        string memory tokenSymbol
    )
        public
        payable
        returns (address)
    {
        bytes32 nameHash = keccak256(abi.encodePacked(name));
        if (tenants[nameHash] != address(0)) revert DuplicateTenantName();
        require(ccyType == Tenant.CurrencyType.MINTABLES, "ccyType must be MINTABLES");

        address newTenantAddress;
        if (tenantFactoryAddress != address(0)) {
            newTenantAddress = TenantFactory(tenantFactoryAddress).createTenant(
                address(this), 
                msg.sender, 
                name, 
                ccyType, 
                address(0), 
                payoutPeriod
            );
        } else {
            Tenant newTenant = new Tenant(address(this), msg.sender, name, ccyType, address(0), payoutPeriod);
            newTenantAddress = address(newTenant);
        }

        ERC20Transferable newMintableContract = new ERC20Transferable(newTenantAddress, tokenName, tokenSymbol);
        
        ITenant(newTenantAddress).setCurrencyAddress(address(newMintableContract));
        
        tenants[nameHash] = newTenantAddress;
        tenantAddresses.push(newTenantAddress);

        emit TenantCreated(newTenantAddress, name, ccyType, address(0), payoutPeriod);
        return newTenantAddress;
    }

    function settleAll() public onlyRole(SETTLER_ROLE) {
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

    function removeTenant(string memory name) public {
        bytes32 nameHash = keccak256(abi.encodePacked(name));
        address tenantAddress = tenants[nameHash];
        if (tenantAddress == address(0)) revert NoRegisteredTenant();
        if (ITenant(tenantAddress).creator() != msg.sender && owner() != msg.sender) revert UnauthorizedAction();
        delete tenants[nameHash];
        for (uint256 i = 0; i < tenantAddresses.length; i++) {
            if (tenantAddresses[i] == tenantAddress) {
                tenantAddresses[i] = tenantAddresses[tenantAddresses.length - 1];
                tenantAddresses.pop();
                break;
            }
        }

        emit TenantRemoved(tenantAddress, name);
    }

    function getTenantAddresses() public view returns (address[] memory) {
        return tenantAddresses;
    }

    function checkNeedSettlement() public view returns (bool) {
        uint256 tenantNumber = tenantAddresses.length;
        for (uint256 i = 0; i < tenantNumber; i++) {
            if (ITenant(tenantAddresses[i]).needSettlement()) return true;
        }
        return false;
    }

    function record(
        address tenantAddress,
        string memory reqID,
        uint256 amount,
        uint256 chainID,
        address contractAddr,
        uint256 tokenID
    ) public {
        address nftOwner;
        if (chainID == block.chainid) {
            nftOwner = IERC721(contractAddr).ownerOf(tokenID);
        } else {
            nftOwner = IOwnershipManager(ownershipManager).ownerOf(chainID, contractAddr, tokenID);
        }

        ITenant tenant = ITenant(tenantAddress);

        if (tenant.hasRole(RECORDER_ROLE, msg.sender)) {
            tenant.record(reqID, amount, chainID, contractAddr, tokenID, nftOwner);
        } else {
            revert UnauthorizedAction();
        }
    }

    function setMaxPerTenant(uint256 _maxPerTenant) public onlyOwner {
        MAX_PER_TENANT = _maxPerTenant;
    }

    function getOwner() public view returns (address) {
        return owner();
    }

    function withdrawFees() public onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function setTenantCreationFee(uint256 _fee) public onlyOwner {
        tenantCreationFee = _fee;
    }

    function setOwnershipManager(address _ownershipManager) external onlyOwner {
        ownershipManager = _ownershipManager;
    }
}
