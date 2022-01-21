// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract OpenDAOMembershipNFT is ERC1155, Ownable {
    mapping(address => bool) public _claimed;
    bytes32 public _markleRoot;
    uint256 public _claimEndTime;

    constructor(bytes32 root, uint256 claimEndTime) ERC1155("") {
        _markleRoot = root;
        _claimEndTime = claimEndTime;
    }

    function claimMembershipNFTs(uint8 tier, bytes32[] memory proof) external {
        require(block.timestamp < _claimEndTime, "OpenDAOMembershipNFT: Claim period is over");
        require(!_claimed[msg.sender], "OpenDAOMembershipNFT: Already claimed");

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, tier));
        require(MerkleProof.verify(proof, _markleRoot, leaf), "OpenDAOMembershipNFT: Invalid Markle Proof");

        _claimed[msg.sender] = true;

        if (tier == 0) _mint(msg.sender, 0, 1, "");
        if (tier <= 1) _mint(msg.sender, 1, 1, "");
        if (tier <= 2) _mint(msg.sender, 2, 1, "");
        if (tier <= 3) _mint(msg.sender, 3, 1, "");
    }

    function setURI(string memory newUri) external onlyOwner {
        _setURI(newUri);
    }

    function setClaimEndTime(uint256 newEndTime) external onlyOwner {
        _claimEndTime = newEndTime;
    }

    function setMarkleRoot(bytes32 newRoot) external onlyOwner {
        _markleRoot = newRoot;
    }
}
