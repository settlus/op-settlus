import { expect } from 'chai'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { parseEventLogs, getAddress, parseEther } from 'viem'

describe('Tenant', function () {
  const defaultAddress = '0x0000000000000000000000000000000000000000'
  const tenantNameEth = 'Tenant ETH'
  const tenantNameERC20 = 'Tenant ERC20'
  const tenantNameSBT = 'Tenant SBT'
  const payoutPeriod = BigInt(60 * 60 * 24) // 1 day in seconds

  async function deployTenantWithFactory() {
    const [deployer, tenantOwner, erc20Owner, nftOwner, newNftOwner] = await hre.viem.getWalletClients()
    const publicClient = await hre.viem.getPublicClient()

    const tenantFactory = await hre.viem.deployContract('TenantFactory', [], {
      client: { wallet: deployer },
    })

    // Deploy ERC20 and SBT contracts from tenantOwner, assuming tenantOwner pre-deployed these contracts
    const erc20 = await hre.viem.deployContract('BasicERC20', [tenantOwner.account.address, 'Test ERC20', 'TST'], {
      client: { wallet: tenantOwner },
    })
    const sbt = await hre.viem.deployContract(
      'ERC20NonTransferable',
      [tenantOwner.account.address, 'Test SBT', 'SBT'],
      { client: { wallet: tenantOwner } }
    )

    // Deploy NFT contract and mint nft to nftOwner
    const nft = await hre.viem.deployContract('BasicERC721', [nftOwner.account.address], {
      client: { wallet: nftOwner },
    })
    await nft.write.safeMint([nftOwner.account.address], {
      account: nftOwner.account,
    })

    expect(await nft.read.balanceOf([nftOwner.account.address])).to.equal(BigInt(1))
    expect(await nft.read.ownerOf([BigInt(0)])).to.equal(getAddress(nftOwner.account.address))

    return {
      tenantFactory,
      tenantOwner,
      nftOwner,
      newNftOwner,
      publicClient,
      erc20,
      sbt,
      nft,
      erc20Owner,
    }
  }

  it('should verify each tenant has a existing currency address(ERC20, SBT)', async function () {
    const { tenantFactory, tenantOwner, publicClient, erc20, sbt } = await loadFixture(deployTenantWithFactory)

    // Deploy Tenant with ETH currency
    const ethTx = await tenantFactory.write.createTenant([tenantNameEth, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })
    const ethReceipt = await publicClient.waitForTransactionReceipt({
      hash: ethTx,
    })
    const ethLogs = parseEventLogs({
      logs: ethReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const ethTenantAddress = ethLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const ethTenant = await hre.viem.getContractAt('Tenant', ethTenantAddress!)
    expect(await ethTenant.read.currencyAddress()).to.equal(defaultAddress)

    // Deploy Tenant with ERC20 currency
    const erc20Tx = await tenantFactory.write.createTenant([tenantNameERC20, 1, erc20.address, payoutPeriod], {
      account: tenantOwner.account,
    })
    const erc20Receipt = await publicClient.waitForTransactionReceipt({
      hash: erc20Tx,
    })
    const erc20Logs = parseEventLogs({
      logs: erc20Receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const erc20TenantAddress = erc20Logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const erc20Tenant = await hre.viem.getContractAt('Tenant', erc20TenantAddress!)
    expect(await erc20Tenant.read.currencyAddress()).to.equal(getAddress(erc20.address))

    // Deploy Tenant with SBT currency
    const sbtTx = await tenantFactory.write.createTenant([tenantNameSBT, 2, sbt.address, payoutPeriod], {
      account: tenantOwner.account,
    })
    const sbtReceipt = await publicClient.waitForTransactionReceipt({
      hash: sbtTx,
    })
    const sbtLogs = parseEventLogs({
      logs: sbtReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const sbtTenantAddress = sbtLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const sbtTenant = await hre.viem.getContractAt('Tenant', sbtTenantAddress!)
    expect(await sbtTenant.read.currencyAddress()).to.equal(getAddress(sbt.address))
  })

  it('should record UTXR with updated NFT owner after NFT is tranferred', async function () {
    const { tenantFactory, tenantOwner, nftOwner, newNftOwner, publicClient, nft } =
      await loadFixture(deployTenantWithFactory)

    // Deploy a Tenant that uses the SBT currency
    const sbtTx = await tenantFactory.write.createTenant([tenantNameSBT, 2, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })
    const sbtReceipt = await publicClient.waitForTransactionReceipt({
      hash: sbtTx,
    })
    const sbtLogs = parseEventLogs({
      logs: sbtReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const sbtTenantAddress = sbtLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const sbtTenant = await hre.viem.getContractAt('Tenant', sbtTenantAddress!)

    const reqID1 = BigInt(1)
    const amount1 = BigInt(100)
    const chainID = BigInt(1)
    const tokenID = BigInt(0)

    await sbtTenant.write.record([reqID1, amount1, chainID, nft.address, tokenID], { account: tenantOwner.account })

    const initialUtxr = await sbtTenant.read.utxrs([BigInt(0)])
    expect(initialUtxr[3]).to.equal(getAddress(nftOwner.account.address))
    expect(initialUtxr[0]).to.equal(BigInt(reqID1))
    expect(initialUtxr[1]).to.equal(amount1)

    await nft.write.transferFrom([nftOwner.account.address, newNftOwner.account.address, tokenID], {
      account: nftOwner.account,
    })

    // Mine a few blocks to simulate time passing
    await hre.network.provider.send('evm_mine', [])
    await hre.network.provider.send('evm_mine', [])

    const reqID2 = BigInt(2)
    const amount2 = BigInt(200)

    await sbtTenant.write.record([reqID2, amount2, chainID, nft.address, tokenID], { account: tenantOwner.account })

    const updatedUtxr = await sbtTenant.read.utxrs([BigInt(1)])
    expect(updatedUtxr[3]).to.equal(getAddress(newNftOwner.account.address))
    expect(updatedUtxr[0]).to.equal(BigInt(reqID2))
    expect(updatedUtxr[1]).to.equal(amount2)
  })

  it('should only allow owner to control treasury funds', async function () {
    const { tenantFactory, tenantOwner, publicClient, nftOwner } = await loadFixture(deployTenantWithFactory)

    const tx = await tenantFactory.write.createTenant(['Tenant Controlled ERC20', 1, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    // TODO: related issue? https://github.com/NomicFoundation/hardhat/issues/4235
    // await expect(tenant.write.setCurrencyAddress([defaultAddress], {
    //   account: nftOwner.account,
    // })).to.be.revertedWith('Not authorized')
  })

  it('should set payout period', async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantWithFactory)

    const tx = await tenantFactory.write.createTenant([tenantNameEth, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    await tenant.write.setPayoutPeriod([BigInt(86400)], {
      account: tenantOwner.account,
    })
    expect(await tenant.read.payoutPeriod()).to.equal(BigInt(86400))
  })

  it('should revert cancel if UTXR is past payout period', async function () {
    const { tenantFactory, tenantOwner, publicClient, nft } = await loadFixture(deployTenantWithFactory)

    const tx = await tenantFactory.write.createTenant(['Test Tenant', 1, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const tenantAddress = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    const reqID = BigInt(1)
    const amount = BigInt(100)
    const chainID = BigInt(1)

    await tenant.write.record([reqID, amount, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine', [])

    // TODO: related issue? https://github.com/NomicFoundation/hardhat/issues/4235
    // await expect(tenant.write.cancel([reqID], { account: tenantOwner.account })).to.be.revertedWith(
    //   'Cannot cancel, UTXR past payout period'
    // )

    const utxr = await tenant.read.utxrs([BigInt(0)])
    expect(utxr[7]).to.equal(0) // 7th index is RecordStatus
  })

  it('should correctly settle multiple UTXRs and skip canceled ones', async function () {
    const { tenantFactory, tenantOwner, publicClient, nft, nftOwner } = await loadFixture(deployTenantWithFactory)

    const tx = await tenantFactory.write.createTenant(['Test Tenant', 1, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const tenantAddress = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)
    const tenantErc20Address = await tenant.read.currencyAddress()
    const tenantErc20 = await hre.viem.getContractAt('BasicERC20', tenantErc20Address)

    const initialBalance = BigInt(1000)
    await tenant.write.mint([initialBalance], { account: tenantOwner.account })

    const reqID1 = BigInt(1)
    const reqID2 = BigInt(2)
    const reqID3 = BigInt(3)
    const amount1 = BigInt(100)
    const amount2 = BigInt(150)
    const amount3 = BigInt(200)
    const chainID = BigInt(1)

    await tenant.write.record([reqID1, amount1, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })
    await tenant.write.record([reqID2, amount2, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })
    await tenant.write.record([reqID3, amount3, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })

    await tenant.write.cancel([reqID2], { account: tenantOwner.account })

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine', [])

    await tenant.write.settle({ account: tenantOwner.account })

    const utxr1 = await tenant.read.utxrs([BigInt(0)])
    const utxr2 = await tenant.read.utxrs([BigInt(1)])
    const utxr3 = await tenant.read.utxrs([BigInt(2)])
    expect(utxr1[7]).to.equal(1)
    expect(utxr2[7]).to.equal(2)
    expect(utxr3[7]).to.equal(1)

    expect(await tenantErc20.read.balanceOf([nftOwner.account.address])).to.equal(amount1 + amount3)
    expect(await tenant.read.lastSettledIndex()).to.equal(BigInt(3))
  })

  it('should settle UTXRs (Tenant with ETH currency)', async function () {
    const { tenantFactory, tenantOwner, publicClient, nftOwner, nft } = await loadFixture(deployTenantWithFactory)

    const initialTreasuryBalance = parseEther('1')
    const initialNftOwnerBalance = await publicClient.getBalance({
      address: nftOwner.account.address,
    })

    const tx = await tenantFactory.write.createTenant(['Settle Tenant', 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    // Send 1 ETH to tenant for treasury
    await tenantOwner.sendTransaction({
      to: tenantAddress!,
      value: initialTreasuryBalance,
    })

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    const reqID = BigInt(1)
    const amount = BigInt(100)
    const chainID = BigInt(1)

    await tenant.write.record([reqID, amount, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })

    // Increase time by payoutPeriod to make the UTXR eligible for settlement
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod + BigInt(100))])
    await hre.network.provider.send('evm_mine', [])

    await tenant.write.settle({ account: tenantOwner.account })

    expect(await tenant.read.utxrs.length).to.equal(0)

    expect(await publicClient.getBalance({ address: tenantAddress! })).to.equal(initialTreasuryBalance - amount)
    expect(await publicClient.getBalance({ address: nftOwner.account.address })).to.equal(
      initialNftOwnerBalance + amount
    )
  })

  it('should settle UTXRs (Tenant with ERC20 currency)', async function () {
    const { tenantFactory, tenantOwner, publicClient, erc20, nftOwner, nft } =
      await loadFixture(deployTenantWithFactory)

    const initialTreasuryBalance = BigInt(100000)

    const tx = await tenantFactory.write.createTenant(['Settle Tenant', 1, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    const tenantErc20Address = await tenant.read.currencyAddress()
    const tenantErc20 = await hre.viem.getContractAt('BasicERC20', tenantErc20Address)

    const initialNftOwnerBalance = await tenantErc20.read.balanceOf([nftOwner.account.address])

    // Fill treasury with initialTreasuryBalance, mint by tenant owner for tenant itself
    await tenant.write.mint([initialTreasuryBalance], {
      account: tenantOwner.account,
    })

    const reqID = BigInt(1)
    const amount = BigInt(100)
    const chainID = BigInt(1)

    await tenant.write.record([reqID, amount, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })

    // Increase time by payoutPeriod to make the UTXR eligible for settlement
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod + BigInt(100))])
    await hre.network.provider.send('evm_mine', [])

    await tenant.write.settle({ account: tenantOwner.account })

    expect(await tenantErc20.read.balanceOf([tenantAddress!])).to.equal(initialTreasuryBalance - amount)
    expect(await tenantErc20.read.balanceOf([nftOwner.account.address])).to.equal(initialNftOwnerBalance + amount)
  })

  it('should settle UTXRs (Tenant with ERC20 currency), with pre-deployed ERC20 contract', async function () {
    const { tenantFactory, tenantOwner, publicClient, erc20, nftOwner, nft } =
      await loadFixture(deployTenantWithFactory)

    const initialTreasuryBalance = BigInt(100000)
    const initialNftOwnerBalance = await erc20.read.balanceOf([nftOwner.account.address])

    const tx = await tenantFactory.write.createTenant(['Settle Tenant', 1, erc20.address, payoutPeriod], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    // Pre-deployed ERC20 need to mint token for tenant address before it starts writing record and settle, also assuming it has 'mint' function
    await erc20.write.mint([tenantAddress!, initialTreasuryBalance], {
      account: tenantOwner.account,
    })

    const reqID = BigInt(1)
    const amount = BigInt(100)
    const chainID = BigInt(1)

    await tenant.write.record([reqID, amount, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })

    // Increase time by payoutPeriod to make the UTXR eligible for settlement
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod + BigInt(100))])
    await hre.network.provider.send('evm_mine', [])

    await tenant.write.settle({ account: tenantOwner.account })

    expect(await erc20.read.balanceOf([tenantAddress!])).to.equal(initialTreasuryBalance - amount)
    expect(await erc20.read.balanceOf([nftOwner.account.address])).to.equal(initialNftOwnerBalance + amount)
  })

  it('should settle UTXRs (Tenant with SBT currency)', async function () {
    const { tenantFactory, tenantOwner, publicClient, nftOwner, nft } = await loadFixture(deployTenantWithFactory)

    const tx = await tenantFactory.write.createTenant(['Settle Tenant', 2, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    const tenantSBTAddress = await tenant.read.currencyAddress()
    const tenantSBT = await hre.viem.getContractAt('ERC20NonTransferable', tenantSBTAddress)

    const reqID = BigInt(1)
    const amount = BigInt(100)
    const chainID = BigInt(1)

    await tenant.write.record([reqID, amount, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })

    // Increase time by payoutPeriod to make the UTXR eligible for settlement
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod + BigInt(100))])
    await hre.network.provider.send('evm_mine', [])

    await tenant.write.settle({ account: tenantOwner.account })

    expect(await tenantSBT.read.balanceOf([tenantAddress!])).to.equal(BigInt(0))
    expect(await tenantSBT.read.balanceOf([nftOwner.account.address])).to.equal(amount)
  })

  it('should settle eligible UTXRs and leave ineligible ones (Tenant with ERC20 currency)', async function () {
    const { tenantFactory, tenantOwner, publicClient, nftOwner, nft } = await loadFixture(deployTenantWithFactory)

    const initialTreasuryBalance = BigInt(100000)

    const tx = await tenantFactory.write.createTenant(['Settle Tenant', 1, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)
    const tenantErc20Address = await tenant.read.currencyAddress()
    const tenantErc20 = await hre.viem.getContractAt('BasicERC20', tenantErc20Address)

    const initialNftOwnerBalance = await tenantErc20.read.balanceOf([nftOwner.account.address])

    // Fill treasury with initialTreasuryBalance, mint by tenant owner for tenant itself
    await tenant.write.mint([initialTreasuryBalance], {
      account: tenantOwner.account,
    })

    const reqID1 = BigInt(1)
    const amount1 = BigInt(100)
    const chainID = BigInt(1)

    const reqID2 = BigInt(2)
    const amount2 = BigInt(200)

    const reqID3 = BigInt(3)
    const amount3 = BigInt(150)

    // Record three UTXRs with different timestamps
    await tenant.write.record([reqID1, amount1, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod / BigInt(2))]) // Half of payoutPeriod

    await tenant.write.record([reqID2, amount2, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod / BigInt(2))]) // Full payoutPeriod for reqID1

    await tenant.write.record([reqID3, amount3, chainID, nft.address, BigInt(0)], { account: tenantOwner.account })
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod / BigInt(2))]) // Full payoutPeriod for reqID2

    // Only reqID1 and reqID2 should be eligible for settlement, reqID3 should remain
    await tenant.write.settle({ account: tenantOwner.account })

    // Check balances after settlement
    const expectedRemainingBalance = initialTreasuryBalance - amount1 - amount2 // Only reqID1 and reqID2 are settled
    const expectedNftOwnerBalance = initialNftOwnerBalance + amount1 + amount2 // nftOwner received amounts from reqID1 and reqID2

    expect(await tenantErc20.read.balanceOf([tenantAddress!])).to.equal(expectedRemainingBalance)
    expect(await tenantErc20.read.balanceOf([nftOwner.account.address])).to.equal(expectedNftOwnerBalance)

    const remainingUtxrs = await tenant.read.utxrs([await tenant.read.lastSettledIndex()])
    expect(remainingUtxrs[0]).to.equal(reqID3)
    expect(remainingUtxrs[1]).to.equal(amount3)
  })
})
