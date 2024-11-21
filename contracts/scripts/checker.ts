import '../env'
import addresses from './contract-addresses.json'
import hre from 'hardhat'
import { formatEther } from 'viem'

async function main() {
  const tm = await hre.ethers.getContractAt('TenantManager', addresses.tenantManagerProxy)
  const tenants = await tm.getTenantAddresses({ gasLimit: 100000000 })

  // Check each tenant's lastSettledIndex and treasury balance
  for (const tenantAddress of tenants) {
    try {
      const tenant = await hre.ethers.getContractAt('Tenant', tenantAddress)
      const lastSettledIdx = await tenant.lastSettledIdx()
      const utxrLength = await tenant.getUtxrsLength()
      const treasuryBalance = await hre.ethers.provider.getBalance(tenantAddress)
      const tenantCcy = await tenant.ccyAddr()
      const ccyContract = await hre.ethers.getContractAt('ERC20NonTransferable', tenantCcy)
      const ownerBalance = await ccyContract.balanceOf(process.env.NFT_OWNER!)
      // const settleAllTx = await tm.settleAll({ gasLimit: 10000000, gasPrice: 1000000 });
      // console.log('Transaction hash:', settleAllTx.hash);

      // const receipt = await settleAllTx.wait();
      // console.log('Transaction mined in block:', receipt.blockNumber);

      // const events = receipt.events;
      // if (events) {
      //   events.forEach((event) => {
      //     if (event.event === 'TenantAddressesLength') {
      //       console.log(`TenantAddressesLength Event: Tenant number: ${event.args?.[0]}`);
      //     } else if (event.event === 'TenantSettled') {
      //       console.log(`TenantSettled Event: Tenant Address: ${event.args?.[0]}`);
      //     } else if (event.event === 'SettleFailed') {
      //       console.log(`SettleFailed Event: Tenant Address: ${event.args?.[0]}`);
      //     }
      //   });
      // }
      console.log(
        `Tenant: ${tenantAddress}, UTXR length: ${utxrLength}, Last Settled Index: ${lastSettledIdx}, Treasury Balance (ETH): ${formatEther(treasuryBalance)}, Owner Balance: ${formatEther(ownerBalance)}`
      )
    } catch (error) {
      console.error(`Error fetching data for tenant: ${tenantAddress}`, error)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
