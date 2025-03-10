// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BasicERC20 is ERC20, Ownable {
    constructor(
        address initialOwner,
        string memory name,
        string memory symbol
    )
        ERC20(name, symbol)
        Ownable(initialOwner)
    { }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
