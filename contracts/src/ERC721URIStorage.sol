// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BaseNFT is ERC721URIStorage, Ownable {
  constructor(string memory name, string memory symbol, address initialOwner) ERC721(name, symbol) Ownable(initialOwner) {}

  function safeMint(address to, uint256 tokenId, string memory uri) public onlyOwner returns (uint256) {
    //Throws ERC721InvalidSender if tokenId already exists
    _safeMint(to, tokenId);
    _setTokenURI(tokenId, uri);

    return tokenId;
  }

  function tokenURI(
    uint256 tokenId
  ) public view override(ERC721URIStorage) returns (string memory) {
    return super.tokenURI(tokenId);
  }
}
