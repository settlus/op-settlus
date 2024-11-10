import { expect } from 'chai'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { parseEventLogs, getAddress, zeroAddress } from 'viem'

describe('TenantFactory Proxy', function () {
  const tenantName = 'SampleTenant'
  const payoutPeriod = BigInt(60 * 60 * 24)

  async function deployTenantFactoryProxyFixture() {
    const [deployer, tenantOwner] = await hre.viem.getWalletClients()
    const publicClient = await hre.viem.getPublicClient()

    const tenantFactoryImplementation = await hre.viem.deployContract('TenantFactory', [], {
      client: { wallet: deployer },
    })

    const tenantFactoryProxy = await hre.viem.deployContract(
      'TenantFactoryProxy',
      [tenantFactoryImplementation.address, deployer.account.address, '0x'],
      {
        client: { wallet: deployer },
      }
    )

    const tenantFactory = await hre.viem.getContractAt('TenantFactory', tenantFactoryProxy.address)
    await tenantFactory.write.initialize([deployer.account.address], { account: deployer.account })

    return { deployer, tenantFactory, tenantOwner, publicClient }
  }

  it('should initialize the TenantFactory through the proxy', async function () {
    const { tenantFactory, deployer } = await loadFixture(deployTenantFactoryProxyFixture)
    const owner = await tenantFactory.read.owner()
    expect(owner).to.equal(getAddress(deployer.account.address))
  })

  it('should create a Tenant contract via the proxy and emit an event', async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryProxyFixture)

    const tx = await tenantFactory.write.createTenant([tenantName, 0, zeroAddress, payoutPeriod], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })

    expect(logs.find((log) => log.eventName === 'TenantCreated')).to.not.be.undefined
    expect(logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantName).to.equal(tenantName)
  })

  it('should settle all tenants via the proxy, handling failed settlements gracefully', async function () {
    const { tenantFactory, deployer } = await loadFixture(deployTenantFactoryProxyFixture)

    await tenantFactory.write.settleAll({ account: deployer.account })
  })
})
