import keyEncoder from 'key-encoder'


function main() {
    const k = new keyEncoder('secp256k1')
    const key = k.encodePrivate('193601f5f0e52a6dc9c5cfc5b9fa789fd12a00e524505b3ae9a50cbefada4937', 'raw', 'pem')
    console.log(key)
}

main()