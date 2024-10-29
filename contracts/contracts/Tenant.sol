// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./BasicERC20.sol";
import "./ERC20NonTransferable.sol";

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract Tenant is Ownable {
    enum CurrencyType {
        ETH,
        ERC20,
        SBT
    }

    struct UTXR {
        uint256 reqID;
        uint256 amount;
        uint256 timestamp;
        address recipient;
        uint256 chainID;
        address contractAddr;
        uint256 tokenID;
    }

    address public factory;
    address public creator;
    string public name;
    CurrencyType public currencyType;
    address public currencyAddress;
    uint256 public payoutPeriod;

    UTXR[] public utxrs;

    constructor(
        address _factory,
        address _owner,
        string memory _name,
        CurrencyType _currencyType,
        address _currencyAddress,
        uint256 _payoutPeriod
    ) Ownable(_owner) {
        factory = _factory;
        creator = _owner;
        name = _name;
        currencyType = _currencyType;
        payoutPeriod = _payoutPeriod;
        if (currencyType == CurrencyType.ETH) {
            currencyAddress = address(0);
        } else {
            currencyAddress = _currencyAddress;
        }
    }

    modifier onlyFactoryOrOwner() {
        require(
            msg.sender == factory || msg.sender == owner(),
            "Not authorized"
        );
        _;
    }

    function setCurrencyAddress(
        address _currencyAddress
    ) external onlyFactoryOrOwner {
        currencyAddress = _currencyAddress;
    }

    function record(
        uint256 reqID,
        uint256 amount,
        uint256 chainID,
        address contractAddr,
        uint256 tokenID
    ) public onlyOwner {
        address nftOwner = IERC721(contractAddr).ownerOf(tokenID);

        UTXR memory newUTXR = UTXR({
            reqID: reqID,
            amount: amount,
            // TODO: receive timestamp from param?
            timestamp: block.timestamp,
            recipient: nftOwner,
            chainID: chainID,
            contractAddr: contractAddr,
            tokenID: tokenID
        });
        utxrs.push(newUTXR);
    }

    function cancel(uint256 reqID) public onlyOwner {
        for (uint256 i = 0; i < utxrs.length; i++) {
            //TODO: we are going to settle and pops the utxrs, need to check here again?
            if (utxrs[i].reqID == reqID) {
                require(
                    block.timestamp < utxrs[i].timestamp + payoutPeriod,
                    "Cannot cancel, UTXR past payout period"
                );
                utxrs[i] = utxrs[utxrs.length - 1];
                utxrs.pop();
                break;
            }
        }
    }

    function getUTXR(uint256 index) public view
        returns (
            uint256 reqID,
            uint256 amount,
            uint256 timestamp,
            address recipient,
            uint256 chainID,
            address contractAddr,
            uint256 tokenID
        )
    {
        UTXR memory utxr = utxrs[index];
        return (
            utxr.reqID,
            utxr.amount,
            utxr.timestamp,
            utxr.recipient,
            utxr.chainID,
            utxr.contractAddr,
            utxr.tokenID
        );
    }

    function setPayoutPeriod(uint256 _payoutPeriod) external onlyOwner {
        require(_payoutPeriod > 0, "Payout period must be greater than zero");
        payoutPeriod = _payoutPeriod;
    }

    function settle() public onlyFactoryOrOwner {
        for (uint256 i = 0; i < utxrs.length; ) {
            UTXR memory utxr = utxrs[i];
            if (block.timestamp >= utxr.timestamp + payoutPeriod) {
                if (currencyType == CurrencyType.ETH) {
                    payable(utxr.recipient).transfer(utxr.amount);
                } else if (currencyType == CurrencyType.ERC20) {
                    BasicERC20(currencyAddress).transfer(
                        utxr.recipient,
                        utxr.amount
                    );
                } else if (currencyType == CurrencyType.SBT) {
                    ERC20NonTransferable(currencyAddress).mint(
                        utxr.recipient,
                        utxr.amount
                    );
                }

                // gas efficient way to remove element from array
                utxrs[i] = utxrs[utxrs.length - 1];
                utxrs.pop();
            } else {
                i++;
            }
        }
    }

    receive() external payable {}
}
