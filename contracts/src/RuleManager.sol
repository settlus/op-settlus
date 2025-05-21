// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract RuleManager is AccessControl {
    struct Rule {
        address[] recipients;
        uint256[] percentages;
        address ruleSetter;
    }

    mapping(bytes32 => Rule) private _rules;
    
    event RuleSet(
        bytes32 indexed ruleKey,
        address indexed nftContract,
        uint256 indexed tokenId,
        address ruleSetter,
        address[] recipients,
        uint256[] percentages
    );
    
    event RuleRemoved(
        bytes32 indexed ruleKey,
        address indexed nftContract,
        uint256 indexed tokenId,
        address ruleSetter
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function getRuleKey(
        address nftContract,
        uint256 tokenId
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(nftContract, tokenId));
    }

    function setRule(
        address nftContract,
        uint256 tokenId,
        address ruleSetter,
        address[] calldata ruleRecipients,
        uint256[] calldata percentages
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(ruleRecipients.length == percentages.length, "Length mismatch");
        require(ruleRecipients.length > 0, "Empty recipients");
        
        uint256 totalPercentage = 0;
        for (uint i = 0; i < percentages.length; i++) {
            totalPercentage += percentages[i];
        }
        require(totalPercentage == 100, "Total must be 100%");
        
        bytes32 ruleKey = getRuleKey(nftContract, tokenId);
        _rules[ruleKey] = Rule({
            recipients: ruleRecipients,
            percentages: percentages,
            ruleSetter: ruleSetter
        });
        
        emit RuleSet(ruleKey, nftContract, tokenId, ruleSetter, ruleRecipients, percentages);
    }
    
    function getRule(
        address nftContract,
        uint256 tokenId
    ) external view returns (Rule memory) {
        bytes32 ruleKey = getRuleKey(nftContract, tokenId);
        return _rules[ruleKey];
    }

    function removeRule(
        address nftContract,
        uint256 tokenId
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 ruleKey = getRuleKey(nftContract, tokenId);
        address ruleSetter = _rules[ruleKey].ruleSetter;
        require(_rules[ruleKey].recipients.length > 0, "Rule does not exist");
        delete _rules[ruleKey];
        emit RuleRemoved(ruleKey, nftContract, tokenId, ruleSetter);
    }

    function ruleExists(address nftContract, uint256 tokenId) external view returns (bool) {
        bytes32 ruleKey = getRuleKey(nftContract, tokenId);
        return _rules[ruleKey].recipients.length > 0;
    }
}