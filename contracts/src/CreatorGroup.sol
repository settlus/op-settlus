// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract CreatorGroup is Ownable, AccessControl, IERC721Receiver {
    string public groupId;
    mapping(address => bool) public isMember;
    address[] public members;
    address[] public admins;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event MemberAdded(address indexed member);
    event MemberRemoved(address indexed member);
    event TokenTransferred(address indexed token, address indexed target, uint256 amount);
    event ContractCallExecuted(address indexed target, bytes data, uint256 value);

    modifier onlyAdminOrOwner() {
        require(hasRole(ADMIN_ROLE, msg.sender) || msg.sender == owner(), "Not admin or owner");
        _;
    }

    constructor(
        string memory _groupId,
        address _owner,
        address _admin
    ) Ownable(_owner) {
        require(_admin != address(0), "Admin cannot be zero address");
        groupId = _groupId;
        
        _grantRole(ADMIN_ROLE, _owner);
        _grantRole(ADMIN_ROLE, _admin);
        
        admins.push(_admin);
    }

    function transfer(
        address token,
        address target,
        uint256 amount
    ) external onlyAdminOrOwner {
        IERC20(token).transfer(target, amount);
        emit TokenTransferred(token, target, amount);
    }

    function multiTransfer(
        address token,
        address[] calldata targets,
        uint256[] calldata amounts
    ) external onlyAdminOrOwner {
        require(targets.length == amounts.length, "Arrays length mismatch");
        require(targets.length > 0, "Empty arrays");
        
        for (uint256 i = 0; i < targets.length; i++) {
            require(targets[i] != address(0), "Invalid target address");
            require(amounts[i] > 0, "Amount must be greater than 0");
            
            IERC20(token).transfer(targets[i], amounts[i]);
            emit TokenTransferred(token, targets[i], amounts[i]);
        }
    }

    function addMember(address member) external onlyAdminOrOwner {
        require(!isMember[member], "Already a member");
        isMember[member] = true;
        members.push(member);
        emit MemberAdded(member);
    }

    function removeMember(address member) external onlyAdminOrOwner {
        require(isMember[member], "Not a member");
        isMember[member] = false;
        
        // Remove member from array
        for (uint i = 0; i < members.length; i++) {
            if (members[i] == member) {
                members[i] = members[members.length - 1];
                members.pop();
                break;
            }
        }
        
        emit MemberRemoved(member);
    }

    function getMembers() external view returns (address[] memory) {
        return members;
    }

    function getMembersCount() external view returns (uint256) {
        return members.length;
    }

    function addAdmin(address newAdmin) external onlyAdminOrOwner {
        require(newAdmin != address(0), "New admin cannot be zero address");
        require(!hasRole(ADMIN_ROLE, newAdmin), "Account already has admin role");
        grantRole(ADMIN_ROLE, newAdmin);
        admins.push(newAdmin);
        emit AdminAdded(newAdmin);
    }

    function removeAdmin(address admin) external onlyAdminOrOwner {
        require(hasRole(ADMIN_ROLE, admin), "Account is not an admin");
        require(admin != owner(), "Cannot remove owner from admins");
        require(msg.sender != admin, "Cannot remove self from admins");
        
        revokeRole(ADMIN_ROLE, admin);
        
        // Remove admin from array
        for (uint i = 0; i < admins.length; i++) {
            if (admins[i] == admin) {
                admins[i] = admins[admins.length - 1];
                admins.pop();
                break;
            }
        }
        
        emit AdminRemoved(admin);
    }

    function isAdmin(address user) external view returns (bool) {
        return hasRole(ADMIN_ROLE, user);
    }

    function getAdmins() external view returns (address[] memory) {
        return admins;
    }

    function getAdminsCount() external view returns (uint256) {
        return admins.length;
    }

    function executeCall(
        address target,
        bytes calldata data,
        uint256 value
    ) external onlyAdminOrOwner returns (bytes memory) {
        require(target != address(0), "Invalid target address");
        
        (bool success, bytes memory result) = target.call{value: value}(data);
        require(success, "Call failed");
        
        emit ContractCallExecuted(target, data, value);
        return result;
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}
}

contract CreatorGroupFactory is Ownable {
    mapping(string => address) public groupById;
    mapping(address => bool) public isCreatorGroup;

    event GroupCreated(string indexed name, address indexed group);

    constructor() Ownable(msg.sender) {}

    function createGroup(
        string calldata groupId,
        address groupOwner,
        address admin
    ) external onlyOwner returns (address) {
        require(groupById[groupId] == address(0), "Group name already exists");
        require(admin != address(0), "Admin cannot be zero address");
        require(groupOwner != address(0), "Owner cannot be zero address");
        
        CreatorGroup group = new CreatorGroup(groupId, groupOwner, admin);
        address groupAddress = address(group);
        
        groupById[groupId] = groupAddress;
        isCreatorGroup[groupAddress] = true; // CreatorGroup으로 등록
        
        emit GroupCreated(groupId, groupAddress);
        return groupAddress;
    }

    function getGroup(string calldata groupId) external view returns (address) {
        return groupById[groupId];
    }
}