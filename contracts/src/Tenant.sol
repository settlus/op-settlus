// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./ERC20Transferable.sol";
import "./RuleManager.sol";
import "./CreatorGroup.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

interface IRuleManager {
    function getRule(address nftContract, uint256 tokenId) external view returns (Rule memory);

    function getCurrentRule(address nftContract, uint256 tokenId) external view returns (Rule memory);

    function getRuleWithTimestamp(address nftContract, uint256 tokenId, uint256 timestamp) external view returns (Rule memory);
}

struct Rule {
    address[] recipients;
    uint256[] ratios;
    address ruleSetter;
    uint256 timestamp;
}

contract Tenant is AccessControl {
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

    enum CurrencyType {
        ETH,
        ERC20,
        MINTABLES
    }

    enum RecordStatus {
        Pending,
        Settled,
        Cancelled
    }

    event Settled(string indexed reqID, uint256 amount, address recipient);
    event Cancelled(string indexed reqID);
    event RecorderAdded(address indexed recorder);
    event RecorderRemoved(address indexed recorder);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event TokenTransferred(address indexed token, address indexed from, address indexed to, uint256 amount);
    event TokensDistributed(address indexed token, address indexed teamAddress, uint256 totalAmount);
    event RuleManagerSet(address indexed ruleManager);
    event TokenDistributed(address indexed recipient, uint256 amount, CurrencyType ccyType, address indexed token);

    struct UTXR {
        string reqID;
        uint256 amount;
        uint256 timestamp;
        address recipient;
        uint256 chainID;
        address contractAddr;
        uint256 tokenID;
        uint256 ruleTimestamp;
        RecordStatus status;
    }

    address public manager;
    address public creator;
    string public name;
    CurrencyType public ccyType;
    address public ccyAddr;
    address public ruleManager;
    uint256 public payoutPeriod;

    UTXR[] public utxrs;
    uint256 public nextToSettleIdx;

    mapping(string => uint256) public reqIDToIdx;
    mapping(string => bool) public reqIDExists;

    constructor(address _manager, address _creator, string memory _name, CurrencyType _ccyType, address _ccyAddr, uint256 _payoutPeriod) {
        manager = _manager;
        creator = _creator;
        name = _name;
        ccyType = _ccyType;
        payoutPeriod = _payoutPeriod;

        if (ccyType == CurrencyType.ETH) {
            ccyAddr = address(0);
        } else {
            ccyAddr = _ccyAddr;
        }

        _grantRole(DEFAULT_ADMIN_ROLE, creator);
        _grantRole(RECORDER_ROLE, creator);
        _grantRole(RECORDER_ROLE, _manager);
    }

    modifier onlyManagerOrAdmin() {
        require(msg.sender == manager || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not authorized");
        _;
    }

    function addRecorder(address recorder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(RECORDER_ROLE, recorder);
        emit RecorderAdded(recorder);
    }

    function removeRecorder(address recorder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!hasRole(DEFAULT_ADMIN_ROLE, recorder), "Cannot remove RECORDER_ROLE from master");
        revokeRole(RECORDER_ROLE, recorder);
        emit RecorderRemoved(recorder);
    }

    function transferAdmin(address newAdmin) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAdmin != address(0), "New admin cannot be zero address");
        require(!hasRole(DEFAULT_ADMIN_ROLE, newAdmin), "Account already has admin role");

        address previousAdmin = _msgSender();
        grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        renounceRole(DEFAULT_ADMIN_ROLE, previousAdmin);

        emit AdminTransferred(previousAdmin, newAdmin);
    }

    function setCurrencyAddress(address _currencyAddress) external onlyManagerOrAdmin {
        ccyAddr = _currencyAddress;
    }

    function record(string memory reqID, uint256 amount, uint256 chainID, address contractAddr, uint256 tokenID, address recipient) external onlyRole(RECORDER_ROLE) {
        require(bytes(reqID).length > 0, "reqID cannot be empty");
        require(reqIDToIdx[reqID] == 0, "Duplicate reqID");

        Rule memory rule;
        uint256 ruleTimestamp = 0;

        rule = IRuleManager(ruleManager).getCurrentRule(contractAddr, tokenID);
        if (rule.ruleSetter == recipient) {
            ruleTimestamp = rule.timestamp;
        }

        _createUTXR(reqID, amount, block.timestamp + payoutPeriod, recipient, chainID, contractAddr, tokenID, ruleTimestamp);
    }

    // recordRaw is for recording UTXRs that are not NFTs or custom use of Tenants
    function recordRaw(string memory reqID, uint256 amount, address recipient) public onlyRole(RECORDER_ROLE) {
        require(bytes(reqID).length > 0, "reqID cannot be an empty string");
        require(reqIDToIdx[reqID] == 0, "Duplicate reqID");

        _createUTXR(reqID, amount, block.timestamp + payoutPeriod, recipient, 0, address(0), 0, 0);
    }

    function _createUTXR(string memory reqID, uint256 amount, uint256 timestamp, address recipient, uint256 chainID, address contractAddr, uint256 tokenID, uint256 ruleTimestamp) internal {
        UTXR memory newUTXR = UTXR({
            reqID: reqID,
            amount: amount,
            timestamp: timestamp,
            recipient: recipient,
            chainID: chainID,
            contractAddr: contractAddr,
            tokenID: tokenID,
            ruleTimestamp: ruleTimestamp,
            status: RecordStatus.Pending
        });

        utxrs.push(newUTXR);
        reqIDToIdx[reqID] = utxrs.length - 1;
        reqIDExists[reqID] = true;
    }

    function getUtxrsLength() public view returns (uint256) {
        return utxrs.length;
    }

    function getUtxrByReqID(string memory reqID) public view returns (UTXR memory) {
        require(bytes(reqID).length > 0, "reqID cannot be an empty string");
        require(reqIDExists[reqID], "reqID not found");

        return utxrs[reqIDToIdx[reqID]];
    }

    function cancel(string memory reqID) external onlyRole(RECORDER_ROLE) {
        require(bytes(reqID).length > 0, "reqID cannot be an empty string");

        uint256 index = reqIDToIdx[reqID];
        UTXR storage utxr = utxrs[index];

        require(block.timestamp < utxr.timestamp, "Cannot cancel, UTXR past payout period");

        utxr.status = RecordStatus.Cancelled;
        delete reqIDToIdx[reqID];

        emit Cancelled(reqID);
    }

    function setPayoutPeriod(uint256 _payoutPeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_payoutPeriod > 0, "Payout period must be greater than zero");
        // need to settle all pending UTXRs before changing payout period, otherwise utxr array is no more FIFO
        require(getRemainingUTXRCount() == 0, "Cannot change payout period with pending UTXRs");
        payoutPeriod = _payoutPeriod;
    }

    function settle(uint256 batchSize) public onlyManagerOrAdmin {
        if (nextToSettleIdx == utxrs.length) return;

        uint256 endIdx = nextToSettleIdx + batchSize;
        if (endIdx > utxrs.length) {
            endIdx = utxrs.length;
        }

        uint256 count = 0;
        for (uint256 i = nextToSettleIdx; i < endIdx; i++) {
            UTXR storage utxr = utxrs[i];

            if (block.timestamp < utxr.timestamp) {
                break;
            }

            if (utxr.status == RecordStatus.Cancelled) {
                count++;
                continue;
            }

            _processSettlement(utxr);
            count++;
        }

        nextToSettleIdx += count;
    }

    function _processSettlement(UTXR storage utxr) internal {
        if (utxr.ruleTimestamp > 0) {
            Rule memory rule = IRuleManager(ruleManager).getRuleWithTimestamp(utxr.contractAddr, utxr.tokenID, utxr.ruleTimestamp);

            if (rule.recipients.length == 1) {
                _distributeTokens(rule.recipients[0], utxr.amount);
            } else {
                uint256 totalRatio = 0;
                for (uint256 i = 0; i < rule.ratios.length; i++) {
                    totalRatio += rule.ratios[i];
                }

                uint256 distributedAmount = 0;
                for (uint256 i = 0; i < rule.recipients.length - 1; i++) {
                    uint256 shareAmount = (utxr.amount * rule.ratios[i]) / totalRatio;
                    if (shareAmount > 0) {
                        _distributeTokens(rule.recipients[i], shareAmount);
                        distributedAmount += shareAmount;
                    }
                }

                uint256 remainingAmount = utxr.amount - distributedAmount;
                if (remainingAmount > 0) {
                    uint256 lastIndex = rule.recipients.length - 1;
                    _distributeTokens(rule.recipients[lastIndex], remainingAmount);
                }
            }
        } else {
            _distributeTokens(utxr.recipient, utxr.amount);
        }

        utxr.status = RecordStatus.Settled;
        emit Settled(utxr.reqID, utxr.amount, utxr.recipient);
    }

    function _distributeTokens(address recipient, uint256 amount) internal {
        if (ccyType == CurrencyType.ETH) {
            payable(recipient).transfer(amount);
        } else if (ccyType == CurrencyType.ERC20) {
            IERC20(ccyAddr).transfer(recipient, amount);
        } else if (ccyType == CurrencyType.MINTABLES) {
            IMintable(ccyAddr).mint(recipient, amount);
        }
        emit TokenDistributed(recipient, amount, ccyType, ccyAddr);
    }

    function needSettlement() public view returns (bool) {
        if (nextToSettleIdx == utxrs.length) return false;
        return block.timestamp >= utxrs[nextToSettleIdx].timestamp;
    }

    function getRemainingUTXRCount() public view returns (uint256) {
        return utxrs.length - nextToSettleIdx;
    }

    function setRuleManager(address ruleManagerAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(ruleManagerAddress != address(0), "Rule manager cannot be zero address");
        ruleManager = ruleManagerAddress;
        emit RuleManagerSet(ruleManagerAddress);
    }

    function burnTokens(address account, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(ccyAddr != address(0), "Currency address not set");
        ERC20Transferable(ccyAddr).burnFrom(account, amount);
    }

    receive() external payable { }
}
