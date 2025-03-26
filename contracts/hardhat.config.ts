import { type HardhatUserConfig, vars } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-chai-matchers";

const getPrivateKey = (env?: string) => {
  const privateKey = vars.get('PRIVATE_KEY')

  if (privateKey && privateKey !== '') {
    return [privateKey];
  }
  
  console.log('Private Key Not Set! Please set up .env');
  return [];
}

const getAlchemyKey = (): string => {
  const alchemyKey = vars.get('ALCHEMY_KEY')
  if (alchemyKey && alchemyKey !== '') {
    return alchemyKey
  }
  console.log('ALCHEMY_KEY Not Set! Please set up .env')
  return ''
}

const config: HardhatUserConfig = {
  networks: {
    testnet: {
        url: `https://settlus-septestnet.g.alchemy.com/v2/${getAlchemyKey()}`,
        accounts: getPrivateKey(),
        chainId: 5373
    },
    mainnet: {
      url: `https://settlus-mainnet.g.alchemy.com/v2/${getAlchemyKey()}`,
      accounts: getPrivateKey(),
      chainId: 5371
  }
  },
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
      },
    },
  },
  paths: {
    sources: './src',
    tests: './test',
  }
}

export default config
