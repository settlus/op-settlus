// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract RuleManager is AccessControl {
    struct Rule {
        address[] recipients;
        uint256[] ratios;
        address ruleSetter;
        uint256 timestamp;
    }

    mapping(bytes32 => Rule) private _rules;
    mapping(bytes32 => Rule) private _ruleHistory;
    
    event RuleSet(
        bytes32 indexed ruleKey,
        address indexed nftContract,
        uint256 indexed tokenId,
        address ruleSetter,
        address[] recipients,
        uint256[] ratios,
        uint256 timestamp
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

    function getRuleHistoryKey(
        address nftContract,
        uint256 tokenId,
        uint256 timestamp
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(nftContract, tokenId, timestamp));
    }

    function setCurrentRule(
        address nftContract,
        uint256 tokenId,
        address ruleSetter,
        address[] calldata ruleRecipients,
        uint256[] calldata ratios
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(ruleRecipients.length == ratios.length, "Length mismatch");
        require(ruleRecipients.length > 0, "Empty recipients");
        
        uint256 totalRatio = 0;
        for (uint i = 0; i < ratios.length; i++) {
            require(ratios[i] > 0, "Ratio must be greater than 0");
            totalRatio += ratios[i];
        }
        require(totalRatio > 0, "Total ratio must be greater than 0");
        
        uint256 currentTimestamp = block.timestamp;
        bytes32 ruleKey = getRuleKey(nftContract, tokenId);
        bytes32 historyKey = getRuleHistoryKey(nftContract, tokenId, currentTimestamp);
        
        Rule memory newRule = Rule({
            recipients: ruleRecipients,
            ratios: ratios,
            ruleSetter: ruleSetter,
            timestamp: currentTimestamp
        });
        
        _rules[ruleKey] = newRule;
        _ruleHistory[historyKey] = newRule;
        
        emit RuleSet(ruleKey, nftContract, tokenId, ruleSetter, ruleRecipients, ratios, currentTimestamp);
    }
    
    function getCurrentRule(
        address nftContract,
        uint256 tokenId
    ) external view returns (Rule memory) {
        bytes32 ruleKey = getRuleKey(nftContract, tokenId);
        return _rules[ruleKey];
    }

    function getRuleWithTimestamp(
        address nftContract,
        uint256 tokenId,
        uint256 timestamp
    ) external view returns (Rule memory) {
        bytes32 historyKey = getRuleHistoryKey(nftContract, tokenId, timestamp);
        return _ruleHistory[historyKey];
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