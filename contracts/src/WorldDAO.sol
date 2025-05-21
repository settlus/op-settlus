// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract WorldTeam is Ownable, AccessControl {
    string public name;
    mapping(address => bool) public isMember;
    address[] public members;
    address[] public admins;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event MemberAdded(address indexed member);
    event MemberRemoved(address indexed member);

    modifier onlyAdminOrOwner() {
        require(hasRole(ADMIN_ROLE, msg.sender) || msg.sender == owner(), "Not admin or owner");
        _;
    }

    constructor(
        string memory _name,
        address _owner,
        address _admin
    ) Ownable(_owner) {
        require(_admin != address(0), "Admin cannot be zero address");
        name = _name;
        
        _grantRole(ADMIN_ROLE, _owner);
        _grantRole(ADMIN_ROLE, _admin);
        
        admins.push(_admin);
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

    function addAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "New admin cannot be zero address");
        require(!hasRole(ADMIN_ROLE, newAdmin), "Account already has admin role");
        grantRole(ADMIN_ROLE, newAdmin);
        admins.push(newAdmin);
        emit AdminAdded(newAdmin);
    }

    function removeAdmin(address admin) external onlyOwner {
        require(hasRole(ADMIN_ROLE, admin), "Account is not an admin");
        require(admin != owner(), "Cannot remove owner from admins");
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
}

contract WorldTeamFactory is Ownable {
    mapping(string => address) public teamByName;

    event TeamCreated(string indexed name, address indexed team);

    constructor() Ownable(msg.sender) {}

    function createTeam(
        string calldata name,
        address teamOwner,
        address admin
    ) external onlyOwner returns (address) {
        require(teamByName[name] == address(0), "Team name already exists");
        require(admin != address(0), "Admin cannot be zero address");
        require(teamOwner != address(0), "Owner cannot be zero address");
        
        WorldTeam team = new WorldTeam(name, teamOwner, admin);
        teamByName[name] = address(team);
        emit TeamCreated(name, address(team));
        return address(team);
    }

    function getTeam(string calldata name) external view returns (address) {
        return teamByName[name];
    }
}