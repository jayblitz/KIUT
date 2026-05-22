// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title KiutSoulbound — non-transferable ERC-721 identity token
/// @notice One token per verified Kraken + Inkonchain user wallet.
///         Minting requires an off-chain signature from the authorised minter wallet.
///         Each authorisation is single-use (nonce consumed on mint).
contract KiutSoulbound is ERC721, Ownable {
    using ECDSA for bytes32;

    uint256 private _nextTokenId = 1;

    /// @notice Wallet authorised to sign mint permissions (backend key)
    address public minterSigner;

    /// @notice Receives the mint fee on every successful mint
    address public feeRecipient;

    /// @notice Fee in wei required to mint (payable to feeRecipient)
    uint256 public mintFee;

    /// @notice Tracks which wallets have already minted
    mapping(address => bool) public hasMinted;

    /// @notice Tracks which nonces have been consumed (replay protection)
    mapping(bytes32 => bool) public usedNonces;

    event Minted(address indexed to, uint256 indexed tokenId);
    event MintFeeUpdated(uint256 newFee);
    event FeeRecipientUpdated(address newRecipient);
    event MinterSignerUpdated(address newSigner);

    error AlreadyMinted();
    error InsufficientFee();
    error InvalidSignature();
    error NonceAlreadyUsed();
    error TransferNotAllowed();
    error FeeTransferFailed();

    constructor(
        address _minterSigner,
        address _feeRecipient,
        uint256 _mintFee
    ) ERC721("KIUT Soulbound Token", "KIUT") Ownable(msg.sender) {
        minterSigner = _minterSigner;
        feeRecipient = _feeRecipient;
        mintFee = _mintFee;
    }

    // ─── Soulbound: block all transfers (allow mint/burn only) ───────────────

    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert TransferNotAllowed();
        }
        return super._update(to, tokenId, auth);
    }

    // ─── Mint ────────────────────────────────────────────────────────────────

    /// @notice Mint a soulbound KIUT token.
    /// @param nonce    Single-use bytes32 nonce issued by the backend.
    /// @param signature Backend-signed EIP-191 authorisation over
    ///        keccak256(abi.encodePacked(address(this), msg.sender, nonce))
    function mint(bytes32 nonce, bytes calldata signature) external payable {
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        if (msg.value < mintFee) revert InsufficientFee();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();

        // Verify the backend authorisation signature
        bytes32 hash = keccak256(abi.encodePacked(address(this), msg.sender, nonce));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        address signer = ECDSA.recover(ethHash, signature);
        if (signer != minterSigner) revert InvalidSignature();

        // Consume nonce first (checks-effects-interactions)
        usedNonces[nonce] = true;
        hasMinted[msg.sender] = true;

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        // Forward fee to recipient
        if (msg.value > 0) {
            (bool ok, ) = feeRecipient.call{value: msg.value}("");
            if (!ok) revert FeeTransferFailed();
        }

        emit Minted(msg.sender, tokenId);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setMintFee(uint256 _mintFee) external onlyOwner {
        mintFee = _mintFee;
        emit MintFeeUpdated(_mintFee);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function setMinterSigner(address _minterSigner) external onlyOwner {
        minterSigner = _minterSigner;
        emit MinterSignerUpdated(_minterSigner);
    }

    // ─── Token URI ───────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string(
            abi.encodePacked(
                "https://kiut.xyz/nft/metadata/",
                Strings.toString(tokenId)
            )
        );
    }
}
