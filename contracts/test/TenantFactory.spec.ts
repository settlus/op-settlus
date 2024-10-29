import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { parseEventLogs, getAddress } from "viem";

describe("TenantFactory", function () {
  const tenantName = "SampleTenant";
  const tenantNameEth = "Tenant ETH";
  const tenantNameERC20 = "Tenant ERC20";
  const tenantNameSBT = "Tenant SBT";
  const defaultAddress = '0x0000000000000000000000000000000000000000'
  const payoutPeriod = 60 * 60 * 24; // 1 day in seconds

  async function deployTenantFactoryFixture() {
    const [ deployer, tenantOwner, erc20Owner, sbtOwner ] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    const erc20 = await hre.viem.deployContract("BasicERC20", [erc20Owner.account.address, "Test ERC20", "TST"], { client: { wallet: erc20Owner } });
    const sbt = await hre.viem.deployContract("ERC20NonTransferable", [sbtOwner.account.address, "Test SBT", "SBT"], { client: { wallet: sbtOwner } });

    const tenantFactory = await hre.viem.deployContract(
      "TenantFactory",
      [],
      {
        client: { wallet: deployer }
      }
    );

    return { tenantFactory, deployer, tenantOwner, publicClient, erc20, sbt };
  }

  it("should deploy the TenantFactory contract as a deployer", async function () {
    const { tenantFactory, deployer } = await loadFixture(deployTenantFactoryFixture);

    expect(await tenantFactory.read.owner()).to.equal(getAddress(deployer.account.address));
  })

  it("should create a Tenant contract with correct parameters and emit event", async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryFixture);

    const tx = await tenantFactory.write.createTenant([tenantName, 0, defaultAddress, BigInt(payoutPeriod)], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    const logs = parseEventLogs({logs: receipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi});

    expect(await logs.find((log) => log.eventName === "TenantCreated")).to.not.be.undefined;
    expect((await logs.find((log) => log.eventName === "TenantCreated")?.args.tenantName)).to.equal(tenantName);
  });

  it("should deploy three Tenants with different currency types", async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryFixture);

    // Tenant with ETH currency
    const ethTx = await tenantFactory.write.createTenant(
        [tenantNameEth, 0, defaultAddress, BigInt(payoutPeriod)],
        { account: tenantOwner.account }
    );
    const ethReceipt = await publicClient.waitForTransactionReceipt({ hash: ethTx });
    const ethLogs = parseEventLogs({ logs: ethReceipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
    const ethTenantAddress = ethLogs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;

    // Tenant with ERC20 currency, with new ERC20 contract
    const erc20Tx = await tenantFactory.write.createTenant(
        [tenantNameERC20, 1, defaultAddress, BigInt(payoutPeriod)],
        { account: tenantOwner.account }
    );
    const erc20Receipt = await publicClient.waitForTransactionReceipt({ hash: erc20Tx });
    const erc20Logs = parseEventLogs({ logs: erc20Receipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
    const erc20TenantAddress = erc20Logs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;

    // Tenant with SBT currency, with new SBT contract
    const sbtTx = await tenantFactory.write.createTenant(
        [tenantNameSBT, 2, defaultAddress, BigInt(payoutPeriod)],
        { account: tenantOwner.account }
    );
    const sbtReceipt = await publicClient.waitForTransactionReceipt({ hash: sbtTx });
    const sbtLogs = parseEventLogs({ logs: sbtReceipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
    const sbtTenantAddress = sbtLogs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;

    expect(ethTenantAddress).to.be.a("string");
    expect(erc20TenantAddress).to.be.a("string");
    expect(sbtTenantAddress).to.be.a("string");
});

it("should verify compatibility with reused ERC20 and SBT contracts", async function () {
  const { tenantFactory, tenantOwner, publicClient, erc20 } = await loadFixture(deployTenantFactoryFixture);

  const tx = await tenantFactory.write.createTenant(
      ["Reused ERC20 Tenant", 1, erc20.address, BigInt(payoutPeriod)],
      { account: tenantOwner.account }
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  const logs = parseEventLogs({ logs: receipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi });
  const reusedTenantAddress = logs.find((log) => log.eventName === "TenantCreated")?.args.tenantAddress;

  expect(reusedTenantAddress).to.be.a("string");
});

  it("should store the Tenant address in the tenants array and mapping", async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryFixture);

    const payoutPeriod = 60 * 60 * 24; // 1 day in seconds
    const tx = await tenantFactory.write.createTenant([tenantName, 0, defaultAddress, BigInt(payoutPeriod)], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    const logs = parseEventLogs({logs: receipt.logs, abi: hre.artifacts.readArtifactSync("TenantFactory").abi});

    const tenantAddress = (await logs.find((log) => log.eventName === "TenantCreated"))?.args.tenantAddress;

    const tenantAddresses = await tenantFactory.read.getTenantAddresses();
    const fromTenantMap = await tenantFactory.read.tenants([tenantName])

    expect(tenantAddresses).to.include(tenantAddress);
    expect(fromTenantMap).to.equal(tenantAddress);
  });
});