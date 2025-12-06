// genKeys.js
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

const keyPair = nacl.sign.keyPair();
const publicKeyBase64 = util.encodeBase64(keyPair.publicKey);
const secretKeyBase64 = util.encodeBase64(keyPair.secretKey);

console.log('PUBLIC KEY (base64):', publicKeyBase64);
console.log('SECRET KEY (base64):', secretKeyBase64);

