import { type HardhatUserConfig, vars } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-chai-matchers";

//https://docs.optimism.io/chain/testing/dev-node#additional-info
const OP_PRIVATE_KEY = ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6']

const getEndpoint = () => {
  const endpointUrl = vars.get('ENDPOINT_URL')
  if (endpointUrl && endpointUrl !== '') {
    return endpointUrl
  }
  console.log('ENDPOINT_URL Not Set! Please set up .env')
  return ''
}

const getPrivateKey = (env?: string) => {
  const privateKey = vars.get('PRIVATE_KEY')

  if (env === 'local') {
    return OP_PRIVATE_KEY;
  }

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
    local: {
      url: getEndpoint(),
      accounts: getPrivateKey('local'),
      chainId: 901,
    },
    settlus: {
      url: 'http://3.38.163.215:8545',
      accounts: getPrivateKey(),
      chainId: 5372
    },
    conduit: {
      url: 'https://rpc-settlus-testnet-nw9b4xdc7r.t.conduit.xyz',
      accounts: getPrivateKey(),
      chainId: 53722735
    },
    alchemy: {
        url: `https://settlus-septestnet.g.alchemy.com/v2/${getAlchemyKey()}`,
        accounts: getPrivateKey(),
        chainId: 5373
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
