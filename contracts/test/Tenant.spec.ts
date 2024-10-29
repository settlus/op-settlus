import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Tenant$Type } from "../artifacts/contracts/Tenant.sol/Tenant";
import { parseEventLogs, getAddress } from "viem";

describe("Tenant", function () {
    const defaultAddress = "0x0000000000000000000000000000000000000000";
    const tenantNameEth = "Tenant ETH";
    const tenantNameERC20 = "Tenant ERC20";
    const tenantNameSBT = "Tenant SBT";
    const payoutPeriod = BigInt(60 * 60 * 24); // 1 day in seconds

    async function deployTenantWithFactory() {
        const [deployer, tenantOwner, erc20Owner, sbtOwner, nftOwner, newNftOwner] = await hre.viem.getWalletClients();
        const publicClient = await hre.viem.getPublicClient();

        const tenantFactory = await hre.viem.deployContract(
            "TenantFactory",
            [],
            { client: { wallet: deployer } }
        );

        const erc20 = await hre.viem.deployContract("BasicERC20", [erc20Owner.account.address, "Test ERC20", "TST"], { client: { wallet: erc20Owner } });
        const sbt = await hre.viem.deployContract("ERC20NonTransferable", [sbtOwner.account.address, "Test SBT", "SBT"], { client: { wallet: sbtOwner } });

        // Deploy NFT contract and mint nft to nftOwner
        const nft = await hre.viem.deployContract("BasicERC721", [nftOwner.account.address], { client: { wallet: nftOwner } });
        await nft.write.safeMint([nftOwner.account.address], { account: nftOwner.account });

        expect(await nft.read.balanceOf([nftOwner.account.address])).to.equal(BigInt(1));
        expect(await nft.read.ownerOf([BigInt(0)])).to.equal(getAddress(nftOwner.account.address));

        return { tenantFactory, tenantOwner, nftOwner, newNftOwner, publicClient, erc20, sbt, nft };
    }

    it("should verify each tenant has a existing currency address(ERC20, SBT)", async function () {
        const { tenantFactory, tenantOwner, publicClient, erc20, sbt } = await loadFixture(deployTenantWithFactory);

        // Deploy Tenant with ETH currency
        const ethTx = await tenantFactory.write.createTenant(
            [tenantNameEth, 0, defaultAddress, payoutPeriod],
            { account: tenantOwner.account }
        );
        const ethReceipt = await publicClient.waitForTransactionReceipt({ hash: ethTx });
        const ethLogs = parseEventLogs({ logs: ethReceipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
        const ethTenantAddress = ethLogs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;

        const ethTenant = await hre.viem.getContractAt("Tenant", ethTenantAddress!);
        expect(await ethTenant.read.currencyAddress()).to.equal(defaultAddress);

        // Deploy Tenant with ERC20 currency
        const erc20Tx = await tenantFactory.write.createTenant(
            [tenantNameERC20, 1, erc20.address, payoutPeriod],
            { account: tenantOwner.account }
        );
        const erc20Receipt = await publicClient.waitForTransactionReceipt({ hash: erc20Tx });
        const erc20Logs = parseEventLogs({ logs: erc20Receipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
        const erc20TenantAddress = erc20Logs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;

        const erc20Tenant = await hre.viem.getContractAt("Tenant", erc20TenantAddress!);
        expect(await erc20Tenant.read.currencyAddress()).to.equal(getAddress(erc20.address));

        // Deploy Tenant with SBT currency
        const sbtTx = await tenantFactory.write.createTenant(
            [tenantNameSBT, 2, sbt.address, payoutPeriod],
            { account: tenantOwner.account }
        );
        const sbtReceipt = await publicClient.waitForTransactionReceipt({ hash: sbtTx });
        const sbtLogs = parseEventLogs({ logs: sbtReceipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
        const sbtTenantAddress = sbtLogs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;

        const sbtTenant = await hre.viem.getContractAt("Tenant", sbtTenantAddress!);
        expect(await sbtTenant.read.currencyAddress()).to.equal(getAddress(sbt.address));
    });

    it("should record UTXR with updated NFT owner", async function () {
      const { tenantFactory, tenantOwner, nftOwner, newNftOwner, publicClient, nft } = await loadFixture(deployTenantWithFactory);
  
      // Deploy a Tenant that uses the SBT currency
      const sbtTx = await tenantFactory.write.createTenant(
          [tenantNameSBT, 2, defaultAddress, payoutPeriod],
          { account: tenantOwner.account }
      );
      const sbtReceipt = await publicClient.waitForTransactionReceipt({ hash: sbtTx });
      const sbtLogs = parseEventLogs({ logs: sbtReceipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
      const sbtTenantAddress = sbtLogs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;
  
      const sbtTenant = await hre.viem.getContractAt("Tenant", sbtTenantAddress!);
  
      // First record with the initial NFT owner
      const reqID1 = BigInt(1);
      const amount1 = BigInt(100);
      const chainID = BigInt(1);
      const tokenID = BigInt(0); // Assuming tokenID 0 for the first NFT
  
      await sbtTenant.write.record(
          [reqID1, amount1, chainID, nft.address, tokenID],
          { account: tenantOwner.account }
      );
  
      // Verify that the first UTXR record is correctly written with the initial NFT owner
      const initialUtxr = await sbtTenant.read.utxrs([BigInt(0)]);
      expect(initialUtxr[3]).to.equal(getAddress(nftOwner.account.address));
      expect(initialUtxr[0]).to.equal(BigInt(reqID1));
      expect(initialUtxr[1]).to.equal(amount1);
  
      // Simulate an NFT transfer to newNftOwner
      await nft.write.transferFrom([nftOwner.account.address, newNftOwner.account.address, tokenID], {
          account: nftOwner.account,
      });
  
      // Mine a few blocks to simulate time passing
      await hre.network.provider.send("evm_mine", []);
      await hre.network.provider.send("evm_mine", []);
  
      // Record a new UTXR after the ownership change
      const reqID2 = BigInt(2);
      const amount2 = BigInt(200);
      
      await sbtTenant.write.record(
          [reqID2, amount2, chainID, nft.address, tokenID],
          { account: tenantOwner.account }
      );
  
      // Verify that the new UTXR record is correctly written with the new NFT owner
      const updatedUtxr = await sbtTenant.read.utxrs([BigInt(1)]);
      expect(updatedUtxr[3]).to.equal(getAddress(newNftOwner.account.address));
      expect(updatedUtxr[0]).to.equal(BigInt(reqID2));
      expect(updatedUtxr[1]).to.equal(amount2);
  });

    it("should allow only owner to control treasury funds", async function () {
        const { tenantFactory, tenantOwner, publicClient, erc20, nftOwner } = await loadFixture(deployTenantWithFactory);

        // Deploy Tenant with ERC20 and attempt unauthorized access
        const tx = await tenantFactory.write.createTenant(
            ["Controlled Tenant", 1, erc20.address, payoutPeriod],
            { account: tenantOwner.account }
        );
        const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
        const logs = parseEventLogs({ logs: receipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
        const tenantAddress = logs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;

        const tenant = await hre.viem.getContractAt("Tenant", tenantAddress!);

        // Try calling treasury control function as non-owner, expect revert
        await expect(
            tenant.write.setCurrencyAddress([defaultAddress], { account: nftOwner.account })
        ).to.rejectedWith("Only owner can call this function");
    });

    it("should check set payout period", async function () {
        const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantWithFactory);

        const tx = await tenantFactory.write.createTenant(
            [tenantNameEth, 0, defaultAddress, payoutPeriod],
            { account: tenantOwner.account }
        );
        const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
        const logs = parseEventLogs({ logs: receipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
        const tenantAddress = logs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;

        const tenant = await hre.viem.getContractAt("Tenant", tenantAddress!);

        await tenant.write.setPayoutPeriod([BigInt(86400)], { account: tenantOwner.account });
        expect(await tenant.read.payoutPeriod()).to.equal(BigInt(86400));
    });
});
