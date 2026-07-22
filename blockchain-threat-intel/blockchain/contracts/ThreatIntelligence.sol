// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * ThreatIntelligence.sol
 * ------------------------------------------------------------
 * A simple smart contract that lets REGISTERED organizations
 * publish cyber threat intelligence reports to the blockchain.
 *
 * What actually goes ON-CHAIN (cheap, small, immutable):
 *   - reportHash  -> SHA-256 hash of the full report JSON
 *   - ipfsHash    -> CID pointing to the full report stored on IPFS
 *   - organization-> name/address of the org that submitted it
 *   - timestamp   -> block time when it was added
 *
 * The full report content (description, IOCs, mitigation steps, etc.)
 * lives off-chain in MongoDB + IPFS. The blockchain only stores the
 * "fingerprint" (hash) so that anyone can later PROVE the report was
 * not tampered with, without paying gas to store large text.
 * ------------------------------------------------------------
 */
contract ThreatIntelligence {

    address public admin;

    // ---- Data structures -------------------------------------------------

    struct Report {
        string reportHash;     // SHA-256 hash of the full report (integrity fingerprint)
        string ipfsHash;       // IPFS CID of the full report JSON
        string organization;   // Name of the submitting organization
        address submitter;     // Wallet address that submitted it
        uint256 timestamp;     // Block timestamp
        bool exists;           // Helper flag for existence checks
    }

    // All reports, in submission order
    Report[] private reports;

    // Quick lookup: reportHash -> index in `reports` array (for verifyReport)
    mapping(string => uint256) private hashToIndex;
    mapping(string => bool) private hashSubmitted;

    // Registered organizations allowed to submit reports
    mapping(address => bool) public registeredOrganizations;
    mapping(address => string) public organizationNames;

    // ---- Events ------------------------------------------------------------

    event OrganizationRegistered(address indexed org, string name);
    event ThreatReportAdded(
        uint256 indexed index,
        string reportHash,
        string ipfsHash,
        string organization,
        uint256 timestamp
    );

    // ---- Modifiers ----------------------------------------------------------

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier onlyRegisteredOrg() {
        require(registeredOrganizations[msg.sender], "Organization not registered on-chain");
        _;
    }

    // ---- Constructor ----------------------------------------------------------

    constructor() {
        admin = msg.sender;
    }

    // ---- Admin functions --------------------------------------------------

    /**
     * Registers an organization's wallet address so it is allowed
     * to submit threat reports. In this prototype the backend server
     * calls this once when a new organization completes registration.
     */
    function registerOrganization(address orgAddress, string memory name) public onlyAdmin {
        require(!registeredOrganizations[orgAddress], "Organization already registered");
        registeredOrganizations[orgAddress] = true;
        organizationNames[orgAddress] = name;
        emit OrganizationRegistered(orgAddress, name);
    }

    // ---- Core functions -----------------------------------------------------

    /**
     * Adds a new threat report fingerprint to the blockchain.
     * Only callable by a registered organization.
     */
    function addThreatReport(
        string memory reportHash,
        string memory ipfsHash,
        string memory organization
    ) public onlyRegisteredOrg returns (uint256) {
        require(bytes(reportHash).length > 0, "reportHash required");
        require(bytes(ipfsHash).length > 0, "ipfsHash required");
        require(!hashSubmitted[reportHash], "This report hash already exists (duplicate/tamper attempt)");

        reports.push(Report({
            reportHash: reportHash,
            ipfsHash: ipfsHash,
            organization: organization,
            submitter: msg.sender,
            timestamp: block.timestamp,
            exists: true
        }));

        uint256 newIndex = reports.length - 1;
        hashToIndex[reportHash] = newIndex;
        hashSubmitted[reportHash] = true;

        emit ThreatReportAdded(newIndex, reportHash, ipfsHash, organization, block.timestamp);
        return newIndex;
    }

    /**
     * Returns all threat reports stored on-chain.
     * (Fine for a prototype/demo; for production with many records,
     * paginate using getReportCount()/getReportByIndex()).
     */
    function getThreatReports() public view returns (Report[] memory) {
        return reports;
    }

    function getReportCount() public view returns (uint256) {
        return reports.length;
    }

    function getReportByIndex(uint256 index) public view returns (Report memory) {
        require(index < reports.length, "Index out of range");
        return reports[index];
    }

    /**
     * Verifies that a given reportHash exists on-chain and returns
     * its stored details. Used by the "Verify Report" feature to prove
     * a report hasn't been tampered with: the backend recomputes the
     * SHA-256 hash of the report currently in the database/IPFS and
     * compares it against what's returned here.
     */
    function verifyReport(string memory reportHash)
        public
        view
        returns (bool found, string memory ipfsHash, string memory organization, uint256 timestamp)
    {
        if (!hashSubmitted[reportHash]) {
            return (false, "", "", 0);
        }
        Report memory r = reports[hashToIndex[reportHash]];
        return (true, r.ipfsHash, r.organization, r.timestamp);
    }
}
