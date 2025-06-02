// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface ICreatorGroupFactory {
    function isCreatorGroup(address group) external view returns (bool);
}

contract ERC20Transferable is ERC20, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event TokensBurned(address indexed burner, uint256 amount);

    constructor(address defaultAdmin, string memory name, string memory symbol) ERC20(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }

    function mint(address to, uint256 amount) public {
        require(hasRole(OPERATOR_ROLE, _msgSender()), "Must have operator role to mint");
        _mint(to, amount);
    }

    function burn(uint256 amount) public {
        _burn(_msgSender(), amount);
        emit TokensBurned(_msgSender(), amount);
    }

    function burnFrom(address account, uint256 amount) public {
        require(hasRole(OPERATOR_ROLE, _msgSender()), "Must have operator role to burn from");
        _burn(account, amount);
        emit TokensBurned(account, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint256 senderSize;
        uint256 receiverSize;

        assembly {
            senderSize := extcodesize(caller())
        }
        require(senderSize > 0, "Sender must be a contract");

        assembly {
            receiverSize := extcodesize(to)
        }
        require(receiverSize == 0, "Target must be an EOA");
        
        _transfer(_msgSender(), to, amount);
        return true;
    }

    function transferAdmin(address newAdmin) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAdmin != address(0), "New admin cannot be zero address");
        require(!hasRole(DEFAULT_ADMIN_ROLE, newAdmin), "Account already has admin role");

        address previousAdmin = _msgSender();
        grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        renounceRole(DEFAULT_ADMIN_ROLE, previousAdmin);

        emit AdminTransferred(previousAdmin, newAdmin);
    }

    function grantOperatorRole(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(OPERATOR_ROLE, account);
    }

    function revokeOperatorRole(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(OPERATOR_ROLE, account);
    }
}
